import type {Task} from '../src/types/task';
import {Platform} from 'react-native';

jest.mock('../src/sync/localTaskCache');
jest.mock('../src/sync/mutationQueue');
jest.mock('../src/sync/syncEngine');
jest.mock('../src/sync/optimisticToggle');
jest.mock('../src/storage/widgetCache');
jest.mock('../src/widgets/syncWidget');

const task1: Task = {
  id: '1',
  title: 'One',
  priority: 'medium',
  completed: false,
  history: [],
  createdAt: 't1',
  updatedAt: 't1',
};
const task2: Task = {
  id: '2',
  title: 'Two',
  priority: 'low',
  completed: false,
  history: [],
  createdAt: 't2',
  updatedAt: 't2',
};

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
    (syncEngine.resolveTaskId as jest.Mock).mockImplementation(
      (id: string) => id,
    );
    (widgetCache.writeWidgetCache as jest.Mock).mockResolvedValue(undefined);
    (widgetCache.clearWidgetCache as jest.Mock).mockResolvedValue(undefined);
    (syncWidgetModule.syncWidget as jest.Mock).mockResolvedValue(undefined);
    (Platform as any).OS = 'ios';
  });

  it('getTasks reads from the local cache, tags pending: false when nothing is queued, and triggers a background sync', async () => {
    (localTaskCache.readCache as jest.Mock).mockResolvedValue([task1, task2]);

    const result = await storage.getTasks();

    expect(result).toEqual([
      {...task1, pending: false},
      {...task2, pending: false},
    ]);
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
    (mutationQueue.listQueue as jest.Mock).mockImplementation(
      async () => queued,
    );
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

  it("toggleTaskComplete applies applyOptimisticToggle's result locally and enqueues a toggle mutation", async () => {
    (localTaskCache.readCache as jest.Mock).mockResolvedValue([task1]);
    await storage.getTasks();
    const toggled = {...task1, completed: true};
    (optimisticToggle.applyOptimisticToggle as jest.Mock).mockReturnValue(
      toggled,
    );

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

    expect(syncWidgetModule.syncWidget).toHaveBeenCalledWith([
      {...task1, pending: false},
    ]);
  });

  it('does not sync the widget on iOS/web', async () => {
    (localTaskCache.readCache as jest.Mock).mockResolvedValue([task1]);

    await storage.getTasks();

    expect(syncWidgetModule.syncWidget).not.toHaveBeenCalled();
    expect(widgetCache.writeWidgetCache).toHaveBeenCalledWith([
      {...task1, pending: false},
    ]);
  });

  it('re-reads the local cache and notifies listeners when a sync pass completes', async () => {
    (localTaskCache.readCache as jest.Mock).mockResolvedValue([task1]);
    await storage.getTasks();
    const listener = jest.fn();
    storage.subscribeToTasks(listener);
    listener.mockClear();

    const synced = {...task1, id: 'real-1'};
    (localTaskCache.readCache as jest.Mock).mockResolvedValue([synced]);
    const onSynced = (syncEngine.onCacheSynced as jest.Mock).mock.calls[0][0];
    onSynced();

    await new Promise(process.nextTick);
    expect(listener).toHaveBeenCalledWith([{...synced, pending: false}]);
  });

  it('mutators apply to the freshly-read cache, so a change made by a sync pass is not overwritten', async () => {
    (localTaskCache.readCache as jest.Mock).mockResolvedValue([task1]);
    await storage.getTasks();
    // A sync pass has since remapped/added rows in the persisted cache.
    const synced = {...task1, id: 'real-1'};
    (localTaskCache.readCache as jest.Mock).mockResolvedValue([synced, task2]);

    await storage.deleteTask('2');

    expect(localTaskCache.writeCache).toHaveBeenLastCalledWith([synced]);
  });

  it('clearLocalTaskCache cancels any in-flight sync before clearing', async () => {
    await storage.clearLocalTaskCache();

    expect(syncEngine.cancelPendingSync).toHaveBeenCalled();
  });

  it('resolves a stale temp id to its synced real id before mutating', async () => {
    const synced = {...task1, id: 'real-1'};
    (localTaskCache.readCache as jest.Mock).mockResolvedValue([synced]);
    (syncEngine.resolveTaskId as jest.Mock).mockImplementation((id: string) =>
      id === 'tmp_1' ? 'real-1' : id,
    );
    (optimisticToggle.applyOptimisticToggle as jest.Mock).mockReturnValue({
      ...synced,
      completed: true,
    });

    await storage.toggleTaskComplete('tmp_1');

    expect(optimisticToggle.applyOptimisticToggle).toHaveBeenCalledWith(synced);
    expect(mutationQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({type: 'toggle', taskId: 'real-1'}),
    );
  });
});
