import type {AuthStatus} from './AuthContext';

const PUBLIC_ROUTES = [
  'welcome',
  'login',
  'register',
  'verify-email',
  'forgot-password',
  'reset-password',
];
const AUTH_ONLY_ROUTES = ['welcome', 'login', 'register'];

export function resolveRedirect(
  status: AuthStatus,
  currentRoute: string,
  isWeb: boolean,
): '/' | '/login' | '/welcome' | null {
  if (status === 'loading') {
    return null;
  }
  const isPublic = PUBLIC_ROUTES.includes(currentRoute);
  if (status === 'anonymous' && !isPublic) {
    // Web visitors land on the marketing page; the installed app goes straight to sign-in.
    return isWeb ? '/welcome' : '/login';
  }
  if (status === 'authed' && AUTH_ONLY_ROUTES.includes(currentRoute)) {
    return '/';
  }
  return null;
}
