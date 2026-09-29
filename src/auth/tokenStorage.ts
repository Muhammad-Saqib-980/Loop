import {Platform} from 'react-native';
import * as SecureStore from 'expo-secure-store';

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

const ACCESS_KEY = 'todo_access_token';
const REFRESH_KEY = 'todo_refresh_token';

interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const nativeAdapter: StorageAdapter = {
  getItem: key => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: key => SecureStore.deleteItemAsync(key),
};

const webAdapter: StorageAdapter = {
  getItem: async key => (typeof localStorage === 'undefined' ? null : localStorage.getItem(key)),
  setItem: async (key, value) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  },
  removeItem: async key => {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  },
};

function getAdapter(): StorageAdapter {
  return Platform.OS === 'web' ? webAdapter : nativeAdapter;
}

export async function getTokens(): Promise<StoredTokens | null> {
  const adapter = getAdapter();
  const [accessToken, refreshToken] = await Promise.all([
    adapter.getItem(ACCESS_KEY),
    adapter.getItem(REFRESH_KEY),
  ]);
  if (!accessToken || !refreshToken) {
    return null;
  }
  return {accessToken, refreshToken};
}

export async function setTokens(tokens: StoredTokens): Promise<void> {
  const adapter = getAdapter();
  await Promise.all([
    adapter.setItem(ACCESS_KEY, tokens.accessToken),
    adapter.setItem(REFRESH_KEY, tokens.refreshToken),
  ]);
}

export async function clearTokens(): Promise<void> {
  const adapter = getAdapter();
  await Promise.all([adapter.removeItem(ACCESS_KEY), adapter.removeItem(REFRESH_KEY)]);
}
