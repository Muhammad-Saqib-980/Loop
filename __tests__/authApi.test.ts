import {
  EmailNotVerifiedError,
  InvalidCredentialsError,
  forgotPasswordApi,
  loginApi,
  logoutApi,
  registerApi,
  resendVerificationApi,
  resetPasswordApi,
  verifyEmailApi,
} from '../src/api/auth';

function mockFetchOnce(status: number, body: unknown) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    status,
    json: async () => body,
  });
}

describe('auth API', () => {
  beforeEach(() => {
    (global as any).fetch = jest.fn();
  });

  it('loginApi returns tokens on success', async () => {
    mockFetchOnce(200, {accessToken: 'a1', refreshToken: 'r1'});
    const result = await loginApi('a@b.com', 'password123');
    expect(result).toEqual({accessToken: 'a1', refreshToken: 'r1'});
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/auth/login');
    expect(JSON.parse(init.body)).toEqual({email: 'a@b.com', password: 'password123'});
  });

  it('loginApi throws EmailNotVerifiedError on 403 EMAIL_NOT_VERIFIED', async () => {
    mockFetchOnce(403, {error: 'Email not verified', code: 'EMAIL_NOT_VERIFIED'});
    await expect(loginApi('a@b.com', 'password123')).rejects.toBeInstanceOf(EmailNotVerifiedError);
  });

  it('loginApi throws InvalidCredentialsError on 401', async () => {
    mockFetchOnce(401, {error: 'Invalid credentials'});
    await expect(loginApi('a@b.com', 'wrong')).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('registerApi resolves on a 200 response', async () => {
    mockFetchOnce(200, {message: 'ok'});
    await expect(registerApi('a@b.com', 'password123')).resolves.toBeUndefined();
  });

  it('resendVerificationApi always resolves', async () => {
    mockFetchOnce(200, {message: 'ok'});
    await expect(resendVerificationApi('a@b.com')).resolves.toBeUndefined();
  });

  it('verifyEmailApi returns true on 200, false otherwise', async () => {
    mockFetchOnce(200, {message: 'Email verified'});
    expect(await verifyEmailApi('good-token')).toBe(true);

    mockFetchOnce(400, {error: 'Invalid or expired token'});
    expect(await verifyEmailApi('bad-token')).toBe(false);
  });

  it('forgotPasswordApi always resolves', async () => {
    mockFetchOnce(200, {message: 'ok'});
    await expect(forgotPasswordApi('a@b.com')).resolves.toBeUndefined();
  });

  it('resetPasswordApi returns true on 200, false otherwise', async () => {
    mockFetchOnce(200, {message: 'Password updated'});
    expect(await resetPasswordApi('good-token', 'newpassword1')).toBe(true);

    mockFetchOnce(400, {error: 'Invalid or expired token'});
    expect(await resetPasswordApi('bad-token', 'newpassword1')).toBe(false);
  });

  it('logoutApi sends the refresh token', async () => {
    mockFetchOnce(200, {message: 'Logged out'});
    await logoutApi('r1');
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/auth/logout');
    expect(JSON.parse(init.body)).toEqual({refreshToken: 'r1'});
  });
});
