import type {AuthStatus} from './AuthContext';

const PUBLIC_ROUTES = ['login', 'register', 'verify-email', 'forgot-password', 'reset-password'];
const AUTH_ONLY_ROUTES = ['login', 'register'];

export function resolveRedirect(status: AuthStatus, currentRoute: string): '/' | '/login' | null {
  if (status === 'loading') {
    return null;
  }
  const isPublic = PUBLIC_ROUTES.includes(currentRoute);
  if (status === 'anonymous' && !isPublic) {
    return '/login';
  }
  if (status === 'authed' && AUTH_ONLY_ROUTES.includes(currentRoute)) {
    return '/';
  }
  return null;
}
