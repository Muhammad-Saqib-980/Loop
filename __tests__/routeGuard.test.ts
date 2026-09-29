import {resolveRedirect} from '../src/auth/routeGuard';

describe('resolveRedirect', () => {
  it('never redirects while auth status is loading', () => {
    expect(resolveRedirect('loading', 'index')).toBeNull();
    expect(resolveRedirect('loading', 'login')).toBeNull();
  });

  it('sends an anonymous user on a protected route to /login', () => {
    expect(resolveRedirect('anonymous', 'index')).toBe('/login');
  });

  it('leaves an anonymous user on a public route alone', () => {
    for (const route of ['login', 'register', 'verify-email', 'forgot-password', 'reset-password']) {
      expect(resolveRedirect('anonymous', route)).toBeNull();
    }
  });

  it('sends an authed user away from login/register to /', () => {
    expect(resolveRedirect('authed', 'login')).toBe('/');
    expect(resolveRedirect('authed', 'register')).toBe('/');
  });

  it('leaves an authed user on the task list, or on verify-email/forgot/reset routes, alone', () => {
    expect(resolveRedirect('authed', 'index')).toBeNull();
    expect(resolveRedirect('authed', 'verify-email')).toBeNull();
    expect(resolveRedirect('authed', 'forgot-password')).toBeNull();
    expect(resolveRedirect('authed', 'reset-password')).toBeNull();
  });
});
