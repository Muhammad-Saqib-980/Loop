const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export class EmailNotVerifiedError extends Error {}
export class InvalidCredentialsError extends Error {}
// The server has no email provider configured, so it can't send
// verification or password-reset emails.
export class EmailDisabledError extends Error {}

interface PostResult<T> {
  status: number;
  data: T;
}

async function post<T>(path: string, body: unknown): Promise<PostResult<T>> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return {status: res.status, data};
}

function throwIfEmailDisabled(status: number, data: any): void {
  if (status === 503 && data?.code === 'EMAIL_DISABLED') {
    throw new EmailDisabledError();
  }
}

export interface AuthConfig {
  emailVerificationRequired: boolean;
  emailEnabled: boolean;
}

// Returns null when the config can't be fetched (offline, older server), so
// callers fall back to their default email-based wording.
export async function getAuthConfigApi(): Promise<AuthConfig | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/config`);
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    return {
      emailVerificationRequired: data.emailVerificationRequired !== false,
      emailEnabled: data.emailEnabled !== false,
    };
  } catch {
    return null;
  }
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
}

export async function loginApi(email: string, password: string): Promise<LoginResult> {
  const {status, data} = await post<any>('/auth/login', {email, password});
  if (status === 403 && data?.code === 'EMAIL_NOT_VERIFIED') {
    throw new EmailNotVerifiedError();
  }
  if (status !== 200) {
    throw new InvalidCredentialsError();
  }
  return {accessToken: data.accessToken, refreshToken: data.refreshToken};
}

export interface RegisterResult {
  emailVerificationRequired: boolean;
}

export async function registerApi(email: string, password: string): Promise<RegisterResult> {
  const {data} = await post<any>('/auth/register', {email, password});
  return {emailVerificationRequired: data?.emailVerificationRequired !== false};
}

export async function resendVerificationApi(email: string): Promise<void> {
  const {status, data} = await post<any>('/auth/resend-verification', {email});
  throwIfEmailDisabled(status, data);
}

export async function verifyEmailApi(token: string): Promise<boolean> {
  const {status} = await post('/auth/verify-email', {token});
  return status === 200;
}

export async function forgotPasswordApi(email: string): Promise<void> {
  const {status, data} = await post<any>('/auth/forgot-password', {email});
  throwIfEmailDisabled(status, data);
}

export async function resetPasswordApi(token: string, newPassword: string): Promise<boolean> {
  const {status} = await post('/auth/reset-password', {token, newPassword});
  return status === 200;
}

export async function logoutApi(refreshToken: string): Promise<void> {
  await post('/auth/logout', {refreshToken});
}
