import {AppState} from 'react-native';
import {
  createTaskApi,
  deleteTaskApi,
  fetchTasks,
  toggleTaskApi,
  updateTaskApi,
} from '../api/tasks';
import {ApiError} from '../api/client';
import {readCache, writeCache} from './localTaskCache';
import {withCacheLock} from './lock';
import {
  listQueue,
  remapTaskId,
  removeMutation,
  removeMutations,
  type QueuedMutation,
} from './mutationQueue';
import {isOnline, subscribeToConnectivity} from './networkStatus';
import type {Task} from '../types/task';

const DEBOUNCE_MS = 500;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

let inFlight: Promise<void> | null = null;
let rerunRequested = false;

// Bumped by cancelPendingSync() (logout / dead session). A pass started under
// an older epoch stops before its next cache write, so a sync that was
// mid-flight can't repopulate a cache that was just cleared.
let epoch = 0;

// Temp id -> real id for every create drained in this JS runtime. The UI can
// still be holding a temp id for a moment after drain remaps it (until the
// onCacheSynced refresh lands); taskStorage resolves ids through this so a
// tap on that row isn't aimed at a dead id.
const idAliases = new Map<string, string>();

export function resolveTaskId(id: string): string {
  return idAliases.get(id) ?? id;
}

type CacheListener = () => void;
const cacheListeners = new Set<CacheListener>();

/**
 * Called whenever a sync pass has written to localTaskCache, so
 * taskStorage can re-read it and push the result to its listeners.
 */
export function onCacheSynced(listener: CacheListener): () => void {
  cacheListeners.add(listener);
  return () => {
    cacheListeners.delete(listener);
  };
}

function emitCacheSynced(): void {
  cacheListeners.forEach(l => l());
}

export function scheduleSync(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    syncNow().catch(() => {});
  }, DEBOUNCE_MS);
}

