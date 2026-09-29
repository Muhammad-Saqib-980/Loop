import React, {createContext, useCallback, useContext, useEffect, useState} from 'react';
import {clearTokens, getTokens, setTokens} from './tokenStorage';
import {loginApi, logoutApi, registerApi} from '../api/auth';
import {clearLocalTaskCache} from '../storage/taskStorage';

export type AuthStatus = 'loading' | 'authed' | 'anonymous';

interface AuthContextValue {
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({children}: {children: React.ReactNode}) {
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    getTokens().then(tokens => {
      setStatus(tokens ? 'authed' : 'anonymous');
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const {accessToken, refreshToken} = await loginApi(email, password);
    await setTokens({accessToken, refreshToken});
    setStatus('authed');
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    await registerApi(email, password);
  }, []);

  const logout = useCallback(async () => {
    const tokens = await getTokens();
    if (tokens) {
      await logoutApi(tokens.refreshToken).catch(() => {});
    }
    await clearTokens();
    await clearLocalTaskCache();
    setStatus('anonymous');
  }, []);

  return (
    <AuthContext.Provider value={{status, login, register, logout}}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
