import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Taatoru',
  slug: 'taatoru',
  owner: 'zozi0406',
  version: '0.1.0',
  orientation: 'default',
  scheme: 'taatoru',
  userInterfaceStyle: 'automatic',
  icon: './assets/images/icon.png',
  ios: {
    bundleIdentifier: 'app.taatoru',
  },
  android: {
    package: 'app.taatoru',
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
    router: {
      root: 'app',
    },
    eas: {
      projectId: '68bed05b-4efa-43d0-b82e-1f2cdb0a9cbc',
    },
  },
  plugins: [
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