export function cancelPendingSync(): void {
  epoch++;
  idAliases.clear();
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

/**
 * Single-flight: a call made while a pass is running doesn't start a second,
 * concurrent pass (which would send the same queued create twice). It asks
 * for one more pass after the current one instead, so anything enqueued
 * mid-pass still goes out.
 */
export function syncNow(): Promise<void> {
  if (inFlight) {
    rerunRequested = true;
    return inFlight;
  }
  inFlight = (async () => {
    try {
      do {
        rerunRequested = false;
        await runSyncPass();
      } while (rerunRequested);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

async function runSyncPass(): Promise<void> {
  if (!(await isOnline())) {
    return;
  }
  const passEpoch = epoch;
  const cancelled = () => epoch !== passEpoch;

  const server = await fetchTasks();
  if (cancelled()) {
    return;
  }
  const serverById = new Map(server.map(t => [t.id, t]));

  const queue = await listQueue();
  const toDrop = queue.filter(m => {
    if (m.type !== 'update' && m.type !== 'toggle') {
      return false;
    }
    const serverTask = serverById.get(m.taskId);
    return Boolean(serverTask && serverTask.updatedAt > m.clientTimestamp);
  });
  if (toDrop.length > 0) {
    await removeMutations(toDrop.map(m => m.id));
  }
  const droppedIds = new Set(toDrop.map(m => m.id));
  const survivingQueue = queue.filter(m => !droppedIds.has(m.id));

  const {stoppedEarly, touchedTaskIds} = await drainQueue(
    survivingQueue,
    cancelled,
  );

  if (!stoppedEarly && !cancelled()) {
    await reconcile(server, touchedTaskIds, cancelled);
  }
  if (!cancelled()) {
    emitCacheSynced();
  }
}

interface DrainResult {
  /** True if draining stopped early on a transient failure or cancellation. */
  stoppedEarly: boolean;
  /**
   * Final (post-remap) ids of every task drain successfully created,
   * updated, deleted, or toggled this pass. `reconcile` needs this to know
   * which tasks' fresh values live in the just-written `localTaskCache`
   * rather than in the `server` pull — that pull happened BEFORE draining,
   * so for anything drain just touched, it's stale and must not overwrite
   * drain's result.
   */
  touchedTaskIds: Set<string>;
}

/**
 * Iterates over a mutable copy of `queue` (not `for...of` on the original)
 * because a successful `create` remaps its temp id going forward: any later
 * entry in this SAME pass that still references the old temp id must be
 * updated in memory too, not just in persisted storage — otherwise a
 * `toggle` queued right after its `create` would be sent with the now-dead
 * temp id instead of the real server id.
 */
async function drainQueue(
  queue: QueuedMutation[],
  cancelled: () => boolean,
): Promise<DrainResult> {
  const pending = [...queue];
  const touchedTaskIds = new Set<string>();
  for (let i = 0; i < pending.length; i++) {
    if (cancelled()) {
      return {stoppedEarly: true, touchedTaskIds};
    }
    const mutation = pending[i];
    let updated: Task | void;
    try {
      updated = await sendMutation(mutation);
    } catch (err) {
      if (isTransient(err)) {
        // Stop, and retry this and everything after it next time.
        return {stoppedEarly: true, touchedTaskIds};
      }
      // A definitive rejection (validation error, 404 because it was
      // deleted elsewhere): it cannot succeed by retrying unchanged. Drop
      // it, and leave the task untouched so reconcile takes the server's
      // copy rather than keeping the rejected optimistic one.
      await removeMutation(mutation.id);
      continue;
    }
    if (cancelled()) {
      return {stoppedEarly: true, touchedTaskIds};
    }

    await withCacheLock(async () => {
      await removeMutation(mutation.id);
      // The user may have changed this task again while this request was in
      // flight. The local row already shows that newer change; overwriting
      // it with this (older) response would flicker it back until the later
      // mutation drains.
      const laterQueued = (await listQueue()).some(
        m => m.taskId === mutation.taskId,
      );
      const response = updated;
      if (mutation.type === 'create' && response) {
        idAliases.set(mutation.taskId, response.id);
        await remapTaskId(mutation.taskId, response.id);
        await replaceTaskIdInCache(mutation.taskId, local =>
          laterQueued ? {...local, id: response.id} : response,
        );
      } else if (response && !laterQueued) {
        await replaceTaskIdInCache(response.id, () => response);
      } else if (mutation.type === 'delete') {
        await removeTaskFromCache(mutation.taskId);
      }
    });

    if (mutation.type === 'create' && updated) {
      touchedTaskIds.add(updated.id);
      for (let j = i + 1; j < pending.length; j++) {
        if (pending[j].taskId === mutation.taskId) {
          pending[j] = {...pending[j], taskId: updated.id};
        }
      }
    } else {
      touchedTaskIds.add(updated ? updated.id : mutation.taskId);
    }
  }
  return {stoppedEarly: false, touchedTaskIds};
}

/**
 * Network-shaped failures (fetch itself threw) and server responses that
 * may succeed on retry. 401 is here too: apiFetch throws it both when the
 * session is dead (the unauthorized handler then clears the queue anyway)
 * and when a refresh merely failed transiently with tokens still intact —
 * dropping queued work in that second case would lose the user's changes.
 */
function isTransient(err: unknown): boolean {
  if (!(err instanceof ApiError)) {
    return true;
  }
  return (
    err.status === 401 ||
    err.status === 408 ||
    err.status === 429 ||
    err.status >= 500
  );
}

function sendMutation(mutation: QueuedMutation): Promise<Task | void> {
  switch (mutation.type) {
    case 'create':
      return createTaskApi({
        title: mutation.payload?.title ?? '',
        notes: mutation.payload?.notes,
        priority: mutation.payload?.priority ?? 'medium',
        dueDate: mutation.payload?.dueDate,
        recurrence: mutation.payload?.recurrence,
      });
    case 'update':
      return updateTaskApi(mutation.taskId, mutation.payload ?? {});
    case 'delete':
      return deleteTaskApi(mutation.taskId);
    case 'toggle':
      return toggleTaskApi(mutation.taskId);
  }
}

async function replaceTaskIdInCache(
  oldId: string,
  replace: (local: Task) => Task,
): Promise<void> {
  const cache = await readCache();
  await writeCache(cache.map(t => (t.id === oldId ? replace(t) : t)));
}

async function removeTaskFromCache(taskId: string): Promise<void> {
  const cache = await readCache();
  await writeCache(cache.filter(t => t.id !== taskId));
}

/**
 * Merges the pre-drain `server` pull with the post-drain `localTaskCache`.
 * The local value wins for any task drain just touched (it's fresher than
 * the pull) and for any task that still has a mutation queued — one the
 * user made while this pass was running, which the next pass will send.
 * For everything else the server's pulled value wins outright: that picks
 * up edits and deletes made by another session to tasks we never touched.
 */
async function reconcile(
  server: Task[],
  touchedTaskIds: Set<string>,
  cancelled: () => boolean,
): Promise<void> {
  await withCacheLock(async () => {
    const current = await readCache();
    const queue = await listQueue();
    if (cancelled()) {
      return;
    }
    const queuedTaskIds = new Set(queue.map(m => m.taskId));
    const keepLocal = (id: string) =>
      touchedTaskIds.has(id) || queuedTaskIds.has(id);
    const currentById = new Map(current.map(t => [t.id, t]));
    const serverIds = new Set(server.map(t => t.id));

    // Local-only survivors (a just-created task's real id, which the
    // pre-drain pull predates, or a still-queued create's temp id) go first:
    // they're the newest, matching the server's newest-first order.
    const reconciled: Task[] = current.filter(
      t => !serverIds.has(t.id) && keepLocal(t.id),
    );

    for (const serverTask of server) {
      if (keepLocal(serverTask.id)) {
        const local = currentById.get(serverTask.id);
        // Missing locally means we deleted it ourselves — correctly omitted,
        // not re-added from the stale pull.
        if (local) {
          reconciled.push(local);
        }
        continue;
      }
      reconciled.push(serverTask);
    }

    await writeCache(reconciled);
  });
}

export function initSyncEngine(): () => void {
  syncNow().catch(() => {});

  const appStateSub = AppState.addEventListener('change', nextState => {
    if (nextState === 'active') {
      syncNow().catch(() => {});
    }
  });
  const unsubscribeConnectivity = subscribeToConnectivity(() => {
    syncNow().catch(() => {});
  });

  return () => {
    appStateSub.remove();
    unsubscribeConnectivity();
  };
}
