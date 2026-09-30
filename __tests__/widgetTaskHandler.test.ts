import {widgetTaskHandler} from '../src/widgets/widget-task-handler';
import {getTasks, toggleTaskComplete} from '../src/storage/taskStorage';
import {readWidgetCache} from '../src/storage/widgetCache';
import type {Task} from '../src/types/task';

jest.mock('../src/storage/taskStorage');
jest.mock('../src/storage/widgetCache');

const mockGetTasks = getTasks as jest.Mock;
const mockToggleTaskComplete = toggleTaskComplete as jest.Mock;
const mockReadWidgetCache = readWidgetCache as jest.Mock;

const cachedTask: Task = {id: '1', title: 'Cached', priority: 'medium', completed: false, history: [], createdAt: 't1', updatedAt: 't1'};
const freshTask: Task = {id: '1', title: 'Fresh', priority: 'medium', completed: false, history: [], createdAt: 't1', updatedAt: 't1'};

describe('widgetTaskHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('on WIDGET_UPDATE, renders the cached snapshot immediately, then re-renders with live data', async () => {
    mockReadWidgetCache.mockResolvedValue([cachedTask]);
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

    resolveGetTasks([freshTask]);
    await new Promise(process.nextTick);
    expect(renderWidget).toHaveBeenCalledTimes(2);
  });

  it('on a live-refresh failure, does not throw and keeps only the cached render', async () => {
    mockReadWidgetCache.mockResolvedValue([cachedTask]);
    mockGetTasks.mockRejectedValue(new Error('network down'));

    const renderWidget = jest.fn();
    await widgetTaskHandler({widgetAction: 'WIDGET_UPDATE', renderWidget} as any);
    await new Promise(process.nextTick);

    expect(renderWidget).toHaveBeenCalledTimes(1);
  });

  it('on WIDGET_CLICK with TOGGLE_TASK, toggles then re-renders from the cache', async () => {
    mockToggleTaskComplete.mockResolvedValue(undefined);
    mockReadWidgetCache.mockResolvedValue([freshTask]);

    const renderWidget = jest.fn();
    await widgetTaskHandler({
      widgetAction: 'WIDGET_CLICK',
      clickAction: 'TOGGLE_TASK',
      clickActionData: {taskId: '1'},
      renderWidget,
    } as any);

    expect(mockToggleTaskComplete).toHaveBeenCalledWith('1');
    expect(renderWidget).toHaveBeenCalledWith(expect.anything());
  });

  it('on WIDGET_CLICK when the toggle API call fails, still re-renders from the cache without throwing', async () => {
    mockToggleTaskComplete.mockRejectedValue(new Error('offline'));
    mockReadWidgetCache.mockResolvedValue([cachedTask]);

    const renderWidget = jest.fn();
    await expect(
      widgetTaskHandler({
        widgetAction: 'WIDGET_CLICK',
        clickAction: 'TOGGLE_TASK',
        clickActionData: {taskId: '1'},
        renderWidget,
      } as any),
    ).resolves.toBeUndefined();

    expect(renderWidget).toHaveBeenCalled();
  });
});
