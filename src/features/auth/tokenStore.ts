import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'wanikani-api-token';
const PENDING_TOKEN_KEY = 'wanikani-api-token-pending-setup';

export interface TokenStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  remove(): Promise<void>;
  getPending(): Promise<string | null>;
  setPending(token: string): Promise<void>;
  removePending(): Promise<void>;
}

export class SecureTokenStore implements TokenStore {
  get(): Promise<string | null> {
    return SecureStore.getItemAsync(TOKEN_KEY);
  }

  async set(token: string): Promise<void> {
    await SecureStore.setItemAsync(TOKEN_KEY, token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }

  async remove(): Promise<void> {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }

  getPending(): Promise<string | null> {
    return SecureStore.getItemAsync(PENDING_TOKEN_KEY);
  }

  async setPending(token: string): Promise<void> {
    await SecureStore.setItemAsync(PENDING_TOKEN_KEY, token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }

  async removePending(): Promise<void> {
    await SecureStore.deleteItemAsync(PENDING_TOKEN_KEY);
  }
}
