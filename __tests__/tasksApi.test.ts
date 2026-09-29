import {apiFetch} from '../src/api/client';
import {
  createTaskApi,
  deleteTaskApi,
  fetchTasks,
  toggleTaskApi,
  updateTaskApi,
} from '../src/api/tasks';

jest.mock('../src/api/client');
const mockApiFetch = apiFetch as jest.Mock;

const backendTaskRow = {
  id: '1',
  userId: 'u1',
  title: 'Write plan',
  notes: null,
  priority: 'high',
  dueDate: null,
  completed: false,
  recurrence: null,
  history: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('tasks API mapping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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
      },
    ]);
  });

  it('createTaskApi posts the new-task fields and maps the response', async () => {
    mockApiFetch.mockResolvedValue(backendTaskRow);
    const task = await createTaskApi({title: 'Write plan', priority: 'high'});
    expect(mockApiFetch).toHaveBeenCalledWith('/tasks', {
      method: 'POST',
      body: JSON.stringify({title: 'Write plan', notes: undefined, priority: 'high', dueDate: undefined, recurrence: undefined}),
    });
    expect(task.id).toBe('1');
    expect(task.notes).toBeUndefined();
  });

  it('updateTaskApi sends explicit null for cleared dueDate/recurrence/notes, not an omitted field', async () => {
    mockApiFetch.mockResolvedValue(backendTaskRow);
    await updateTaskApi('1', {
      title: 'Write plan',
      notes: undefined,
      priority: 'high',
      dueDate: undefined,
      recurrence: undefined,
    });
    expect(mockApiFetch).toHaveBeenCalledWith('/tasks/1', {
      method: 'PATCH',
      body: JSON.stringify({title: 'Write plan', notes: null, priority: 'high', dueDate: null, recurrence: null}),
    });
    const sentBody = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    expect(sentBody).toHaveProperty('dueDate', null);
    expect(sentBody).toHaveProperty('recurrence', null);
    expect(sentBody).toHaveProperty('notes', null);
  });

  it('deleteTaskApi calls DELETE on the task id', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await deleteTaskApi('1');
    expect(mockApiFetch).toHaveBeenCalledWith('/tasks/1', {method: 'DELETE'});
  });

  it('toggleTaskApi calls POST on the toggle endpoint and maps the response', async () => {
    mockApiFetch.mockResolvedValue({...backendTaskRow, completed: true});
    const task = await toggleTaskApi('1');
    expect(mockApiFetch).toHaveBeenCalledWith('/tasks/1/toggle', {method: 'POST'});
    expect(task.completed).toBe(true);
  });
});
