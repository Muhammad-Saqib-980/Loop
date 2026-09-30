import {resolveRedirect} from '../src/auth/routeGuard';

describe('resolveRedirect', () => {
  it('never redirects while auth status is loading', () => {
    expect(resolveRedirect('loading', 'index', false)).toBeNull();
    expect(resolveRedirect('loading', 'login', true)).toBeNull();
  });

  it('sends an anonymous user on a protected route to /login in the native app', () => {
    expect(resolveRedirect('anonymous', 'index', false)).toBe('/login');
  });

  it('sends an anonymous user on a protected route to /welcome on the web', () => {
    expect(resolveRedirect('anonymous', 'index', true)).toBe('/welcome');
  });

  it('leaves an anonymous user on a public route alone', () => {
    for (const route of [
      'welcome',
      'login',
      'register',
      'verify-email',
      'forgot-password',
      'reset-password',
    ]) {
      expect(resolveRedirect('anonymous', route, false)).toBeNull();
      expect(resolveRedirect('anonymous', route, true)).toBeNull();
    }
  });

  it('sends an authed user away from welcome/login/register to /', () => {
    expect(resolveRedirect('authed', 'welcome', true)).toBe('/');
    expect(resolveRedirect('authed', 'login', false)).toBe('/');
    expect(resolveRedirect('authed', 'register', false)).toBe('/');
  });

  it('leaves an authed user on the task list, or on verify-email/forgot/reset routes, alone', () => {
    expect(resolveRedirect('authed', 'index', false)).toBeNull();
    expect(resolveRedirect('authed', 'verify-email', false)).toBeNull();
    expect(resolveRedirect('authed', 'forgot-password', false)).toBeNull();
    expect(resolveRedirect('authed', 'reset-password', false)).toBeNull();
  });
});
