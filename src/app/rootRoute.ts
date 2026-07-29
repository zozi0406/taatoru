import type { AuthStatus } from '@/features/auth/AuthProvider';

export function rootRouteForAuth(
  status: AuthStatus,
): '/(auth)/login' | '/(tabs)' | null {
  if (status === 'bootstrapping') {
    return null;
  }
  return status === 'authenticated' ? '/(tabs)' : '/(auth)/login';
}
