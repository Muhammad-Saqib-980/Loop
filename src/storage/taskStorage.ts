import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';
import type {NewTaskInput, Task} from '../types/task';
import {computeNextDueDate, todayISODate} from '../utils/recurrence';
import {syncWidget} from '../widgets/syncWidget';

const STORAGE_KEY = '@todo_app/tasks';

type Listener = (tasks: Task[]) => void;
const listeners = new Set<Listener>();

let cache: Task[] | null = null;

async function readTasks(): Promise<Task[]> {
  if (cache) {
    return cache;
  }
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  cache = raw ? (JSON.parse(raw) as Task[]) : [];
  return cache;
}

async function writeTasks(tasks: Task[]): Promise<void> {
  cache = tasks;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  listeners.forEach(l => l(tasks));
  syncWidget(tasks).catch(() => {});
}

export function subscribeToTasks(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function getTasks(): Promise<Task[]> {
  return readTasks();
}

export async function addTask(input: NewTaskInput): Promise<Task> {
  const tasks = await readTasks();
  const task: Task = {
    id: uuid.v4() as string,
    title: input.title.trim(),
    notes: input.notes?.trim() || undefined,
    priority: input.priority,
    dueDate: input.dueDate,
    completed: false,
    recurrence: input.recurrence,
    history: [],
    createdAt: new Date().toISOString(),
  };
  const next = [task, ...tasks];
  await writeTasks(next);
  return task;
}

export async function updateTask(
  id: string,
  changes: Partial<NewTaskInput>,
): Promise<void> {
  const tasks = await readTasks();
  const next = tasks.map(t =>
    t.id === id
      ? {
          ...t,
          ...changes,
          title: changes.title !== undefined ? changes.title.trim() : t.title,
        }
      : t,
  );
  await writeTasks(next);
}

export async function deleteTask(id: string): Promise<void> {
  const tasks = await readTasks();
  await writeTasks(tasks.filter(t => t.id !== id));
}

/**
 * Toggles a task's completion.
 * - One-time task: flips `completed`.
 * - Repeating task: logs today's completion in history and rolls dueDate
 *   forward to the next occurrence (or leaves it completed if the
 *   recurrence has ended). Un-completing a repeating task removes today's
 *   history entry.
 */
export async function toggleTaskComplete(id: string): Promise<void> {
  const tasks = await readTasks();
  const today = todayISODate();

  const next = tasks.map(t => {
    if (t.id !== id) {
      return t;
    }

    if (!t.recurrence) {
      return {...t, completed: !t.completed};
    }

    const alreadyDoneToday = t.history.includes(today);
    if (alreadyDoneToday) {
      return {...t, history: t.history.filter(d => d !== today)};
    }

    const nextDue = computeNextDueDate(t.recurrence, today);
    return {
      ...t,
      history: [...t.history, today],
      dueDate: nextDue ?? t.dueDate,
      completed: nextDue === null,
    };
  });

  await writeTasks(next);
}

export async function exportTasksAsJSON(): Promise<string> {
  const tasks = await readTasks();
  return JSON.stringify(tasks, null, 2);
}

export async function importTasksFromJSON(json: string): Promise<void> {
  const parsed = JSON.parse(json) as Task[];
  await writeTasks(parsed);
}

export async function clearLocalTaskCache(): Promise<void> {
  cache = null;
  listeners.forEach(l => l([]));
}
