import type { ExpoConfig } from 'expo/config';

const localE2E = process.env.EXPO_PUBLIC_TAATORU_E2E === '1';
if (localE2E && (process.env.EAS_BUILD === 'true' || process.env.EAS_BUILD_PROFILE))
  throw new Error('Local E2E configuration cannot be used for EAS builds');

const config: ExpoConfig = {
  name: localE2E ? 'Taatoru local E2E' : 'Taatoru',
  slug: 'taatoru',
  owner: 'zozi0406',
  version: '0.1.0',
  orientation: 'default',
  scheme: localE2E ? 'taatoru-e2e' : 'taatoru',
  userInterfaceStyle: 'automatic',
  icon: './assets/images/icon.png',
  ios: {
    bundleIdentifier: 'app.taatoru',
  },
  android: {
    package: localE2E ? 'app.taatoru.e2e' : 'app.taatoru',
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      backgroundColor: '#F7F8FA',
    },
  },
  runtimeVersion: {
    policy: 'appVersion',
  },
  extra: {
    ...(localE2E ? { localE2E: true } : {}),
    router: {
      root: 'app',
    },
    eas: {
      projectId: '68bed05b-4efa-43d0-b82e-1f2cdb0a9cbc',
    },
  },
  plugins: [
    './plugins/with-non-replaying-api-writes.cjs',
    'expo-router',
    'expo-background-task',
    'expo-asset',
    [
      'expo-audio',
      {
        enableBackgroundPlayback: false,
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    'expo-secure-store',
    ['expo-sqlite', { enableFTS: true }],
    ['expo-notifications', { defaultChannel: 'reviews' }],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
