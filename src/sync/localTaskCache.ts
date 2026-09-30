import AsyncStorage from '@react-native-async-storage/async-storage';
import type {Task} from '../types/task';

const CACHE_KEY = '@todo_app/local_task_cache';

export async function readCache(): Promise<Task[]> {
  const raw = await AsyncStorage.getItem(CACHE_KEY);
  return raw ? (JSON.parse(raw) as Task[]) : [];
}

export async function writeCache(tasks: Task[]): Promise<void> {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(tasks));
}

export async function clearCache(): Promise<void> {
  await AsyncStorage.removeItem(CACHE_KEY);
}
