import {Platform} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {clearTokens, getTokens, setTokens} from '../src/auth/tokenStorage';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const mockSecureStore = SecureStore as jest.Mocked<typeof SecureStore>;

describe('tokenStorage on native', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as any).OS = 'ios';
  });

  it('returns null when no tokens are stored', async () => {
    mockSecureStore.getItemAsync.mockResolvedValue(null);
    expect(await getTokens()).toBeNull();
  });

  it('stores and retrieves both tokens via SecureStore', async () => {
    mockSecureStore.getItemAsync.mockImplementation(async key =>
      key === 'todo_access_token' ? 'access-1' : key === 'todo_refresh_token' ? 'refresh-1' : null,
    );
    await setTokens({accessToken: 'access-1', refreshToken: 'refresh-1'});
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith('todo_access_token', 'access-1');
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith('todo_refresh_token', 'refresh-1');

    const tokens = await getTokens();
    expect(tokens).toEqual({accessToken: 'access-1', refreshToken: 'refresh-1'});
  });

  it('clears both keys via SecureStore', async () => {
    await clearTokens();
    expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('todo_access_token');
    expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('todo_refresh_token');
  });
});

describe('tokenStorage on web', () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as any).OS = 'web';
    for (const key of Object.keys(store)) {
      delete store[key];
    }
    (global as any).localStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    };
  });

  afterEach(() => {
    (Platform as any).OS = 'ios';
    delete (global as any).localStorage;
  });

  it('stores and retrieves both tokens via localStorage, without touching SecureStore', async () => {
    await setTokens({accessToken: 'web-access', refreshToken: 'web-refresh'});
    expect(mockSecureStore.setItemAsync).not.toHaveBeenCalled();

    const tokens = await getTokens();
    expect(tokens).toEqual({accessToken: 'web-access', refreshToken: 'web-refresh'});
  });

  it('clears both keys via localStorage', async () => {
    await setTokens({accessToken: 'web-access', refreshToken: 'web-refresh'});
    await clearTokens();
    expect(await getTokens()).toBeNull();
  });
});
