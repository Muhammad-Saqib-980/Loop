import AsyncStorage from '@react-native-async-storage/async-storage';
import type {Task} from '../types/task';

const CACHE_KEY = '@todo_app/widget_cache';

export async function writeWidgetCache(tasks: Task[]): Promise<void> {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(tasks));
}

export async function readWidgetCache(): Promise<Task[]> {
  const raw = await AsyncStorage.getItem(CACHE_KEY);
  return raw ? (JSON.parse(raw) as Task[]) : [];
}

export async function clearWidgetCache(): Promise<void> {
  await AsyncStorage.removeItem(CACHE_KEY);
}
