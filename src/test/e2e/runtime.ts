import Constants from 'expo-constants';
import { applicationId } from 'expo-application';

export const E2E_PACKAGE = 'app.taatoru.e2e';
export const E2E_ORIGIN = 'http://127.0.0.1:8787';

export function resolveE2ERuntime(enabled: boolean, development: boolean, packageName?: string, configured?: boolean, nativePackage?: string | null) {
  if (!enabled && !configured && nativePackage !== E2E_PACKAGE) return null;
  if (!enabled || !development || packageName !== E2E_PACKAGE || nativePackage !== E2E_PACKAGE || !configured)
    throw new Error('E2E requires an isolated development build and explicit local configuration');
  return { baseUrl: `${E2E_ORIGIN}/v2/`, databaseName: 'taatoru-e2e.db' };
}

export function getE2ERuntime() {
  return resolveE2ERuntime(process.env.EXPO_PUBLIC_TAATORU_E2E === '1', __DEV__,
    Constants.expoConfig?.android?.package, Constants.expoConfig?.extra?.localE2E === true, applicationId);
}
