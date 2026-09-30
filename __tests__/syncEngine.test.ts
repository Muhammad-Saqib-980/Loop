import {
  cancelPendingSync,
  initSyncEngine,
  onCacheSynced,
  resolveTaskId,
  scheduleSync,
  syncNow,
} from '../src/sync/syncEngine';
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
    await enqueue({
      type: 'create',
      taskId: 'tmp_1',
      payload: {title: 'A', priority: 'low'},
    });

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
      Promise.resolve(
        serverTask({
          id,
          title: 'newer local edit',
          updatedAt: new Date().toISOString(),
        }),
      ),
    );

    await syncNow();

    // The stale mutation must never have been sent to the server.
    expect(mockUpdateTaskApi).not.toHaveBeenCalledWith(
      'stale-loses',
      expect.anything(),
    );
    // The newer local mutation must have been sent.
    expect(mockUpdateTaskApi).toHaveBeenCalledWith(
      'local-wins',
      expect.anything(),
    );
    const finalCache = await readCache();
    expect(finalCache.find(t => t.id === 'stale-loses')?.title).toBe('Server');
    expect(finalCache.find(t => t.id === 'local-wins')?.title).toBe(
      'newer local edit',
    );
  });

  it('never drops a queued create or delete regardless of server state', async () => {
    mockFetchTasks.mockResolvedValue([]);
    mockCreateTaskApi.mockResolvedValue(serverTask({id: 'real-1'}));
    await enqueue({
      type: 'create',
      taskId: 'tmp_1',
      payload: {title: 'New', priority: 'low'},
    });

    await syncNow();

    expect(mockCreateTaskApi).toHaveBeenCalled();
  });

  it('remaps a temp id to the real id on every later queued entry once create drains', async () => {
    mockFetchTasks.mockResolvedValue([]);
    mockCreateTaskApi.mockResolvedValue(serverTask({id: 'real-42'}));
    mockToggleTaskApi.mockResolvedValue(
      serverTask({id: 'real-42', completed: true}),
    );
    await writeCache([serverTask({id: 'tmp_1'})]);
    await enqueue({
      type: 'create',
      taskId: 'tmp_1',
      payload: {title: 'New', priority: 'low'},
    });
    await enqueue({type: 'toggle', taskId: 'tmp_1'});

    await syncNow();

    expect(mockToggleTaskApi).toHaveBeenCalledWith('real-42');
    expect(await listQueue()).toEqual([]);
  });

  it('stops draining on a network-shaped failure and leaves the rest of the queue intact', async () => {
    mockFetchTasks.mockResolvedValue([]);
    mockCreateTaskApi.mockRejectedValueOnce(
      new TypeError('Network request failed'),
    );
    await enqueue({
      type: 'create',
      taskId: 'tmp_1',
      payload: {title: 'A', priority: 'low'},
    });
    await enqueue({
      type: 'create',
      taskId: 'tmp_2',
      payload: {title: 'B', priority: 'low'},
    });

    await syncNow();

    expect(mockCreateTaskApi).toHaveBeenCalledTimes(1);
    expect(await listQueue()).toHaveLength(2);
  });

  it('drops a mutation on a non-network failure (e.g. 404) and continues draining the rest', async () => {
    mockFetchTasks.mockResolvedValue([]);
    mockDeleteTaskApi.mockRejectedValueOnce(new ApiError(404, null));
    mockCreateTaskApi.mockResolvedValue(serverTask({id: 'real-1'}));
    await enqueue({type: 'delete', taskId: 'already-gone'});
    await enqueue({
      type: 'create',
      taskId: 'tmp_1',
      payload: {title: 'A', priority: 'low'},
    });

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
    mockFetchTasks.mockResolvedValue([
      serverTask({id: 'bystander', title: 'edited elsewhere'}),
    ]);
    // No mutation enqueued for 'bystander' — this client never touched it.

    await syncNow();

    const finalCache = await readCache();
    expect(finalCache.find(t => t.id === 'bystander')?.title).toBe(
      'edited elsewhere',
    );
  });

  it('does not let the stale pre-drain server pull clobber a task this pass just drained', async () => {
    // Regression test: fetchTasks() runs BEFORE draining, so its snapshot of
    // a task we're about to update is stale by the time drain's own API
    // response comes back. reconcile() must prefer the post-drain write.
    mockFetchTasks.mockResolvedValue([
      serverTask({id: '1', title: 'pre-drain stale title'}),
    ]);
    await writeCache([serverTask({id: '1', title: 'local edit'})]);
    await enqueue({
      type: 'update',
      taskId: '1',
      payload: {title: 'local edit', priority: 'medium'},
    });
    mockUpdateTaskApi.mockResolvedValue(
      serverTask({
        id: '1',
        title: 'local edit',
        updatedAt: new Date().toISOString(),
      }),
    );

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

  it('initSyncEngine runs an immediate sync and wires AppState/connectivity listeners', async () => {
    mockFetchTasks.mockResolvedValue([]);
    // Mock the return value explicitly rather than relying on RN's own
    // AppState mock's pass-through behavior for .remove() — keeps this
    // test independent of exactly how the jest-expo preset implements it.
    const removeSpy = jest.fn();
    const addEventListenerSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockReturnValue({remove: removeSpy} as any);

    const cleanup = initSyncEngine();
    // syncNow() awaits isOnline() before pulling; joining the in-flight
    // pass waits for that immediate sync to actually reach the server.
    await syncNow();

    expect(mockFetchTasks).toHaveBeenCalled();
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );
    expect(mockSubscribeToConnectivity).toHaveBeenCalledWith(
      expect.any(Function),
    );

    cleanup();
    expect(removeSpy).toHaveBeenCalled();
    addEventListenerSpy.mockRestore();
  });

  it('runs overlapping syncNow() calls one at a time, so a queued create is sent only once', async () => {
    // The follow-up pass the second call requests pulls again, and by then
    // the server has the created task.
    mockFetchTasks
      .mockResolvedValueOnce([])
      .mockResolvedValue([serverTask({id: 'real-1'})]);
    mockCreateTaskApi.mockResolvedValue(serverTask({id: 'real-1'}));
    await writeCache([serverTask({id: 'tmp_1'})]);
    await enqueue({
      type: 'create',
      taskId: 'tmp_1',
      payload: {title: 'New', priority: 'low'},
    });

    // e.g. initSyncEngine() and getTasks() both firing at app start.
    await Promise.all([syncNow(), syncNow()]);

    expect(mockCreateTaskApi).toHaveBeenCalledTimes(1);
    expect(await listQueue()).toEqual([]);
    expect((await readCache()).map(t => t.id)).toEqual(['real-1']);
  });

  it.each([500, 503, 429, 401])(
    'treats an ApiError %i as transient: stops draining and keeps the mutation queued',
    async status => {
      mockFetchTasks.mockResolvedValue([]);
      mockCreateTaskApi.mockRejectedValueOnce(new ApiError(status, null));
      await enqueue({
        type: 'create',
        taskId: 'tmp_1',
        payload: {title: 'A', priority: 'low'},
      });
      await enqueue({
        type: 'create',
        taskId: 'tmp_2',
        payload: {title: 'B', priority: 'low'},
      });

      await syncNow();

      expect(mockCreateTaskApi).toHaveBeenCalledTimes(1);
      expect(await listQueue()).toHaveLength(2);
    },
  );

  it('lets the server copy win for a task whose mutation the server rejected', async () => {
    // A 404 on update means the task was deleted elsewhere: it must not
    // linger locally as a zombie row just because this pass touched it.
    await writeCache([
      serverTask({id: 'deleted-elsewhere', title: 'local edit'}),
    ]);
    mockFetchTasks.mockResolvedValue([]);
    mockUpdateTaskApi.mockRejectedValueOnce(new ApiError(404, null));
    await enqueue({
      type: 'update',
      taskId: 'deleted-elsewhere',
      payload: {title: 'local edit', priority: 'medium'},
    });

    await syncNow();

    expect(await readCache()).toEqual([]);
    expect(await listQueue()).toEqual([]);
  });

  it('keeps a local task whose mutation was queued while the sync was already running', async () => {
    // The user creates a task mid-sync: it is not in the (earlier) server
    // pull and this pass never drained it, but it must not be reconciled away.
    mockFetchTasks.mockResolvedValue([serverTask({id: '1'})]);
    await writeCache([serverTask({id: '1'})]);
    await enqueue({type: 'toggle', taskId: '1'});
    mockToggleTaskApi.mockImplementation(async () => {
      // The user adds a task while this pass's toggle is on the wire.
      const cache = await readCache();
      await writeCache([
        serverTask({id: 'tmp_new', title: 'Made mid-sync'}),
        ...cache,
      ]);
      await enqueue({
        type: 'create',
        taskId: 'tmp_new',
        payload: {title: 'Made mid-sync', priority: 'low'},
      });
      return serverTask({
        id: '1',
        completed: true,
        updatedAt: new Date().toISOString(),
      });
    });

    await syncNow();

    expect((await readCache()).map(t => t.id)).toEqual(['tmp_new', '1']);
    expect((await listQueue()).map(m => m.taskId)).toEqual(['tmp_new']);
  });

  it('notifies onCacheSynced listeners after a sync writes the cache', async () => {
    mockFetchTasks.mockResolvedValue([serverTask({id: 'from-server'})]);
    const listener = jest.fn();
    const unsubscribe = onCacheSynced(listener);

    await syncNow();
    unsubscribe();
    await syncNow();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('cancelPendingSync stops an in-flight sync from writing into a cache cleared by logout', async () => {
    mockFetchTasks.mockImplementation(async () => {
      // Logout lands while the pull is in flight.
      cancelPendingSync();
      await writeCache([]);
      return [serverTask({id: 'previous-users-task'})];
    });

    await syncNow();

    expect(await readCache()).toEqual([]);
  });

  it("resolveTaskId maps a drained create's temp id to its real id", async () => {
    mockFetchTasks.mockResolvedValue([]);
    mockCreateTaskApi.mockResolvedValue(serverTask({id: 'real-7'}));
    await writeCache([serverTask({id: 'tmp_7'})]);
    await enqueue({
      type: 'create',
      taskId: 'tmp_7',
      payload: {title: 'A', priority: 'low'},
    });

    expect(resolveTaskId('tmp_7')).toBe('tmp_7');
    await syncNow();

    expect(resolveTaskId('tmp_7')).toBe('real-7');
    expect(resolveTaskId('unrelated')).toBe('unrelated');
  });
});
