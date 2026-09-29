const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export class EmailNotVerifiedError extends Error {}
export class InvalidCredentialsError extends Error {}

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

export async function registerApi(email: string, password: string): Promise<void> {
  await post('/auth/register', {email, password});
}

export async function resendVerificationApi(email: string): Promise<void> {
  await post('/auth/resend-verification', {email});
}

export async function verifyEmailApi(token: string): Promise<boolean> {
  const {status} = await post('/auth/verify-email', {token});
  return status === 200;
}

export async function forgotPasswordApi(email: string): Promise<void> {
  await post('/auth/forgot-password', {email});
}

export async function resetPasswordApi(token: string, newPassword: string): Promise<boolean> {
  const {status} = await post('/auth/reset-password', {token, newPassword});
  return status === 200;
}

export async function logoutApi(refreshToken: string): Promise<void> {
  await post('/auth/logout', {refreshToken});
}
