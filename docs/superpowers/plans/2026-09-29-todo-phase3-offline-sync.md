# Todo App Phase 3 — Offline Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every task mutation apply instantly and durably from a local cache regardless of connectivity, queue it for delivery, and reconcile with the server on app-foreground/reconnect — including the Android widget's toggle action — with last-write-wins conflict resolution enforced client-side.

**Architecture:** Three new isolated modules under `src/sync/` (`localTaskCache.ts`, `mutationQueue.ts`, `syncEngine.ts`, plus small `networkStatus.ts` and `optimisticToggle.ts` helpers). `src/storage/taskStorage.ts` becomes a thin orchestrator over them, keeping its existing public API so `app/index.tsx`, `TaskEditorModal`, and the widget handler need no interface changes (`TaskRow` gets one derived field read, no new prop).

**Tech Stack:** Expo/React Native 0.74, TypeScript, Jest + `@testing-library/react-native`, `@react-native-async-storage/async-storage`, `@react-native-community/netinfo` (new), `react-native-uuid` (already a dependency, previously unused).

**Spec:** [docs/superpowers/specs/2026-09-29-todo-phase3-offline-sync-design.md](../specs/2026-09-29-todo-phase3-offline-sync-design.md)

## Global Constraints

- No backend changes of any kind (spec Non-goals).
- No OS-level background execution — sync only runs on app-foreground, network-reconnect, or right after a mutation is enqueued (debounced).
- Conflict resolution is whole-record last-write-wins by `updatedAt`, enforced by pulling the server's current state *before* draining any queued `update`/`toggle` mutation (see spec's `syncNow()` algorithm) — never by diffing after the fact, since the backend's write endpoints overwrite unconditionally with no version guard.
- `TaskEditorModal`, `LogoMark`, `src/theme.ts`, `src/utils/recurrence.ts`, and `src/utils/selectors.ts` require no changes.
- Every task in this plan must leave `npm test` fully green — Task 1 updates every existing `Task` literal fixture across the suite so the type change doesn't leave later tasks starting from a red suite.

## Review Focus

