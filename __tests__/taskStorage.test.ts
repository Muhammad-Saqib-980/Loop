import {
  addTask,
  clearLocalTaskCache,
  deleteTask,
  getTasks,
  subscribeToTasks,
  toggleTaskComplete,
  updateTask,
} from '../src/storage/taskStorage';
import {
  createTaskApi,
  deleteTaskApi,
  fetchTasks,
  toggleTaskApi,
  updateTaskApi,
} from '../src/api/tasks';
import {clearWidgetCache, writeWidgetCache} from '../src/storage/widgetCache';
import {syncWidget} from '../src/widgets/syncWidget';
import type {Task} from '../src/types/task';
import {Platform} from 'react-native';

jest.mock('../src/api/tasks');
jest.mock('../src/storage/widgetCache');
jest.mock('../src/widgets/syncWidget');

const mockFetchTasks = fetchTasks as jest.Mock;
const mockCreateTaskApi = createTaskApi as jest.Mock;
const mockUpdateTaskApi = updateTaskApi as jest.Mock;
const mockDeleteTaskApi = deleteTaskApi as jest.Mock;
const mockToggleTaskApi = toggleTaskApi as jest.Mock;
const mockWriteWidgetCache = writeWidgetCache as jest.Mock;
const mockClearWidgetCache = clearWidgetCache as jest.Mock;
const mockSyncWidget = syncWidget as jest.Mock;

const task1: Task = {id: '1', title: 'One', priority: 'medium', completed: false, history: [], createdAt: 't1', updatedAt: 't1'};
const task2: Task = {id: '2', title: 'Two', priority: 'low', completed: false, history: [], createdAt: 't2', updatedAt: 't2'};

describe('taskStorage (API-backed)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWriteWidgetCache.mockResolvedValue(undefined);
    mockClearWidgetCache.mockResolvedValue(undefined);
    mockSyncWidget.mockResolvedValue(undefined);
  });

  afterEach(() => {
    (Platform as any).OS = 'ios';
  });

  it('getTasks fetches from the API and notifies subscribers', async () => {
    mockFetchTasks.mockResolvedValue([task1, task2]);
    const listener = jest.fn();
    subscribeToTasks(listener);

    const result = await getTasks();

    expect(result).toEqual([task1, task2]);
    expect(listener).toHaveBeenCalledWith([task1, task2]);
    expect(mockWriteWidgetCache).toHaveBeenCalledWith([task1, task2]);
  });

  it('addTask prepends the created task to the in-memory cache and notifies', async () => {
    mockFetchTasks.mockResolvedValue([task1]);
    await getTasks();
    mockCreateTaskApi.mockResolvedValue(task2);

    const listener = jest.fn();
    subscribeToTasks(listener);
    const created = await addTask({title: 'Two', priority: 'low'});

    expect(created).toEqual(task2);
    expect(listener).toHaveBeenCalledWith([task2, task1]);
  });

  it('updateTask replaces the matching task in the cache', async () => {
    mockFetchTasks.mockResolvedValue([task1]);
    await getTasks();
    const updated = {...task1, title: 'One (edited)'};
    mockUpdateTaskApi.mockResolvedValue(updated);

    await updateTask('1', {title: 'One (edited)', priority: 'medium'});

    const listener = jest.fn();
    subscribeToTasks(listener);
    expect(listener).toHaveBeenCalledWith([updated]);
  });

  it('deleteTask removes the task from the cache', async () => {
    mockFetchTasks.mockResolvedValue([task1, task2]);
    await getTasks();
    mockDeleteTaskApi.mockResolvedValue(undefined);

    await deleteTask('1');

    const listener = jest.fn();
    subscribeToTasks(listener);
    expect(listener).toHaveBeenCalledWith([task2]);
  });

  it('toggleTaskComplete replaces the task with the server response', async () => {
    mockFetchTasks.mockResolvedValue([task1]);
    await getTasks();
    const toggled = {...task1, completed: true};
    mockToggleTaskApi.mockResolvedValue(toggled);

    await toggleTaskComplete('1');

    const listener = jest.fn();
    subscribeToTasks(listener);
    expect(listener).toHaveBeenCalledWith([toggled]);
  });

  it('subscribeToTasks immediately pushes the current cache to a new listener', async () => {
    mockFetchTasks.mockResolvedValue([task1]);
    await getTasks();

    const listener = jest.fn();
    subscribeToTasks(listener);
    expect(listener).toHaveBeenCalledWith([task1]);
  });

  it('clearLocalTaskCache resets the in-memory cache, notifies with an empty list, and clears the widget cache', async () => {
    mockFetchTasks.mockResolvedValue([task1]);
    await getTasks();

    await clearLocalTaskCache();

    expect(mockClearWidgetCache).toHaveBeenCalled();
    const listener = jest.fn();
    subscribeToTasks(listener);
    expect(listener).toHaveBeenCalledWith([]);
  });

  it('toggleTaskComplete refetches the full list when the in-memory cache has not been loaded yet (cold start)', async () => {
    // No prior getTasks() call — cache starts null, matching a fresh headless
    // JS runtime such as the widget's background task handler. The module-level
    // cache persists across tests in this file, so load a fresh copy of
    // taskStorage (and its mocked deps) to guarantee cache === null here.
    let storage!: typeof import('../src/storage/taskStorage');
    let api!: typeof import('../src/api/tasks');
    let widgetCache!: typeof import('../src/storage/widgetCache');
    jest.isolateModules(() => {
      storage = require('../src/storage/taskStorage');
      api = require('../src/api/tasks');
      widgetCache = require('../src/storage/widgetCache');
    });
    const isoFetchTasks = api.fetchTasks as jest.Mock;
    const isoToggleTaskApi = api.toggleTaskApi as jest.Mock;
    const isoWriteWidgetCache = widgetCache.writeWidgetCache as jest.Mock;
    isoWriteWidgetCache.mockResolvedValue(undefined);

    const toggled = {...task1, completed: true};
    isoToggleTaskApi.mockResolvedValue(toggled);
    isoFetchTasks.mockResolvedValue([toggled, task2]);

    await storage.toggleTaskComplete('1');

    expect(isoFetchTasks).toHaveBeenCalled();
    expect(isoWriteWidgetCache).toHaveBeenCalledWith([toggled, task2]);
  });

  it('getTasks syncs the widget on Android after a fetch', async () => {
    (Platform as any).OS = 'android';
    mockFetchTasks.mockResolvedValue([task1]);

    await getTasks();

    expect(mockSyncWidget).toHaveBeenCalledWith([task1]);
  });

  it('clearLocalTaskCache syncs the widget with an empty list on Android', async () => {
    (Platform as any).OS = 'android';
    mockFetchTasks.mockResolvedValue([task1]);
    await getTasks();

    await clearLocalTaskCache();

    expect(mockSyncWidget).toHaveBeenCalledWith([]);
  });
});
