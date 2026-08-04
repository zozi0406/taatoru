import config from '../../../app.config';
import { rootRouteForAuth } from '../rootRoute';

test('routes the root path to the authenticated or login shell', () => {
  expect(rootRouteForAuth('authenticated')).toBe('/(tabs)');
  expect(rootRouteForAuth('unauthenticated')).toBe('/(auth)/login');
  expect(rootRouteForAuth('bootstrapping')).toBeNull();
});

test('keeps Expo Router on the top-level app directory', () => {
  expect(config.extra?.router).toEqual({ root: 'app' });
});