- **A same-task edit lands on two devices before either syncs, then both come online.** The device whose `update`/`toggle` mutation drains *after* the other must have its stale mutation dropped by the pull-first LWW filter in `syncEngine.ts`, not blindly overwrite the newer server row — this is the spec's core correctness fix; Task 6's tests must cover both drop and keep directions.
- **A task is created while offline, then deleted (or edited) while still offline, before the `create` ever syncs.** The `delete`/`update` mutation is enqueued against the temp id; when `create` finally drains and the id-remap pass runs, every later queue entry referencing the old temp id must be rewritten to the real id — Task 4/6 must verify a `create` followed by an `update` or `delete` for the same temp id ends up correctly targeted at the real server id.
- **The queue is non-empty and the user hits "Log out."** `logout()` must reject with `PendingSyncError` and leave tokens/cache untouched (not log out partway) — Task 8 must assert `logoutApi`/`clearTokens`/`clearLocalTaskCache` are never called in this case.
- **The session is force-revoked (401 the refresh can't recover) while mutations are still queued.** The existing `unauthorizedHandler` path calls `clearLocalTaskCache`, which must also clear the mutation queue (dead session, nothing left to sync) — Task 7 must verify `clearLocalTaskCache` empties both `localTaskCache` and `mutationQueue`.
- **`syncNow()` is called while genuinely offline** (the common case, not an error). It must no-op cleanly — no thrown error, no partial writes to `localTaskCache` — since it's invoked fire-and-forget from every mutator; Task 6 must assert no `fetchTasks`/API calls happen when `isOnline()` resolves `false`.
- **A task this client never queued any mutation for was edited on another device, and separately, a task this client just drained a mutation for.** `syncNow()` pulls the server list *before* draining, so that pull is stale by the time drain's own API responses land — `reconcile()` must adopt the fresh server value for the untouched task (pick up the foreign edit) while preferring the fresher post-drain local value for the task drain just touched (not overwrite it with the stale pre-drain pull). Task 6 must cover both directions explicitly, not just infer one from the other.

---

## Task 1: `Task` type gains `updatedAt`/`pending`, threaded through `api/tasks.ts`

**Files:**
- Modify: `src/types/task.ts`
- Modify: `src/api/tasks.ts:18-30` (`toTask`)
- Modify: `__tests__/tasksApi.test.ts`
- Modify: `__tests__/widgetCache.test.ts`
- Modify: `__tests__/widgetTaskHandler.test.ts`
- Modify: `__tests__/selectors.test.ts`
- Modify: `__tests__/taskStorage.test.ts`
- Modify: `__tests__/TaskListScreen.test.tsx`

**Interfaces:**
- Produces: `Task.updatedAt: string` (required — every task from the API always has one), `Task.pending?: boolean` (derived, optional, never sent to/from the API). Every later task relies on both fields existing on `Task`.

- [ ] **Step 1: Add the fields to the `Task` type**

In `src/types/task.ts`, add to the `Task` interface (after `history: string[];`):

```ts
  history: string[];
  createdAt: string;
  updatedAt: string;
  /** Derived client-side: true while a queued, not-yet-synced mutation exists for this task. Never persisted to the API. */
  pending?: boolean;
```

- [ ] **Step 2: Write the failing test for `toTask` carrying `updatedAt` through**

In `__tests__/tasksApi.test.ts`, replace the `fetchTasks` test's expected object (lines 36-48) with:

```ts
  it('fetchTasks maps backend null fields to undefined on the frontend Task shape', async () => {
    mockApiFetch.mockResolvedValue([backendTaskRow]);
    const tasks = await fetchTasks();
    expect(mockApiFetch).toHaveBeenCalledWith('/tasks', {method: 'GET'});
    expect(tasks).toEqual([
      {
        id: '1',
        title: 'Write plan',
        notes: undefined,
        priority: 'high',
        dueDate: undefined,
        completed: false,
        recurrence: undefined,
        history: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- tasksApi.test.ts`
Expected: FAIL — actual object is missing `updatedAt`.

- [ ] **Step 4: Make `toTask` carry `updatedAt` through**

In `src/api/tasks.ts`, in `toTask()` (line 18-30), add `updatedAt: row.updatedAt,` after `createdAt: row.createdAt,`:

```ts
function toTask(row: TaskResponse): Task {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes ?? undefined,
    priority: row.priority,
    dueDate: row.dueDate ?? undefined,
    completed: row.completed,
    recurrence: row.recurrence ?? undefined,
    history: row.history,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- tasksApi.test.ts`
Expected: PASS

- [ ] **Step 6: Fix every other `Task` literal fixture in the suite so `npm test` stays green**

In `__tests__/widgetCache.test.ts`, change the `sampleTask` literal to add `updatedAt: '2026-01-01T00:00:00.000Z',` right after its `createdAt` line.

In `__tests__/widgetTaskHandler.test.ts`, replace lines 13-14 with:

```ts
const cachedTask: Task = {id: '1', title: 'Cached', priority: 'medium', completed: false, history: [], createdAt: 't1', updatedAt: 't1'};
const freshTask: Task = {id: '1', title: 'Fresh', priority: 'medium', completed: false, history: [], createdAt: 't1', updatedAt: 't1'};
```

In `__tests__/selectors.test.ts`, add `updatedAt: new Date().toISOString(),` right after `createdAt: new Date().toISOString(),` inside `makeRepeatingTask`'s returned object.

In `__tests__/taskStorage.test.ts`, replace lines 35-36 with:

```ts
const task1: Task = {id: '1', title: 'One', priority: 'medium', completed: false, history: [], createdAt: 't1', updatedAt: 't1'};
const task2: Task = {id: '2', title: 'Two', priority: 'low', completed: false, history: [], createdAt: 't2', updatedAt: 't2'};
```

In `__tests__/TaskListScreen.test.tsx`, in the `renders the tasks due today from storage` test's `mockGetTasks.mockResolvedValue([...])` call, add `updatedAt: new Date().toISOString(),` right after the existing `createdAt: new Date().toISOString(),` line.

- [ ] **Step 7: Run the full suite to verify it's green**

Run: `npm test`
Expected: PASS (all suites)

- [ ] **Step 8: Commit**

```bash
git add src/types/task.ts src/api/tasks.ts __tests__/tasksApi.test.ts __tests__/widgetCache.test.ts __tests__/widgetTaskHandler.test.ts __tests__/selectors.test.ts __tests__/taskStorage.test.ts __tests__/TaskListScreen.test.tsx
git commit -m "feat: carry updatedAt through Task, add derived pending field"
```

---

## Task 2: `@react-native-community/netinfo` dependency + `networkStatus.ts` wrapper

**Files:**
- Modify: `package.json` (new dependency)
- Modify: `jest.setup.js` (NetInfo mock)
- Create: `src/sync/networkStatus.ts`
- Test: `__tests__/networkStatus.test.ts`

**Interfaces:**
- Produces: `isOnline(): Promise<boolean>`, `subscribeToConnectivity(onOnline: () => void): () => void`. `syncEngine.ts` (Task 6) and `AuthContext.tsx` (Task 8) consume both.

- [ ] **Step 1: Install the dependency**

Run: `npx expo install @react-native-community/netinfo`
Expected: `package.json`'s `dependencies` gains an Expo-SDK-51-compatible `@react-native-community/netinfo` entry.

- [ ] **Step 2: Add the Jest mock**

In `jest.setup.js`, append:

```js
jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(() => Promise.resolve({isConnected: true, isInternetReachable: true})),
  addEventListener: jest.fn(() => () => {}),
}));
```

- [ ] **Step 3: Write the failing tests**

Create `__tests__/networkStatus.test.ts`:

```ts
import NetInfo from '@react-native-community/netinfo';
import {isOnline, subscribeToConnectivity} from '../src/sync/networkStatus';

const mockFetch = NetInfo.fetch as jest.Mock;
const mockAddEventListener = NetInfo.addEventListener as jest.Mock;

describe('networkStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('isOnline resolves true when connected and reachable', async () => {
    mockFetch.mockResolvedValue({isConnected: true, isInternetReachable: true});
    expect(await isOnline()).toBe(true);
  });

  it('isOnline resolves false when not connected', async () => {
    mockFetch.mockResolvedValue({isConnected: false, isInternetReachable: false});
    expect(await isOnline()).toBe(false);
  });

  it('isOnline treats an unknown (null) reachability as online, given a connection', async () => {
    mockFetch.mockResolvedValue({isConnected: true, isInternetReachable: null});
    expect(await isOnline()).toBe(true);
  });

  it('subscribeToConnectivity calls back only when a state reports connected+reachable', () => {
    let capturedListener: (state: any) => void = () => {};
    mockAddEventListener.mockImplementation(listener => {
      capturedListener = listener;
      return () => {};
    });
    const onOnline = jest.fn();
    subscribeToConnectivity(onOnline);

    capturedListener({isConnected: false, isInternetReachable: false});
    expect(onOnline).not.toHaveBeenCalled();

    capturedListener({isConnected: true, isInternetReachable: true});
    expect(onOnline).toHaveBeenCalledTimes(1);
  });

  it('subscribeToConnectivity returns the underlying unsubscribe function', () => {
    const unsubscribe = jest.fn();
    mockAddEventListener.mockReturnValue(unsubscribe);
    const result = subscribeToConnectivity(() => {});
    expect(result).toBe(unsubscribe);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm test -- networkStatus.test.ts`
Expected: FAIL with "Cannot find module '../src/sync/networkStatus'"

- [ ] **Step 5: Implement `networkStatus.ts`**

Create `src/sync/networkStatus.ts`:

```ts
import NetInfo from '@react-native-community/netinfo';

export async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return Boolean(state.isConnected) && state.isInternetReachable !== false;
}

export function subscribeToConnectivity(onOnline: () => void): () => void {
  return NetInfo.addEventListener(state => {
    if (state.isConnected && state.isInternetReachable !== false) {
      onOnline();
    }
  });
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- networkStatus.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json jest.setup.js src/sync/networkStatus.ts __tests__/networkStatus.test.ts
git commit -m "feat: add networkStatus wrapper around NetInfo"
```

---

## Task 3: `localTaskCache.ts` — durable local task cache

**Files:**
- Create: `src/sync/localTaskCache.ts`
- Test: `__tests__/localTaskCache.test.ts`

**Interfaces:**
- Produces: `readCache(): Promise<Task[]>`, `writeCache(tasks: Task[]): Promise<void>`, `clearCache(): Promise<void>`. Consumed by `taskStorage.ts` (Task 7) and `syncEngine.ts` (Task 6).

- [ ] **Step 1: Write the failing tests**

Create `__tests__/localTaskCache.test.ts` (mirrors `__tests__/widgetCache.test.ts`'s pattern):

```ts
import {clearCache, readCache, writeCache} from '../src/sync/localTaskCache';
import type {Task} from '../src/types/task';

const sampleTask: Task = {
  id: '1',
  title: 'Sample',
  priority: 'medium',
  completed: false,
  history: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('localTaskCache', () => {
  it('returns an empty array when nothing has been cached', async () => {
    expect(await readCache()).toEqual([]);
  });

  it('round-trips a written task list', async () => {
    await writeCache([sampleTask]);
    expect(await readCache()).toEqual([sampleTask]);
  });

  it('clears the cache back to empty', async () => {
    await writeCache([sampleTask]);
    await clearCache();
    expect(await readCache()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- localTaskCache.test.ts`
Expected: FAIL with "Cannot find module '../src/sync/localTaskCache'"

- [ ] **Step 3: Implement `localTaskCache.ts`**

Create `src/sync/localTaskCache.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {Task} from '../types/task';

const CACHE_KEY = '@todo_app/local_task_cache';

export async function readCache(): Promise<Task[]> {
  const raw = await AsyncStorage.getItem(CACHE_KEY);
  return raw ? (JSON.parse(raw) as Task[]) : [];
}

export async function writeCache(tasks: Task[]): Promise<void> {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(tasks));
}

export async function clearCache(): Promise<void> {
  await AsyncStorage.removeItem(CACHE_KEY);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- localTaskCache.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sync/localTaskCache.ts __tests__/localTaskCache.test.ts
git commit -m "feat: add durable local task cache module"
```

---

## Task 4: `mutationQueue.ts` — persisted mutation queue + `PendingSyncError`

**Files:**
- Create: `src/sync/mutationQueue.ts`
- Test: `__tests__/mutationQueue.test.ts`

**Interfaces:**
- Consumes: `AsyncStorage` (real, jest-mocked in-memory per `jest.setup.js`); `react-native-uuid` default export's `.v4(): string`.
- Produces: `QueuedMutation` type, `MutationType = 'create' | 'update' | 'delete' | 'toggle'`, `enqueue(mutation: Omit<QueuedMutation, 'id' | 'clientTimestamp'>): Promise<QueuedMutation>`, `listQueue(): Promise<QueuedMutation[]>`, `removeMutation(id: string): Promise<void>`, `remapTaskId(oldId: string, newId: string): Promise<void>`, `clearQueue(): Promise<void>`, `hasPendingMutations(): Promise<boolean>`, `class PendingSyncError extends Error`. Consumed by `syncEngine.ts` (Task 6), `taskStorage.ts` (Task 7), `AuthContext.tsx` (Task 8).

- [ ] **Step 1: Write the failing tests**

Create `__tests__/mutationQueue.test.ts`:

```ts
import {
  clearQueue,
  enqueue,
  hasPendingMutations,
  listQueue,
  remapTaskId,
  removeMutation,
} from '../src/sync/mutationQueue';

describe('mutationQueue', () => {
  beforeEach(async () => {
    // The underlying AsyncStorage mock persists across tests in this file;
    // without this, an earlier test's enqueued entries would leak into and
    // corrupt a later test's queue-contents assertions.
    await clearQueue();
  });

  it('starts empty', async () => {
    expect(await listQueue()).toEqual([]);
    expect(await hasPendingMutations()).toBe(false);
  });

  it('enqueue assigns an id and clientTimestamp, and appends in order', async () => {
    const first = await enqueue({type: 'create', taskId: 'tmp_1', payload: {title: 'A', priority: 'low'}});
    const second = await enqueue({type: 'toggle', taskId: 'tmp_1'});

    expect(first.id).toEqual(expect.any(String));
    expect(first.clientTimestamp).toEqual(expect.any(String));
    const queue = await listQueue();
    expect(queue.map(m => m.id)).toEqual([first.id, second.id]);
    expect(await hasPendingMutations()).toBe(true);
  });

  it('removeMutation removes only the matching entry', async () => {
    const first = await enqueue({type: 'create', taskId: 'a'});
    const second = await enqueue({type: 'delete', taskId: 'b'});

    await removeMutation(first.id);

    const queue = await listQueue();
    expect(queue.map(m => m.id)).toEqual([second.id]);
  });

  it('remapTaskId rewrites taskId on every matching queued entry', async () => {
    await enqueue({type: 'create', taskId: 'tmp_1', payload: {title: 'A', priority: 'low'}});
    await enqueue({type: 'update', taskId: 'tmp_1', payload: {title: 'A2', priority: 'low'}});
    await enqueue({type: 'delete', taskId: 'other'});

    await remapTaskId('tmp_1', 'real-id-9');

    const queue = await listQueue();
    expect(queue.map(m => m.taskId)).toEqual(['real-id-9', 'real-id-9', 'other']);
  });

  it('clearQueue empties the queue', async () => {
    await enqueue({type: 'create', taskId: 'a'});
    await clearQueue();
    expect(await listQueue()).toEqual([]);
    expect(await hasPendingMutations()).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- mutationQueue.test.ts`
Expected: FAIL with "Cannot find module '../src/sync/mutationQueue'"

- [ ] **Step 3: Implement `mutationQueue.ts`**

Create `src/sync/mutationQueue.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';
import type {NewTaskInput} from '../types/task';

const QUEUE_KEY = '@todo_app/mutation_queue';

export type MutationType = 'create' | 'update' | 'delete' | 'toggle';

export interface QueuedMutation {
  id: string;
  type: MutationType;
  taskId: string;
  payload?: Partial<NewTaskInput>;
  clientTimestamp: string;
}

export class PendingSyncError extends Error {
  constructor() {
    super('There are unsynced changes pending.');
    this.name = 'PendingSyncError';
  }
}

async function readQueue(): Promise<QueuedMutation[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? (JSON.parse(raw) as QueuedMutation[]) : [];
}

async function writeQueue(queue: QueuedMutation[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function enqueue(
  mutation: Omit<QueuedMutation, 'id' | 'clientTimestamp'>,
): Promise<QueuedMutation> {
  const queue = await readQueue();
  const entry: QueuedMutation = {
    ...mutation,
    id: uuid.v4(),
    clientTimestamp: new Date().toISOString(),
  };
  queue.push(entry);
  await writeQueue(queue);
  return entry;
}

export async function listQueue(): Promise<QueuedMutation[]> {
  return readQueue();
}

export async function removeMutation(id: string): Promise<void> {
  const queue = await readQueue();
  await writeQueue(queue.filter(m => m.id !== id));
}

export async function removeMutations(ids: string[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const idSet = new Set(ids);
  const queue = await readQueue();
  await writeQueue(queue.filter(m => !idSet.has(m.id)));
}

export async function remapTaskId(oldId: string, newId: string): Promise<void> {
  const queue = await readQueue();
  await writeQueue(queue.map(m => (m.taskId === oldId ? {...m, taskId: newId} : m)));
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}

export async function hasPendingMutations(): Promise<boolean> {
  const queue = await readQueue();
  return queue.length > 0;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- mutationQueue.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sync/mutationQueue.ts __tests__/mutationQueue.test.ts
git commit -m "feat: add persisted mutation queue"
```

---

## Task 5: `optimisticToggle.ts` — client-side recurrence rollover mirroring the backend

**Files:**
- Create: `src/sync/optimisticToggle.ts`
- Test: `__tests__/optimisticToggle.test.ts`

**Interfaces:**
- Consumes: `computeNextDueDate`, `todayISODate` from `../utils/recurrence` (unmodified).
- Produces: `applyOptimisticToggle(task: Task): Task`. Consumed by `taskStorage.ts` (Task 7).

- [ ] **Step 1: Write the failing tests**

Create `__tests__/optimisticToggle.test.ts`. These mirror `backend/src/services/taskService.ts`'s `toggleTaskComplete` algorithm exactly (non-recurring flips `completed`; recurring-not-done-today logs history and rolls `dueDate`; recurring-already-done-today undoes it):

```ts
import {applyOptimisticToggle} from '../src/sync/optimisticToggle';
import {todayISODate} from '../src/utils/recurrence';
import type {Task} from '../src/types/task';

const base: Task = {
  id: '1',
  title: 'Task',
  priority: 'medium',
  completed: false,
  history: [],
  createdAt: 't0',
  updatedAt: 't0',
};

describe('applyOptimisticToggle', () => {
  it('flips completed for a non-recurring task', () => {
    const result = applyOptimisticToggle(base);
    expect(result.completed).toBe(true);

    const undone = applyOptimisticToggle(result);
    expect(undone.completed).toBe(false);
  });

  it('for a recurring task not done today, logs today and rolls dueDate forward', () => {
    const today = todayISODate();
    const task: Task = {
      ...base,
      dueDate: today,
      recurrence: {type: 'daily', interval: 1},
      history: [],
    };

    const result = applyOptimisticToggle(task);

    expect(result.history).toEqual([today]);
    expect(result.completed).toBe(false);
    expect(result.dueDate).not.toBe(today);
    expect(result.dueDate! > today).toBe(true);
  });

  it('for a recurring task already done today, undoes the completion', () => {
    const today = todayISODate();
    const task: Task = {
      ...base,
      dueDate: '9999-01-01',
      recurrence: {type: 'daily', interval: 1},
      history: [today],
    };

    const result = applyOptimisticToggle(task);

    expect(result.history).toEqual([]);
  });

  it('marks a recurring task completed when the recurrence has ended', () => {
    const today = todayISODate();
    const task: Task = {
      ...base,
      dueDate: today,
      recurrence: {type: 'daily', interval: 1, endDate: today},
      history: [],
    };

    const result = applyOptimisticToggle(task);

    expect(result.completed).toBe(true);
    expect(result.history).toEqual([today]);
  });

  it('always refreshes updatedAt to a new value', () => {
    const result = applyOptimisticToggle(base);
    expect(result.updatedAt).not.toBe(base.updatedAt);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- optimisticToggle.test.ts`
Expected: FAIL with "Cannot find module '../src/sync/optimisticToggle'"

- [ ] **Step 3: Implement `optimisticToggle.ts`**

Create `src/sync/optimisticToggle.ts`. This is a client-side mirror of `backend/src/services/taskService.ts`'s `toggleTaskComplete` — see that file's comment: "Mirrors the frontend's toggleTaskComplete semantics exactly."

```ts
import type {Task} from '../types/task';
import {computeNextDueDate, todayISODate} from '../utils/recurrence';

export function applyOptimisticToggle(task: Task): Task {
  const now = new Date().toISOString();

  if (!task.recurrence) {
    return {...task, completed: !task.completed, updatedAt: now};
  }

  const today = todayISODate();
  const alreadyDoneToday = task.history.includes(today);

  if (alreadyDoneToday) {
    return {...task, history: task.history.filter(d => d !== today), updatedAt: now};
  }

  const nextDue = computeNextDueDate(task.recurrence, today);
  return {
    ...task,
    history: [...task.history, today],
    dueDate: nextDue ?? task.dueDate,
    completed: nextDue === null,
    updatedAt: now,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- optimisticToggle.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sync/optimisticToggle.ts __tests__/optimisticToggle.test.ts
git commit -m "feat: add client-side optimistic toggle mirroring backend recurrence rollover"
```

---

## Task 6: `syncEngine.ts` — pull-first LWW filter, drain, reconcile

**Files:**
- Create: `src/sync/syncEngine.ts`
- Test: `__tests__/syncEngine.test.ts`

**Interfaces:**
- Consumes: `fetchTasks, createTaskApi, updateTaskApi, deleteTaskApi, toggleTaskApi` from `../api/tasks`; `ApiError` from `../api/client`; `readCache, writeCache` from `./localTaskCache`; `listQueue, removeMutation, removeMutations, remapTaskId` from `./mutationQueue`; `isOnline, subscribeToConnectivity` from `./networkStatus`; `AppState` from `react-native`.
- Produces: `syncNow(): Promise<void>`, `scheduleSync(): void`, `initSyncEngine(): () => void`. Consumed by `taskStorage.ts` (Task 7), `AuthContext.tsx` (Task 8), `widget-task-handler.ts` (Task 11).

- [ ] **Step 1: Write the failing tests**

Create `__tests__/syncEngine.test.ts`:

```ts
import {initSyncEngine, scheduleSync, syncNow} from '../src/sync/syncEngine';
import {
  createTaskApi,
  deleteTaskApi,
  fetchTasks,
  toggleTaskApi,
  updateTaskApi,
} from '../src/api/tasks';
import {ApiError} from '../src/api/client';
import {readCache, writeCache} from '../src/sync/localTaskCache';
import {clearQueue, enqueue, listQueue} from '../src/sync/mutationQueue';
import {isOnline, subscribeToConnectivity} from '../src/sync/networkStatus';
import {AppState} from 'react-native';
import type {Task} from '../src/types/task';

jest.mock('../src/api/tasks');
jest.mock('../src/sync/networkStatus');

const mockFetchTasks = fetchTasks as jest.Mock;
const mockCreateTaskApi = createTaskApi as jest.Mock;
const mockUpdateTaskApi = updateTaskApi as jest.Mock;
const mockDeleteTaskApi = deleteTaskApi as jest.Mock;
const mockToggleTaskApi = toggleTaskApi as jest.Mock;
const mockIsOnline = isOnline as jest.Mock;
const mockSubscribeToConnectivity = subscribeToConnectivity as jest.Mock;

const serverTask = (overrides: Partial<Task> = {}): Task => ({
  id: '1',
  title: 'Server',
  priority: 'medium',
  completed: false,
  history: [],
  createdAt: 't0',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('syncEngine', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockIsOnline.mockResolvedValue(true);
    mockSubscribeToConnectivity.mockReturnValue(() => {});
    await writeCache([]);
    // Several tests deliberately leave items queued (e.g. the "stops
    // draining" test) to assert on them — without this, that leftover
    // state would leak into and corrupt the next test's queue.
    await clearQueue();
  });

  it('no-ops entirely when offline: no API calls, no cache writes', async () => {
    mockIsOnline.mockResolvedValue(false);
    await enqueue({type: 'create', taskId: 'tmp_1', payload: {title: 'A', priority: 'low'}});

    await syncNow();

    expect(mockFetchTasks).not.toHaveBeenCalled();
    expect(mockCreateTaskApi).not.toHaveBeenCalled();
    expect(await listQueue()).toHaveLength(1);
  });

  it('drops a queued update whose server row is newer, and keeps one that is newer than the server', async () => {
    // enqueue() always stamps clientTimestamp as "now" (no override exists,
    // and none should be added just for testability) — so instead of trying
    // to inject an exact clientTimestamp, this test uses a server updatedAt
    // far in the future (newer than "now", so the queued edit must be
    // dropped) and one far in the past (older than "now", so the queued
    // edit must survive and be sent).
    mockFetchTasks.mockResolvedValue([
      serverTask({id: 'stale-loses', updatedAt: '2099-01-01T00:00:00.000Z'}),
      serverTask({id: 'local-wins', updatedAt: '2020-01-01T00:00:00.000Z'}),
    ]);
    await writeCache([
      serverTask({id: 'stale-loses', title: 'stale local edit'}),
      serverTask({id: 'local-wins', title: 'newer local edit'}),
    ]);
    await enqueue({
      type: 'update',
      taskId: 'stale-loses',
      payload: {title: 'stale local edit', priority: 'medium'},
    });
    await enqueue({
      type: 'update',
      taskId: 'local-wins',
      payload: {title: 'newer local edit', priority: 'medium'},
    });
    mockUpdateTaskApi.mockImplementation((id: string) =>
      Promise.resolve(serverTask({id, title: 'newer local edit', updatedAt: new Date().toISOString()})),
    );

    await syncNow();

    // The stale mutation must never have been sent to the server.
    expect(mockUpdateTaskApi).not.toHaveBeenCalledWith('stale-loses', expect.anything());
    // The newer local mutation must have been sent.
    expect(mockUpdateTaskApi).toHaveBeenCalledWith('local-wins', expect.anything());
    const finalCache = await readCache();
    expect(finalCache.find(t => t.id === 'stale-loses')?.title).toBe('Server');
    expect(finalCache.find(t => t.id === 'local-wins')?.title).toBe('newer local edit');
  });

  it('never drops a queued create or delete regardless of server state', async () => {
    mockFetchTasks.mockResolvedValue([]);
    mockCreateTaskApi.mockResolvedValue(serverTask({id: 'real-1'}));
    await enqueue({type: 'create', taskId: 'tmp_1', payload: {title: 'New', priority: 'low'}});

    await syncNow();

    expect(mockCreateTaskApi).toHaveBeenCalled();
  });

  it('remaps a temp id to the real id on every later queued entry once create drains', async () => {
    mockFetchTasks.mockResolvedValue([]);
    mockCreateTaskApi.mockResolvedValue(serverTask({id: 'real-42'}));
    mockToggleTaskApi.mockResolvedValue(serverTask({id: 'real-42', completed: true}));
    await writeCache([serverTask({id: 'tmp_1'})]);
    await enqueue({type: 'create', taskId: 'tmp_1', payload: {title: 'New', priority: 'low'}});
    await enqueue({type: 'toggle', taskId: 'tmp_1'});

    await syncNow();

    expect(mockToggleTaskApi).toHaveBeenCalledWith('real-42');
    expect(await listQueue()).toEqual([]);
  });

  it('stops draining on a network-shaped failure and leaves the rest of the queue intact', async () => {
    mockFetchTasks.mockResolvedValue([]);
    mockCreateTaskApi.mockRejectedValueOnce(new TypeError('Network request failed'));
    await enqueue({type: 'create', taskId: 'tmp_1', payload: {title: 'A', priority: 'low'}});
    await enqueue({type: 'create', taskId: 'tmp_2', payload: {title: 'B', priority: 'low'}});

    await syncNow();

    expect(mockCreateTaskApi).toHaveBeenCalledTimes(1);
    expect(await listQueue()).toHaveLength(2);
  });

  it('drops a mutation on a non-network failure (e.g. 404) and continues draining the rest', async () => {
    mockFetchTasks.mockResolvedValue([]);
    mockDeleteTaskApi.mockRejectedValueOnce(new ApiError(404, null));
    mockCreateTaskApi.mockResolvedValue(serverTask({id: 'real-1'}));
    await enqueue({type: 'delete', taskId: 'already-gone'});
    await enqueue({type: 'create', taskId: 'tmp_1', payload: {title: 'A', priority: 'low'}});

    await syncNow();

    expect(mockCreateTaskApi).toHaveBeenCalled();
    expect(await listQueue()).toHaveLength(0);
  });

  it('reconciles: adds a task added elsewhere and removes one deleted elsewhere', async () => {
    await writeCache([serverTask({id: 'to-be-deleted-elsewhere'})]);
    mockFetchTasks.mockResolvedValue([serverTask({id: 'added-elsewhere'})]);

    await syncNow();

    const finalCache = await readCache();
    expect(finalCache.map(t => t.id)).toEqual(['added-elsewhere']);
  });

  it('adopts a foreign edit to a task with no local mutation queued for it at all', async () => {
    // Regression test: a task neither created/updated/deleted/toggled by
    // this client this pass must still pick up another session's edit from
    // the pull, not be left showing this client's stale last-synced copy.
    await writeCache([serverTask({id: 'bystander', title: 'old title'})]);
    mockFetchTasks.mockResolvedValue([serverTask({id: 'bystander', title: 'edited elsewhere'})]);
    // No mutation enqueued for 'bystander' — this client never touched it.

    await syncNow();

    const finalCache = await readCache();
    expect(finalCache.find(t => t.id === 'bystander')?.title).toBe('edited elsewhere');
  });

  it('does not let the stale pre-drain server pull clobber a task this pass just drained', async () => {
    // Regression test: fetchTasks() runs BEFORE draining, so its snapshot of
    // a task we're about to update is stale by the time drain's own API
    // response comes back. reconcile() must prefer the post-drain write.
    mockFetchTasks.mockResolvedValue([serverTask({id: '1', title: 'pre-drain stale title'})]);
    await writeCache([serverTask({id: '1', title: 'local edit'})]);
    await enqueue({type: 'update', taskId: '1', payload: {title: 'local edit', priority: 'medium'}});
    mockUpdateTaskApi.mockResolvedValue(serverTask({id: '1', title: 'local edit', updatedAt: new Date().toISOString()}));

    await syncNow();

    const finalCache = await readCache();
    expect(finalCache.find(t => t.id === '1')?.title).toBe('local edit');
  });

  it('scheduleSync debounces bursts into a single syncNow() call', async () => {
    jest.useFakeTimers();
    mockFetchTasks.mockResolvedValue([]);

    scheduleSync();
    scheduleSync();
    scheduleSync();
    jest.advanceTimersByTime(1000);
    await Promise.resolve();

    expect(mockFetchTasks).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('initSyncEngine runs an immediate sync and wires AppState/connectivity listeners', () => {
    mockFetchTasks.mockResolvedValue([]);
    // Mock the return value explicitly rather than relying on RN's own
    // AppState mock's pass-through behavior for .remove() — keeps this
    // test independent of exactly how the jest-expo preset implements it.
    const removeSpy = jest.fn();
    const addEventListenerSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockReturnValue({remove: removeSpy} as any);

    const cleanup = initSyncEngine();

    expect(mockFetchTasks).toHaveBeenCalled();
    expect(addEventListenerSpy).toHaveBeenCalledWith('change', expect.any(Function));
    expect(mockSubscribeToConnectivity).toHaveBeenCalledWith(expect.any(Function));

    cleanup();
    expect(removeSpy).toHaveBeenCalled();
    addEventListenerSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- syncEngine.test.ts`
Expected: FAIL with "Cannot find module '../src/sync/syncEngine'"

- [ ] **Step 3: Implement `syncEngine.ts`**

Create `src/sync/syncEngine.ts`:

```ts
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

export function scheduleSync(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    syncNow().catch(() => {});
  }, DEBOUNCE_MS);
}

export async function syncNow(): Promise<void> {
  if (!(await isOnline())) {
    return;
  }

  const server = await fetchTasks();
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

  const {stoppedEarly, touchedTaskIds} = await drainQueue(survivingQueue);

  if (stoppedEarly) {
    return;
  }

  await reconcile(server, touchedTaskIds);
}

interface DrainResult {
  /** True if draining stopped early on a network-shaped failure. */
  stoppedEarly: boolean;
  /**
   * Final (post-remap) ids of every task drain successfully created,
   * updated, deleted, or toggled, OR dropped via a non-network failure,
   * this pass. `reconcile` needs this to know which tasks' fresh values
   * live in the just-written `localTaskCache` rather than in the `server`
   * pull — that pull happened BEFORE draining, so for anything drain just
   * touched, it's stale and must not overwrite drain's result.
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
async function drainQueue(queue: QueuedMutation[]): Promise<DrainResult> {
  const pending = [...queue];
  const touchedTaskIds = new Set<string>();
  for (let i = 0; i < pending.length; i++) {
    const mutation = pending[i];
    try {
      const updated = await sendMutation(mutation);
      await removeMutation(mutation.id);
      if (mutation.type === 'create' && updated) {
        await remapTaskId(mutation.taskId, updated.id);
        await replaceTaskIdInCache(mutation.taskId, updated);
        touchedTaskIds.add(updated.id);
        for (let j = i + 1; j < pending.length; j++) {
          if (pending[j].taskId === mutation.taskId) {
            pending[j] = {...pending[j], taskId: updated.id};
          }
        }
      } else if (updated) {
        await replaceTaskInCache(updated);
        touchedTaskIds.add(updated.id);
      } else if (mutation.type === 'delete') {
        await removeTaskFromCache(mutation.taskId);
        touchedTaskIds.add(mutation.taskId);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        // A definitive server response (validation error, 404, dead session).
        // It cannot succeed by retrying unchanged — drop it and continue.
        // Still "touched": whatever localTaskCache holds for it right now
        // (already updated optimistically by taskStorage.ts) is the final
        // word for this pass, not the stale pre-drain server pull.
        await removeMutation(mutation.id);
        touchedTaskIds.add(mutation.taskId);
        continue;
      }
      // Network-shaped failure (fetch itself failed) — stop, retry next time.
      return {stoppedEarly: true, touchedTaskIds};
    }
  }
  return {stoppedEarly: false, touchedTaskIds};
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

async function replaceTaskInCache(updated: Task): Promise<void> {
  const cache = await readCache();
  await writeCache(cache.map(t => (t.id === updated.id ? updated : t)));
}

async function replaceTaskIdInCache(oldId: string, updated: Task): Promise<void> {
  const cache = await readCache();
  await writeCache(cache.map(t => (t.id === oldId ? updated : t)));
}

async function removeTaskFromCache(taskId: string): Promise<void> {
  const cache = await readCache();
  await writeCache(cache.filter(t => t.id !== taskId));
}

/**
 * Merges the pre-drain `server` pull with the post-drain `localTaskCache`.
 * For any task drain just touched, the post-drain local value wins (it's
 * fresher than the pull). For everything else, the server's pulled value
 * wins outright — this is what picks up an edit made by another session to
 * a task we never queued a mutation for at all, with no conflict to
 * resolve since we made no competing local change.
 */
async function reconcile(server: Task[], touchedTaskIds: Set<string>): Promise<void> {
  const current = await readCache();
  const currentById = new Map(current.map(t => [t.id, t]));
  const serverIds = new Set(server.map(t => t.id));

  const reconciled: Task[] = [];

  for (const serverTask of server) {
    if (touchedTaskIds.has(serverTask.id)) {
      const local = currentById.get(serverTask.id);
      if (local) {
        reconciled.push(local);
      }
      // Missing from `current` means we deleted it ourselves this pass —
      // correctly omitted, not re-added from the stale pull.
      continue;
    }
    reconciled.push(serverTask);
  }

  // A task drain touched that the (pre-drain) server pull never listed at
  // all — a just-created task's real id (the pull predates its creation).
  for (const t of current) {
    if (!serverIds.has(t.id) && touchedTaskIds.has(t.id)) {
      reconciled.push(t);
    }
  }

  await writeCache(reconciled);
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- syncEngine.test.ts`
Expected: PASS. If the LWW test is flaky on exact object shape, adjust assertions to check `title`/`updatedAt` fields rather than full-object equality — the important behavior is which side's `updateTaskApi` call happened, not exact payload shape.

- [ ] **Step 5: Commit**

```bash
git add src/sync/syncEngine.ts __tests__/syncEngine.test.ts
git commit -m "feat: add sync engine with pull-first LWW filtering, queue drain, and reconcile"
```

---

## Task 7: Rewrite `taskStorage.ts` as an orchestrator over the sync modules

**Files:**
- Modify: `src/storage/taskStorage.ts` (full rewrite)
- Modify: `__tests__/taskStorage.test.ts` (full rewrite)

**Interfaces:**
- Consumes: `readCache, writeCache, clearCache` from `../sync/localTaskCache`; `enqueue, listQueue, clearQueue` from `../sync/mutationQueue`; `syncNow, scheduleSync` from `../sync/syncEngine`; `applyOptimisticToggle` from `../sync/optimisticToggle`; `writeWidgetCache, clearWidgetCache` from `./widgetCache`; `syncWidget` from `../widgets/syncWidget`.
- Produces (unchanged signatures): `subscribeToTasks(listener: (tasks: Task[]) => void): () => void`, `getTasks(): Promise<Task[]>`, `addTask(input: NewTaskInput): Promise<Task>`, `updateTask(id: string, changes: Partial<NewTaskInput>): Promise<void>`, `deleteTask(id: string): Promise<void>`, `toggleTaskComplete(id: string): Promise<void>`, `clearLocalTaskCache(): Promise<void>`. `app/index.tsx`, `TaskEditorModal`, and `widget-task-handler.ts` (Task 11) consume these with no changes to call sites.

- [ ] **Step 1: Write the failing tests (full rewrite of `__tests__/taskStorage.test.ts`)**

Replace the entire contents of `__tests__/taskStorage.test.ts`:

This rewrite fully mocks every module `taskStorage.ts` depends on (rather than
exercising the real `AsyncStorage`-backed sync modules) so each test controls
its inputs precisely and asserts on calls/outputs, matching this suite's
existing convention (the old file mocked `api/tasks`, `widgetCache`,
`syncWidget` the same way). `jest.resetModules()` plus a fresh `require()` of
`taskStorage.ts` **and every mocked dependency** together in `beforeEach` is
required, not optional: `taskStorage.ts` keeps a module-level in-memory
`cache` variable that only resets when the module itself is freshly loaded,
and mixing a freshly-`require`d `taskStorage` with dependency references
captured before the reset would silently point at two different mock
instances.

```ts
import type {Task} from '../src/types/task';
import {Platform} from 'react-native';

jest.mock('../src/sync/localTaskCache');
jest.mock('../src/sync/mutationQueue');
jest.mock('../src/sync/syncEngine');
jest.mock('../src/sync/optimisticToggle');
jest.mock('../src/storage/widgetCache');
jest.mock('../src/widgets/syncWidget');

const task1: Task = {id: '1', title: 'One', priority: 'medium', completed: false, history: [], createdAt: 't1', updatedAt: 't1'};
const task2: Task = {id: '2', title: 'Two', priority: 'low', completed: false, history: [], createdAt: 't2', updatedAt: 't2'};

describe('taskStorage (offline-first orchestrator)', () => {
  let storage: typeof import('../src/storage/taskStorage');
  let localTaskCache: typeof import('../src/sync/localTaskCache');
  let mutationQueue: typeof import('../src/sync/mutationQueue');
  let syncEngine: typeof import('../src/sync/syncEngine');
  let optimisticToggle: typeof import('../src/sync/optimisticToggle');
  let widgetCache: typeof import('../src/storage/widgetCache');
  let syncWidgetModule: typeof import('../src/widgets/syncWidget');

  beforeEach(() => {
    jest.resetModules();
    storage = require('../src/storage/taskStorage');
    localTaskCache = require('../src/sync/localTaskCache');
    mutationQueue = require('../src/sync/mutationQueue');
    syncEngine = require('../src/sync/syncEngine');
    optimisticToggle = require('../src/sync/optimisticToggle');
    widgetCache = require('../src/storage/widgetCache');
    syncWidgetModule = require('../src/widgets/syncWidget');

    (localTaskCache.readCache as jest.Mock).mockResolvedValue([]);
    (localTaskCache.writeCache as jest.Mock).mockResolvedValue(undefined);
    (localTaskCache.clearCache as jest.Mock).mockResolvedValue(undefined);
    (mutationQueue.listQueue as jest.Mock).mockResolvedValue([]);
    (mutationQueue.enqueue as jest.Mock).mockResolvedValue(undefined);
    (mutationQueue.clearQueue as jest.Mock).mockResolvedValue(undefined);
    (syncEngine.syncNow as jest.Mock).mockResolvedValue(undefined);
    (syncEngine.scheduleSync as jest.Mock).mockReturnValue(undefined);
    (widgetCache.writeWidgetCache as jest.Mock).mockResolvedValue(undefined);
    (widgetCache.clearWidgetCache as jest.Mock).mockResolvedValue(undefined);
    (syncWidgetModule.syncWidget as jest.Mock).mockResolvedValue(undefined);
    (Platform as any).OS = 'ios';
  });

  it('getTasks reads from the local cache, tags pending: false when nothing is queued, and triggers a background sync', async () => {
    (localTaskCache.readCache as jest.Mock).mockResolvedValue([task1, task2]);

    const result = await storage.getTasks();

    expect(result).toEqual([{...task1, pending: false}, {...task2, pending: false}]);
    expect(syncEngine.syncNow).toHaveBeenCalled();
  });

  it('addTask applies optimistically to the cache before any network call resolves, and enqueues + schedules sync', async () => {
    (localTaskCache.readCache as jest.Mock).mockResolvedValue([task1]);
    await storage.getTasks();

    const listener = jest.fn();
    storage.subscribeToTasks(listener);
    listener.mockClear();

    const created = await storage.addTask({title: 'New', priority: 'low'});

    expect(created.title).toBe('New');
    expect(created.id).toMatch(/^tmp_/);
    expect(listener).toHaveBeenCalled();
    const notified = listener.mock.calls[0][0] as Task[];
    expect(notified.map(t => t.title)).toEqual(['New', 'One']);
    expect(syncEngine.scheduleSync).toHaveBeenCalled();
    expect(mutationQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({type: 'create', taskId: created.id}),
    );
    expect(localTaskCache.writeCache).toHaveBeenCalledWith([
      expect.objectContaining({id: created.id, title: 'New'}),
      expect.objectContaining({id: '1'}),
    ]);
  });

  it('updateTask applies the change locally, marks the task pending, and enqueues an update mutation', async () => {
    // A stateful fake, not a fixed mockResolvedValue: this is what actually
    // proves enqueue happens BEFORE persistAndNotify recomputes each task's
    // pending flag. A fixed return value would pass even if that ordering
    // regressed (e.g. notify-then-enqueue), silently showing pending:false
    // on a task's own first render after being edited.
    let queued: Array<{taskId: string}> = [];
    (mutationQueue.enqueue as jest.Mock).mockImplementation(async m => {
      queued.push(m);
    });
    (mutationQueue.listQueue as jest.Mock).mockImplementation(async () => queued);
    (localTaskCache.readCache as jest.Mock).mockResolvedValue([task1]);
    await storage.getTasks();

    const listener = jest.fn();
    storage.subscribeToTasks(listener);
    listener.mockClear();

    await storage.updateTask('1', {title: 'One (edited)', priority: 'medium'});

    expect(mutationQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({type: 'update', taskId: '1'}),
    );
    const notified = listener.mock.calls[0][0] as Task[];
    const updated = notified.find(t => t.id === '1')!;
    expect(updated.title).toBe('One (edited)');
    expect(updated.pending).toBe(true);
  });

  it('deleteTask removes the task from the cache and enqueues a delete mutation', async () => {
    (localTaskCache.readCache as jest.Mock).mockResolvedValue([task1, task2]);
    await storage.getTasks();

    const listener = jest.fn();
    storage.subscribeToTasks(listener);
    listener.mockClear();

    await storage.deleteTask('1');

    const notified = listener.mock.calls[0][0] as Task[];
    expect(notified.map(t => t.id)).toEqual(['2']);
    expect(mutationQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({type: 'delete', taskId: '1'}),
    );
  });

  it('toggleTaskComplete applies applyOptimisticToggle\'s result locally and enqueues a toggle mutation', async () => {
    (localTaskCache.readCache as jest.Mock).mockResolvedValue([task1]);
    await storage.getTasks();
    const toggled = {...task1, completed: true};
    (optimisticToggle.applyOptimisticToggle as jest.Mock).mockReturnValue(toggled);

    const listener = jest.fn();
    storage.subscribeToTasks(listener);
    listener.mockClear();

    await storage.toggleTaskComplete('1');

    expect(optimisticToggle.applyOptimisticToggle).toHaveBeenCalledWith(task1);
    const notified = listener.mock.calls[0][0] as Task[];
    expect(notified.find(t => t.id === '1')!.completed).toBe(true);
    expect(mutationQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({type: 'toggle', taskId: '1'}),
    );
  });

  it('toggleTaskComplete is a no-op when the task id is not in the cache', async () => {
    (localTaskCache.readCache as jest.Mock).mockResolvedValue([task1]);
    await storage.getTasks();

    await storage.toggleTaskComplete('does-not-exist');

    expect(mutationQueue.enqueue).not.toHaveBeenCalled();
    expect(localTaskCache.writeCache).not.toHaveBeenCalled();
  });

  it('subscribeToTasks immediately pushes the current cache to a new listener', async () => {
    (localTaskCache.readCache as jest.Mock).mockResolvedValue([task1]);
    await storage.getTasks();

    const listener = jest.fn();
    storage.subscribeToTasks(listener);
    expect(listener).toHaveBeenCalledWith([{...task1, pending: false}]);
  });

  it('clearLocalTaskCache empties the local cache and the mutation queue, and clears the widget cache', async () => {
    (localTaskCache.readCache as jest.Mock).mockResolvedValue([task1]);
    await storage.getTasks();

    await storage.clearLocalTaskCache();

    expect(localTaskCache.clearCache).toHaveBeenCalled();
    expect(mutationQueue.clearQueue).toHaveBeenCalled();
    expect(widgetCache.clearWidgetCache).toHaveBeenCalled();
    const listener = jest.fn();
    storage.subscribeToTasks(listener);
    expect(listener).toHaveBeenCalledWith([]);
  });

  it('getTasks syncs the widget on Android', async () => {
    (Platform as any).OS = 'android';
    (localTaskCache.readCache as jest.Mock).mockResolvedValue([task1]);

    await storage.getTasks();

    expect(syncWidgetModule.syncWidget).toHaveBeenCalledWith([{...task1, pending: false}]);
  });

  it('does not sync the widget on iOS/web', async () => {
    (localTaskCache.readCache as jest.Mock).mockResolvedValue([task1]);

    await storage.getTasks();

    expect(syncWidgetModule.syncWidget).not.toHaveBeenCalled();
    expect(widgetCache.writeWidgetCache).toHaveBeenCalledWith([{...task1, pending: false}]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- taskStorage.test.ts`
Expected: FAIL (old implementation doesn't match new behavior/imports).

- [ ] **Step 3: Rewrite `taskStorage.ts`**

Replace the entire contents of `src/storage/taskStorage.ts`:

```ts
import type {NewTaskInput, Task} from '../types/task';
import * as localTaskCache from '../sync/localTaskCache';
import * as mutationQueue from '../sync/mutationQueue';
import * as syncEngine from '../sync/syncEngine';
import {applyOptimisticToggle} from '../sync/optimisticToggle';
import {clearWidgetCache, writeWidgetCache} from './widgetCache';
import {syncWidget} from '../widgets/syncWidget';
import {Platform} from 'react-native';
import uuid from 'react-native-uuid';

type Listener = (tasks: Task[]) => void;
const listeners = new Set<Listener>();

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

async function ensureCache(): Promise<Task[]> {
  if (cache === null) {
    const stored = await localTaskCache.readCache();
    cache = await withPendingFlags(stored);
  }
  return cache;
}

async function persistAndNotify(tasks: Task[]): Promise<void> {
  const stripped = tasks.map(stripPending);
  await localTaskCache.writeCache(stripped);
  notify(await withPendingFlags(stripped));
}

export function subscribeToTasks(listener: Listener): () => void {
  listeners.add(listener);
  if (cache) {
    listener(cache);
  }
  return () => listeners.delete(listener);
}

export async function getTasks(): Promise<Task[]> {
  const tasks = await ensureCache();
  notify(tasks);
  syncEngine.syncNow().catch(() => {});
  return tasks;
}

export async function addTask(input: NewTaskInput): Promise<Task> {
  const current = await ensureCache();
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

  // Enqueue BEFORE persisting/notifying: persistAndNotify recomputes each
  // task's `pending` flag from the current queue contents, so the new
  // task's own first notification must already see its own mutation
  // queued — otherwise it would briefly render as pending: false.
  await mutationQueue.enqueue({type: 'create', taskId: optimisticTask.id, payload: input});
  await persistAndNotify([optimisticTask, ...current]);
  syncEngine.scheduleSync();
  return optimisticTask;
}

export async function updateTask(id: string, changes: Partial<NewTaskInput>): Promise<void> {
  const current = await ensureCache();
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
  syncEngine.scheduleSync();
}

export async function deleteTask(id: string): Promise<void> {
  const current = await ensureCache();
  await mutationQueue.enqueue({type: 'delete', taskId: id});
  await persistAndNotify(current.filter(t => t.id !== id));
  syncEngine.scheduleSync();
}

export async function toggleTaskComplete(id: string): Promise<void> {
  const current = await ensureCache();
  const target = current.find(t => t.id === id);
  if (!target) {
    return;
  }

  const optimistic = applyOptimisticToggle(target);
  await mutationQueue.enqueue({type: 'toggle', taskId: id});
  await persistAndNotify(current.map(t => (t.id === id ? optimistic : t)));
  syncEngine.scheduleSync();
}

export async function clearLocalTaskCache(): Promise<void> {
  await localTaskCache.clearCache();
  await mutationQueue.clearQueue();
  cache = [];
  listeners.forEach(l => l([]));
  await clearWidgetCache();
  if (Platform.OS === 'android') {
    syncWidget([]).catch(() => {});
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- taskStorage.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full suite to verify no regressions**

Run: `npm test`
Expected: PASS (all suites)

- [ ] **Step 6: Commit**

```bash
git add src/storage/taskStorage.ts __tests__/taskStorage.test.ts
git commit -m "feat: rewrite taskStorage as an offline-first orchestrator over the sync modules"
```

---

## Task 8: `AuthContext.tsx` — sync engine lifecycle + logout blocked while pending

**Files:**
- Modify: `src/auth/AuthContext.tsx`
- Modify: `__tests__/AuthContext.test.tsx`

**Interfaces:**
- Consumes: `initSyncEngine` from `../sync/syncEngine`; `hasPendingMutations, PendingSyncError` from `../sync/mutationQueue`.
- Produces: `logout(): Promise<void>` now rejects with `PendingSyncError` when the queue is non-empty. `app/index.tsx` (Task 9) consumes this.

- [ ] **Step 1: Write the failing tests**

In `__tests__/AuthContext.test.tsx`, add these imports at the top (alongside the existing ones):

```ts
import {hasPendingMutations, PendingSyncError} from '../src/sync/mutationQueue';
import {initSyncEngine} from '../src/sync/syncEngine';
```

Add these two mocks alongside the existing `jest.mock(...)` calls:

```ts
jest.mock('../src/sync/mutationQueue', () => ({
  hasPendingMutations: jest.fn().mockResolvedValue(false),
  PendingSyncError: class PendingSyncError extends Error {},
}));
jest.mock('../src/sync/syncEngine', () => ({
  initSyncEngine: jest.fn(() => jest.fn()),
}));
```

Add these two mock references alongside the existing ones:

```ts
const mockHasPendingMutations = hasPendingMutations as jest.Mock;
const mockInitSyncEngine = initSyncEngine as jest.Mock;
```

Add these two tests inside the `describe('AuthProvider', ...)` block:

```ts
  it('logout rejects with PendingSyncError and does not clear tokens/cache when mutations are pending', async () => {
    mockGetTokens.mockResolvedValue({accessToken: 'a', refreshToken: 'r'});
    mockHasPendingMutations.mockResolvedValue(true);

    let auth: ReturnType<typeof useAuth> | null = null;
    function Capture() {
      auth = useAuth();
      return null;
    }
    const {getByText} = render(
      <AuthProvider>
        <Capture />
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(getByText('status:authed')).toBeTruthy());

    await expect(auth!.logout()).rejects.toBeInstanceOf(PendingSyncError);

    expect(mockLogoutApi).not.toHaveBeenCalled();
    expect(mockClearTokens).not.toHaveBeenCalled();
    expect(mockClearLocalTaskCache).not.toHaveBeenCalled();
    expect(getByText('status:authed')).toBeTruthy();
  });

  it('initializes the sync engine while authed and tears it down when no longer authed', async () => {
    const cleanup = jest.fn();
    mockInitSyncEngine.mockReturnValue(cleanup);
    mockGetTokens.mockResolvedValue({accessToken: 'a', refreshToken: 'r'});

    const {unmount} = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(mockInitSyncEngine).toHaveBeenCalled());

    unmount();
    expect(cleanup).toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- AuthContext.test.tsx`
Expected: FAIL — `logout()` currently resolves normally regardless of queue state, and `initSyncEngine` is never called.

- [ ] **Step 3: Wire both behaviors into `AuthContext.tsx`**

In `src/auth/AuthContext.tsx`, add to the imports:

```ts
import {hasPendingMutations, PendingSyncError} from '../sync/mutationQueue';
import {initSyncEngine} from '../sync/syncEngine';
```

Add a new `useEffect` (after the existing `setUnauthorizedHandler` effect):

```ts
  useEffect(() => {
    if (status !== 'authed') {
      return;
    }
    return initSyncEngine();
  }, [status]);
```

Replace the `logout` callback:

```ts
  const logout = useCallback(async () => {
    if (await hasPendingMutations()) {
      throw new PendingSyncError();
    }
    const tokens = await getTokens();
    if (tokens) {
      await logoutApi(tokens.refreshToken).catch(() => {});
    }
    await clearTokens();
    await clearLocalTaskCache();
    setStatus('anonymous');
  }, []);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- AuthContext.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the full suite to verify no regressions**

Run: `npm test`
Expected: PASS (all suites)

- [ ] **Step 6: Commit**

```bash
git add src/auth/AuthContext.tsx __tests__/AuthContext.test.tsx
git commit -m "feat: block logout while mutations are pending, start sync engine while authed"
```

---

## Task 9: `app/index.tsx` — surface `PendingSyncError` from the logout button

**Files:**
- Modify: `app/index.tsx:171-175`
- Modify: `__tests__/TaskListScreen.test.tsx`

**Interfaces:**
- Consumes: `PendingSyncError` from `../src/sync/mutationQueue`.

- [ ] **Step 1: Write the failing test**

In `__tests__/TaskListScreen.test.tsx`, add to the imports:

```ts
import {PendingSyncError} from '../src/sync/mutationQueue';
```

Add this test inside the `describe('TaskListScreen', ...)` block:

```ts
  it('shows a distinct alert and stays logged in when logout is blocked by pending sync', async () => {
    const logout = jest.fn().mockRejectedValue(new PendingSyncError());
    mockUseAuth.mockReturnValue({logout, status: 'authed'});
    mockGetTasks.mockResolvedValue([]);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const {getByText} = render(<TaskListScreen />);
    await waitFor(() =>
      expect(getByText('Nothing here. Enjoy the quiet.')).toBeTruthy(),
    );
    fireEvent.press(getByText('Log out'));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'Unsynced changes',
        'You have unsynced changes — connect to the internet first.',
      ),
    );

    alertSpy.mockRestore();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- TaskListScreen.test.tsx`
Expected: FAIL — today's `onPress={() => logout()}` doesn't catch or alert on rejection.

- [ ] **Step 3: Update the logout button handler**

In `app/index.tsx`, add to the imports:

```ts
import {PendingSyncError} from '../src/sync/mutationQueue';
```

Replace the logout button's `onPress` (line 173):

```tsx
            onPress={() =>
              logout().catch(err => {
                if (err instanceof PendingSyncError) {
                  Alert.alert(
                    'Unsynced changes',
                    'You have unsynced changes — connect to the internet first.',
                  );
                }
              })
            }>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- TaskListScreen.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/index.tsx __tests__/TaskListScreen.test.tsx
git commit -m "feat: alert instead of logging out when unsynced changes are pending"
```

---

## Task 10: `TaskRow` — pending indicator

**Files:**
- Modify: `src/components/TaskRow.tsx`
- Create: `__tests__/TaskRow.test.tsx`

**Interfaces:**
- Consumes: `task.pending` (already on `Task` from Task 1) — no new prop.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/TaskRow.test.tsx`:

```tsx
import React from 'react';
import {render} from '@testing-library/react-native';
import {TaskRow} from '../src/components/TaskRow';
import type {Task} from '../src/types/task';

const baseTask: Task = {
  id: '1',
  title: 'Buy milk',
  priority: 'medium',
  completed: false,
  history: [],
  createdAt: 't0',
  updatedAt: 't0',
};

describe('TaskRow', () => {
  it('does not render a pending indicator for a synced task', () => {
    const {queryByTestId} = render(
      <TaskRow task={baseTask} done={false} onToggle={() => {}} onPress={() => {}} onDelete={() => {}} />,
    );
    expect(queryByTestId('pending-indicator')).toBeNull();
  });

  it('renders a pending indicator when the task has an unsynced change', () => {
    const {getByTestId} = render(
      <TaskRow
        task={{...baseTask, pending: true}}
        done={false}
        onToggle={() => {}}
        onPress={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(getByTestId('pending-indicator')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- TaskRow.test.tsx`
Expected: FAIL — no element with `testID="pending-indicator"` exists yet.

- [ ] **Step 3: Add the indicator**

In `src/components/TaskRow.tsx`, inside the `content` `View` (after the `metaRow` `View`, still inside `content`), add:

```tsx
        {task.pending ? <View testID="pending-indicator" style={styles.pendingDot} /> : null}
```

So the `content` block reads:

```tsx
      <View style={styles.content}>
        <Text
          style={[styles.title, done && styles.titleDone]}
          numberOfLines={1}>
          {task.title}
        </Text>
        <View style={styles.metaRow}>
          {due ? (
            <Text
              style={[
                styles.meta,
                due === 'Overdue' && styles.overdue,
              ]}>
              {due}
            </Text>
          ) : null}
          {task.recurrence ? (
            <Text style={styles.meta}>
              {due ? '  ·  ' : ''}⟳ {describeRecurrence(task.recurrence)}
            </Text>
          ) : null}
        </View>
        {task.pending ? <View testID="pending-indicator" style={styles.pendingDot} /> : null}
      </View>
```

Add a `pendingDot` style to the `StyleSheet.create` call, alongside the other style entries:

```ts
  pendingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.subtext,
    marginTop: 4,
  },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- TaskRow.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/TaskRow.tsx __tests__/TaskRow.test.tsx
git commit -m "feat: show a pending indicator on TaskRow for unsynced tasks"
```

---

## Task 11: Widget handler drains the queue on wake-up

**Files:**
- Modify: `src/widgets/widget-task-handler.ts`
- Modify: `__tests__/widgetTaskHandler.test.ts`

**Interfaces:**
- Consumes: `syncNow` from `../sync/syncEngine` (in addition to the existing `getTasks`/`toggleTaskComplete` from `../storage/taskStorage`).

- [ ] **Step 1: Write the failing test**

In `__tests__/widgetTaskHandler.test.ts`, add to the imports:

```ts
import {syncNow} from '../src/sync/syncEngine';
```

Add a mock:

```ts
jest.mock('../src/sync/syncEngine');
const mockSyncNow = syncNow as jest.Mock;
```

Replace the first test (`'on WIDGET_UPDATE, renders the cached snapshot immediately, then re-renders with live data'`) with:

```ts
  it('on WIDGET_UPDATE, renders the cached snapshot immediately, drains the queue via syncNow, then re-renders with live data', async () => {
    mockReadWidgetCache.mockResolvedValue([cachedTask]);
    mockSyncNow.mockResolvedValue(undefined);
    let resolveGetTasks: (tasks: Task[]) => void = () => {};
    mockGetTasks.mockReturnValue(new Promise(resolve => {
      resolveGetTasks = resolve;
    }));

    const renderWidget = jest.fn();
    const handlerPromise = widgetTaskHandler({
      widgetAction: 'WIDGET_UPDATE',
      renderWidget,
    } as any);

    await handlerPromise;
    expect(renderWidget).toHaveBeenCalledTimes(1);
    expect(mockSyncNow).toHaveBeenCalled();

    resolveGetTasks([freshTask]);
    await new Promise(process.nextTick);
    expect(renderWidget).toHaveBeenCalledTimes(2);
  });
```

Also update the second test (`'on a live-refresh failure...'`) so it still passes with the new call chain — replace it with:

```ts
  it('on a live-refresh failure, does not throw and keeps only the cached render', async () => {
    mockReadWidgetCache.mockResolvedValue([cachedTask]);
    mockSyncNow.mockRejectedValue(new Error('network down'));
    mockGetTasks.mockRejectedValue(new Error('network down'));

    const renderWidget = jest.fn();
    await widgetTaskHandler({widgetAction: 'WIDGET_UPDATE', renderWidget} as any);
    await new Promise(process.nextTick);

    expect(renderWidget).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- widgetTaskHandler.test.ts`
Expected: FAIL — `syncNow` is never called by the current handler.

- [ ] **Step 3: Update `widget-task-handler.ts`**

In `src/widgets/widget-task-handler.ts`, add to the imports:

```ts
import {syncNow} from '../sync/syncEngine';
```

Replace the `WIDGET_ADDED`/`WIDGET_UPDATE`/`WIDGET_RESIZED` case's live-refresh line:

```ts
      getTasks()
        .then(tasks => props.renderWidget(TodoWidgetComponent({tasks})))
        .catch(() => {});
```

with:

```ts
      syncNow()
        .then(() => getTasks())
        .then(tasks => props.renderWidget(TodoWidgetComponent({tasks})))
        .catch(() => {});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- widgetTaskHandler.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full suite to verify no regressions**

Run: `npm test`
Expected: PASS (all suites)

- [ ] **Step 6: Commit**

```bash
git add src/widgets/widget-task-handler.ts __tests__/widgetTaskHandler.test.ts
git commit -m "feat: drain the sync queue on widget wake-up before rendering live data"
```

---

## Task 12: Manual verification checklist

**Files:**
- Create: `docs/superpowers/manual-verification-phase3.md`

- [ ] **Step 1: Write the checklist**

Create `docs/superpowers/manual-verification-phase3.md`:

```markdown
# Phase 3 manual verification checklist

Run this against the real Phase 1 backend, on a native build
(`npx expo run:android`) with airplane mode available. Complete
`manual-verification-phase2.md` first if you haven't already — this
extends it with offline-specific checks.

1. Turn on airplane mode. Create a task, edit another task's title, toggle
   a third task complete, and delete a fourth. Confirm all four changes
   apply immediately in the UI (no "check your connection" alert) and each
   changed row shows the pending indicator.
2. Turn off airplane mode and bring the app to the foreground (or wait for
   it to already be foregrounded). Confirm the pending indicators clear
   within a few seconds and the changes are still present.
3. Kill and reopen the app. Confirm the four changes from step 1 are still
   there, sourced from the server this time (open the backend's task list
   directly, e.g. via `psql` or an API call, to confirm they actually
   persisted).
4. Try to log out while airplane mode is on and a change is still pending
   (repeat step 1's create, then immediately try "Log out" before it
   syncs). Confirm you see "You have unsynced changes — connect to the
   internet first" and remain logged in. Turn off airplane mode, wait for
   the pending indicator to clear, then log out successfully.
5. Force a same-task conflict: log in as the same account on two sessions
   (e.g. the native app and `expo start --web`). Turn off connectivity on
   one, edit a task's title there, then edit the *same* task's title
   differently on the still-online session and let it sync. Reconnect the
   offline session. Confirm the online session's edit wins (last-write-
   wins) and the offline session's stale edit is silently dropped, not
   applied on top.
6. On Android: turn on airplane mode, tap a task in the home-screen widget
   to toggle it. Confirm the widget's own display updates optimistically.
   Reopen the app (still offline) and confirm the same task shows toggled
   there too, with a pending indicator. Turn off airplane mode, reopen the
   widget (trigger a `WIDGET_UPDATE`, e.g. by resizing it slightly or
   waiting for its periodic update), and confirm the pending indicator
   clears once the app is reopened.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/manual-verification-phase3.md
git commit -m "docs: add Phase 3 manual verification checklist"
```
