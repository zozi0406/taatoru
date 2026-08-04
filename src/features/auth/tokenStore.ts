import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'wanikani-api-token';

export interface TokenStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  remove(): Promise<void>;
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
}
