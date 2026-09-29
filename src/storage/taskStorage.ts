import type {NewTaskInput, Task} from '../types/task';
import {
  createTaskApi,
  deleteTaskApi,
  fetchTasks,
  toggleTaskApi,
  updateTaskApi,
} from '../api/tasks';
import {clearWidgetCache, writeWidgetCache} from './widgetCache';

type Listener = (tasks: Task[]) => void;
const listeners = new Set<Listener>();

let cache: Task[] | null = null;

function setCache(tasks: Task[]): void {
  cache = tasks;
  listeners.forEach(l => l(tasks));
  writeWidgetCache(tasks).catch(() => {});
}

export function subscribeToTasks(listener: Listener): () => void {
  listeners.add(listener);
  if (cache) {
    listener(cache);
  }
  return () => listeners.delete(listener);
}

export async function getTasks(): Promise<Task[]> {
  const tasks = await fetchTasks();
  setCache(tasks);
  return tasks;
}

export async function addTask(input: NewTaskInput): Promise<Task> {
  const task = await createTaskApi(input);
  setCache([task, ...(cache ?? [])]);
  return task;
}

export async function updateTask(id: string, changes: Partial<NewTaskInput>): Promise<void> {
  const updated = await updateTaskApi(id, changes);
  setCache((cache ?? []).map(t => (t.id === id ? updated : t)));
}

export async function deleteTask(id: string): Promise<void> {
  await deleteTaskApi(id);
  setCache((cache ?? []).filter(t => t.id !== id));
}

export async function toggleTaskComplete(id: string): Promise<void> {
  const updated = await toggleTaskApi(id);
  setCache((cache ?? []).map(t => (t.id === id ? updated : t)));
}

export async function clearLocalTaskCache(): Promise<void> {
  cache = [];
  listeners.forEach(l => l([]));
  await clearWidgetCache();
}
