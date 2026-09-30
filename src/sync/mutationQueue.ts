import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';
import type {NewTaskInput} from '../types/task';
import {createLock} from './lock';

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

// Every read-modify-write below runs under this lock: a user's enqueue()
// racing a drain's removeMutation() would otherwise drop the new entry, or
// resurrect a sent one (a duplicate create on the next sync).
const withQueueLock = createLock();

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
  return withQueueLock(async () => {
    const queue = await readQueue();
    const entry: QueuedMutation = {
      ...mutation,
      id: uuid.v4(),
      clientTimestamp: new Date().toISOString(),
    };
    queue.push(entry);
    await writeQueue(queue);
    return entry;
  });
}

export async function listQueue(): Promise<QueuedMutation[]> {
  return withQueueLock(readQueue);
}

export async function removeMutation(id: string): Promise<void> {
  return withQueueLock(async () => {
    const queue = await readQueue();
    await writeQueue(queue.filter(m => m.id !== id));
  });
}

export async function removeMutations(ids: string[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const idSet = new Set(ids);
  return withQueueLock(async () => {
    const queue = await readQueue();
    await writeQueue(queue.filter(m => !idSet.has(m.id)));
  });
}

export async function remapTaskId(oldId: string, newId: string): Promise<void> {
  return withQueueLock(async () => {
    const queue = await readQueue();
    await writeQueue(
      queue.map(m => (m.taskId === oldId ? {...m, taskId: newId} : m)),
    );
  });
}

export async function clearQueue(): Promise<void> {
  return withQueueLock(() => AsyncStorage.removeItem(QUEUE_KEY));
}

export async function hasPendingMutations(): Promise<boolean> {
  const queue = await listQueue();
  return queue.length > 0;
}
