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

test('links release builds to the Taatoru EAS project', () => {
  expect(config.owner).toBe('zozi0406');
  expect(config.extra?.eas).toEqual({
    projectId: '68bed05b-4efa-43d0-b82e-1f2cdb0a9cbc',
  });
});
