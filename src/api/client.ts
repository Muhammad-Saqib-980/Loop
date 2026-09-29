import {clearTokens, getTokens, setTokens} from '../auth/tokenStorage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`API error ${status}`);
    this.status = status;
    this.body = body;
  }
}

// Deduplicates concurrent refresh attempts: if two requests hit a 401 at the
// same time, they must share one /auth/refresh call, not each make their
// own — the backend revokes the whole refresh-token family when a
// rotated/already-used token is presented again, so two independent
// refreshes using the same stale token would force-logout the user.
let refreshPromise: Promise<string | null> | null = null;

// Set by AuthContext so the app can react (clear cache, flip to
// 'anonymous') when a refresh genuinely fails — e.g. the session was
// revoked elsewhere. Not called on a transient/server error; see doRefresh.
type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function doRefresh(): Promise<string | null> {
  const tokens = await getTokens();
  if (!tokens) {
    return null;
  }
  const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({refreshToken: tokens.refreshToken}),
  });
  if (res.status === 401) {
    await clearTokens();
    unauthorizedHandler?.();
    return null;
  }
  if (!res.ok) {
    return null;
  }
  const data = await res.json();
  await setTokens({accessToken: data.accessToken, refreshToken: data.refreshToken});
  return data.accessToken as string;
}

export async function apiFetch<T>(
  path: string,
  options: {method: string; body?: string} = {method: 'GET'},
): Promise<T> {
  async function send(accessToken: string | null): Promise<Response> {
    const headers: Record<string, string> = {'Content-Type': 'application/json'};
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    return fetch(`${API_BASE_URL}${path}`, {
      method: options.method,
      headers,
      body: options.body,
    });
  }

  const tokens = await getTokens();
  let res = await send(tokens?.accessToken ?? null);

  if (res.status === 401) {
    const newAccessToken = await refreshAccessToken();
    if (!newAccessToken) {
      throw new ApiError(401, null);
    }
    res = await send(newAccessToken);
  }

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    throw new ApiError(res.status, body);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}
