import {apiFetch} from './client';
import type {NewTaskInput, Priority, Recurrence, Task} from '../types/task';

interface TaskResponse {
  id: string;
  userId: string;
  title: string;
  notes: string | null;
  priority: Priority;
  dueDate: string | null;
  completed: boolean;
  recurrence: Recurrence | null;
  history: string[];
  createdAt: string;
  updatedAt: string;
}

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

export async function fetchTasks(): Promise<Task[]> {
  const rows = await apiFetch<TaskResponse[]>('/tasks', {method: 'GET'});
  return rows.map(toTask);
}

export async function createTaskApi(input: NewTaskInput): Promise<Task> {
  const row = await apiFetch<TaskResponse>('/tasks', {
    method: 'POST',
    body: JSON.stringify({
      title: input.title,
      notes: input.notes,
      priority: input.priority,
      dueDate: input.dueDate,
      recurrence: input.recurrence,
    }),
  });
  return toTask(row);
}

// Assumes `changes` always carries the full current field set (true of this
// app's only caller, TaskEditorModal.handleSave via App/taskStorage), so an
// `undefined` value here means "the user cleared this field" and must be
// sent as an explicit `null` - the backend only clears dueDate/recurrence/
// notes on an explicit null, never on a field the JSON body simply omits.
export async function updateTaskApi(id: string, changes: Partial<NewTaskInput>): Promise<Task> {
  const row = await apiFetch<TaskResponse>(`/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: changes.title,
      notes: changes.notes ?? null,
      priority: changes.priority,
      dueDate: changes.dueDate ?? null,
      recurrence: changes.recurrence ?? null,
    }),
  });
  return toTask(row);
}

export async function deleteTaskApi(id: string): Promise<void> {
  await apiFetch<void>(`/tasks/${id}`, {method: 'DELETE'});
}

export async function toggleTaskApi(id: string): Promise<Task> {
  const row = await apiFetch<TaskResponse>(`/tasks/${id}/toggle`, {method: 'POST'});
  return toTask(row);
}
