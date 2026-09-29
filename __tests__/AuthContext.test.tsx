import React from 'react';
import {Text} from 'react-native';
import {act, render, waitFor} from '@testing-library/react-native';
import {AuthProvider, useAuth} from '../src/auth/AuthContext';
import {clearTokens, getTokens, setTokens} from '../src/auth/tokenStorage';
import {loginApi, logoutApi, registerApi} from '../src/api/auth';
import {clearLocalTaskCache} from '../src/storage/taskStorage';
import {setUnauthorizedHandler} from '../src/api/client';

jest.mock('../src/auth/tokenStorage');
jest.mock('../src/api/auth');
jest.mock('../src/storage/taskStorage', () => ({
  clearLocalTaskCache: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/api/client', () => ({
  setUnauthorizedHandler: jest.fn(),
}));

const mockGetTokens = getTokens as jest.Mock;
const mockSetTokens = setTokens as jest.Mock;
const mockClearTokens = clearTokens as jest.Mock;
const mockLoginApi = loginApi as jest.Mock;
const mockRegisterApi = registerApi as jest.Mock;
const mockLogoutApi = logoutApi as jest.Mock;
const mockClearLocalTaskCache = clearLocalTaskCache as jest.Mock;
const mockSetUnauthorizedHandler = setUnauthorizedHandler as jest.Mock;

function Probe() {
  const auth = useAuth();
  return <Text>status:{auth.status}</Text>;
}

describe('AuthProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts loading, then resolves to anonymous when no tokens are stored', async () => {
    mockGetTokens.mockResolvedValue(null);
    const {getByText} = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(getByText('status:loading')).toBeTruthy();
    await waitFor(() => expect(getByText('status:anonymous')).toBeTruthy());
  });

  it('resolves to authed when tokens are already stored', async () => {
    mockGetTokens.mockResolvedValue({accessToken: 'a', refreshToken: 'r'});
    const {getByText} = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(getByText('status:authed')).toBeTruthy());
  });

  it('login stores tokens and flips status to authed', async () => {
    mockGetTokens.mockResolvedValue(null);
    mockLoginApi.mockResolvedValue({accessToken: 'a1', refreshToken: 'r1'});

    let auth: ReturnType<typeof useAuth> | null = null;
    function Capture() {
      auth = useAuth();
      return null;
    }
    const {getByText} = render(
      <AuthProvider>
        <Capture />
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(getByText('status:anonymous')).toBeTruthy());

    await act(async () => {
      await auth!.login('a@b.com', 'password123');
    });

    expect(mockSetTokens).toHaveBeenCalledWith({accessToken: 'a1', refreshToken: 'r1'});
    expect(getByText('status:authed')).toBeTruthy();
  });

  it('logout clears tokens, clears the local task cache, and flips status to anonymous', async () => {
    mockGetTokens.mockResolvedValue({accessToken: 'a', refreshToken: 'r'});
    mockLogoutApi.mockResolvedValue(undefined);

    let auth: ReturnType<typeof useAuth> | null = null;
    function Capture() {
      auth = useAuth();
      return null;
    }
    const {getByText} = render(
      <AuthProvider>
        <Capture />
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(getByText('status:authed')).toBeTruthy());

    await act(async () => {
      await auth!.logout();
    });

    expect(mockLogoutApi).toHaveBeenCalledWith('r');
    expect(mockClearTokens).toHaveBeenCalled();
    expect(mockClearLocalTaskCache).toHaveBeenCalled();
    expect(getByText('status:anonymous')).toBeTruthy();
  });

  it('register calls the register API without changing auth status', async () => {
    mockGetTokens.mockResolvedValue(null);
    mockRegisterApi.mockResolvedValue(undefined);

    let auth: ReturnType<typeof useAuth> | null = null;
    function Capture() {
      auth = useAuth();
      return null;
    }
    const {getByText} = render(
      <AuthProvider>
        <Capture />
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(getByText('status:anonymous')).toBeTruthy());

    await act(async () => {
      await auth!.register('a@b.com', 'password123');
    });

    expect(mockRegisterApi).toHaveBeenCalledWith('a@b.com', 'password123');
    expect(getByText('status:anonymous')).toBeTruthy();
  });

  it('registers an unauthorized handler that clears the task cache and flips status to anonymous', async () => {
    mockGetTokens.mockResolvedValue({accessToken: 'a', refreshToken: 'r'});
    const {getByText} = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(getByText('status:authed')).toBeTruthy());

    const registeredHandler = mockSetUnauthorizedHandler.mock.calls[0][0];
    await act(async () => {
      registeredHandler();
    });

    expect(mockClearLocalTaskCache).toHaveBeenCalled();
    expect(getByText('status:anonymous')).toBeTruthy();
  });

  it('useAuth throws when used outside a provider', () => {
    function Bare() {
      useAuth();
      return null;
    }
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Bare />)).toThrow('useAuth must be used within an AuthProvider');
    consoleError.mockRestore();
  });
});
