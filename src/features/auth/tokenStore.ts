import * as SecureStore from 'expo-secure-store';
import type { Database } from '@/db/Database';

const TOKEN_KEY = 'wanikani-api-token';
const PENDING_TOKEN_KEY = 'wanikani-api-token-pending-setup';

export interface TokenStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  remove(): Promise<void>;
  getPending(): Promise<string | null>;
  setPending(token: string): Promise<void>;
  removePending(): Promise<void>;
  getCredential(key: string): Promise<string | null>;
  setCredential(key: string, token: string): Promise<void>;
  removeCredential(key: string): Promise<void>;
}

export class SecureTokenStore implements TokenStore {
  constructor(private readonly db?: Database) {}

  async get(): Promise<string | null> {
    if (this.db === undefined) return SecureStore.getItemAsync(TOKEN_KEY);
    const state = await this.state();
    if (state?.auth_state === 'active' && state.last_sync_at !== null && state.active_credential_key !== null)
      return this.getCredential(state.active_credential_key);
    if (state?.auth_state === 'legacy' || state?.credential_sequence === 0)
      return SecureStore.getItemAsync(TOKEN_KEY);
    return null;
  }

  async set(token: string): Promise<void> {
    await SecureStore.setItemAsync(TOKEN_KEY, token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }

  async remove(): Promise<void> {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }

  async getPending(): Promise<string | null> {
    if (this.db !== undefined) {
      const state = await this.state();
      const key = state?.pending_credential_key ??
        (state?.last_sync_at === null ? state.active_credential_key : null);
      if (key != null) return this.getCredential(key);
      if (state?.credential_sequence !== 0) return null;
    }
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

  getCredential(key: string): Promise<string | null> {
    return SecureStore.getItemAsync(key);
  }

  setCredential(key: string, token: string): Promise<void> {
    return SecureStore.setItemAsync(key, token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }

  removeCredential(key: string): Promise<void> {
    return SecureStore.deleteItemAsync(key);
  }

  private state() {
    return this.db!.first<{
      auth_state: string; active_credential_key: string | null;
      pending_credential_key: string | null; credential_sequence: number;
      last_sync_at: string | null;
    }>(`SELECT c.auth_state, c.active_credential_key, c.pending_credential_key,
      c.credential_sequence, s.last_sync_at FROM sync_control c CROSS JOIN sync_state s
      WHERE c.id = 1 AND s.id = 1`);
  }
}
