import type {NewTaskInput, Task} from '../types/task';
import * as localTaskCache from '../sync/localTaskCache';
import * as mutationQueue from '../sync/mutationQueue';
import * as syncEngine from '../sync/syncEngine';
import {withCacheLock} from '../sync/lock';
import {applyOptimisticToggle} from '../sync/optimisticToggle';
import {clearWidgetCache, writeWidgetCache} from './widgetCache';
import {syncWidget} from '../widgets/syncWidget';
import {Platform} from 'react-native';
import uuid from 'react-native-uuid';

type Listener = (tasks: Task[]) => void;
const listeners = new Set<Listener>();

// Last list pushed to listeners, so a new subscriber gets it immediately.
// Mutators never build on this: they re-read localTaskCache under the cache
// lock, since a sync pass may have rewritten it (remapped ids, pulled
// remote edits) since this was last set.
let cache: Task[] | null = null;

function stripPending(task: Task): Task {
  return {...task, pending: undefined};
}

async function withPendingFlags(tasks: Task[]): Promise<Task[]> {
  const queue = await mutationQueue.listQueue();
  const pendingIds = new Set(queue.map(m => m.taskId));
  return tasks.map(t => ({...t, pending: pendingIds.has(t.id)}));
}

function notify(tasks: Task[]): void {
  cache = tasks;
  listeners.forEach(l => l(tasks));
  writeWidgetCache(tasks).catch(() => {});
  if (Platform.OS === 'android') {
    syncWidget(tasks).catch(() => {});
  }
}

async function readWithPendingFlags(): Promise<Task[]> {
  return withPendingFlags(await localTaskCache.readCache());
}

async function persistAndNotify(tasks: Task[]): Promise<void> {
  const stripped = tasks.map(stripPending);
  await localTaskCache.writeCache(stripped);
  notify(await withPendingFlags(stripped));
}

// A sync pass rewrote localTaskCache: push its result to the UI/widget.
syncEngine.onCacheSynced(() => {
  readWithPendingFlags()
    .then(notify)
    .catch(() => {});
});

export function subscribeToTasks(listener: Listener): () => void {
  listeners.add(listener);
  if (cache) {
    listener(cache);
  }
  return () => listeners.delete(listener);
}

export async function getTasks(): Promise<Task[]> {
  const tasks = await readWithPendingFlags();
  notify(tasks);
  syncEngine.syncNow().catch(() => {});
  return tasks;
}

export async function addTask(input: NewTaskInput): Promise<Task> {
  const now = new Date().toISOString();
  const optimisticTask: Task = {
    id: `tmp_${uuid.v4()}`,
    title: input.title,
    notes: input.notes,
    priority: input.priority,
    dueDate: input.dueDate,
    completed: false,
    recurrence: input.recurrence,
    history: [],
    createdAt: now,
    updatedAt: now,
  };

  await withCacheLock(async () => {
    const current = await localTaskCache.readCache();
    // Enqueue BEFORE persisting/notifying: persistAndNotify recomputes each
    // task's `pending` flag from the current queue contents, so the new
    // task's own first notification must already see its own mutation
    // queued — otherwise it would briefly render as pending: false.
    await mutationQueue.enqueue({
      type: 'create',
      taskId: optimisticTask.id,
      payload: input,
    });
    await persistAndNotify([optimisticTask, ...current]);
  });
  syncEngine.scheduleSync();
  return optimisticTask;
}

export async function updateTask(
  taskId: string,
  changes: Partial<NewTaskInput>,
): Promise<void> {
  await withCacheLock(async () => {
    const id = syncEngine.resolveTaskId(taskId);
    const current = await localTaskCache.readCache();
    const now = new Date().toISOString();

    const updatedList = current.map(t =>
      t.id === id
        ? {
            ...t,
            title: changes.title ?? t.title,
            notes: changes.notes,
            priority: changes.priority ?? t.priority,
            dueDate: changes.dueDate,
            recurrence: changes.recurrence,
            updatedAt: now,
          }
        : t,
    );

    await mutationQueue.enqueue({type: 'update', taskId: id, payload: changes});
    await persistAndNotify(updatedList);
  });
  syncEngine.scheduleSync();
}

export async function deleteTask(taskId: string): Promise<void> {
  await withCacheLock(async () => {
    const id = syncEngine.resolveTaskId(taskId);
    const current = await localTaskCache.readCache();
    await mutationQueue.enqueue({type: 'delete', taskId: id});
    await persistAndNotify(current.filter(t => t.id !== id));
  });
  syncEngine.scheduleSync();
}

export async function toggleTaskComplete(taskId: string): Promise<void> {
  const toggled = await withCacheLock(async () => {
    const id = syncEngine.resolveTaskId(taskId);
    const current = await localTaskCache.readCache();
    const target = current.find(t => t.id === id);
    if (!target) {
      return false;
    }

    const optimistic = applyOptimisticToggle(target);
    await mutationQueue.enqueue({type: 'toggle', taskId: id});
    await persistAndNotify(current.map(t => (t.id === id ? optimistic : t)));
    return true;
  });
  if (toggled) {
    syncEngine.scheduleSync();
  }
}

export async function clearLocalTaskCache(): Promise<void> {
  // First, so a sync pass that's mid-flight can't write the old session's
  // tasks back into the cache after it's cleared.
  syncEngine.cancelPendingSync();
  await withCacheLock(async () => {
    await localTaskCache.clearCache();
    await mutationQueue.clearQueue();
  });
  cache = [];
  listeners.forEach(l => l([]));
  await clearWidgetCache();
  if (Platform.OS === 'android') {
    syncWidget([]).catch(() => {});
  }
}
