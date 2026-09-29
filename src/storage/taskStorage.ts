import type {NewTaskInput, Task} from '../types/task';
import {
  createTaskApi,
  deleteTaskApi,
  fetchTasks,
  toggleTaskApi,
  updateTaskApi,
} from '../api/tasks';
import {clearWidgetCache, writeWidgetCache} from './widgetCache';
import {syncWidget} from '../widgets/syncWidget';
import {Platform} from 'react-native';

type Listener = (tasks: Task[]) => void;
const listeners = new Set<Listener>();

let cache: Task[] | null = null;

function setCache(tasks: Task[]): void {
  cache = tasks;
  listeners.forEach(l => l(tasks));
  writeWidgetCache(tasks).catch(() => {});
  if (Platform.OS === 'android') {
    syncWidget(tasks).catch(() => {});
  }
}

/**
 * Returns the current in-memory cache, refetching from the backend first if
 * this JS runtime has never populated it (e.g. a fresh headless process).
 * Without this, a mutator running before the first getTasks() would treat
 * "cache not loaded yet" as "task list is empty" and overwrite the widget's
 * stored snapshot with [].
 */
async function ensureCache(): Promise<Task[]> {
  if (cache === null) {
    cache = await fetchTasks();
  }
  return cache;
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
  const current = await ensureCache();
  setCache([task, ...current]);
  return task;
}

export async function updateTask(id: string, changes: Partial<NewTaskInput>): Promise<void> {
  const updated = await updateTaskApi(id, changes);
  const current = await ensureCache();
  setCache(current.map(t => (t.id === id ? updated : t)));
}

export async function deleteTask(id: string): Promise<void> {
  await deleteTaskApi(id);
  const current = await ensureCache();
  setCache(current.filter(t => t.id !== id));
}

export async function toggleTaskComplete(id: string): Promise<void> {
  const updated = await toggleTaskApi(id);
  const current = await ensureCache();
  setCache(current.map(t => (t.id === id ? updated : t)));
}

export async function clearLocalTaskCache(): Promise<void> {
  cache = [];
  listeners.forEach(l => l([]));
  await clearWidgetCache();
  if (Platform.OS === 'android') {
    syncWidget([]).catch(() => {});
  }
}
