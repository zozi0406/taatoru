import * as SecureStore from 'expo-secure-store';
import type { WaniKaniApi } from '@/api/WaniKaniApi';
import { migrateDatabase } from '@/db/migrate';
import { NodeTestDatabase } from '@/db/NodeTestDatabase';
import { ResourceRepository } from '@/db/repositories/ResourceRepository';
import { SyncRepository } from '@/features/sync/SyncRepository';
import { userFixture } from '@/fixtures/api';
import { AuthManager } from '../AuthProvider';
import { SecureTokenStore } from '../tokenStore';

test('a suspended old login cannot overwrite the credential of a newer login', async () => {
  const db = await NodeTestDatabase.open();
  const values = new Map<string, string>();
  let release!: () => void;
  let entered!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  jest.spyOn(SecureStore, 'getItemAsync').mockImplementation(async (key) => values.get(key) ?? null);
  jest.spyOn(SecureStore, 'setItemAsync').mockImplementation(async (key, value) => {
    if (value === 'older-fixture-token') { entered(); await hold; }
    values.set(key, value);
  });
  jest.spyOn(SecureStore, 'deleteItemAsync').mockImplementation(async (key) => { values.delete(key); });
  try {
    await migrateDatabase(db);
    const tokenStore = new SecureTokenStore(db);
    const manager = new AuthManager({ db, tokenStore,
      apiFactory: () => ({ getUser: async () => userFixture }) as WaniKaniApi,
      syncFactory: () => ({ synchronize: async () => {
        await new ResourceRepository(db).replaceUser(userFixture);
        await new SyncRepository(db).markSyncCompleted('quick', new Date());
        return { status: 'completed', updatedResources: 1 };
      } }),
      clearAccount: () => new SyncRepository(db).clearForLogout(),
    });
    const old = manager.login('older-fixture-token').catch((error: unknown) => error);
    await started;
    await manager.login('newer-fixture-token');
    release(); await old;
    expect(await tokenStore.get()).toBe('newer-fixture-token');
    await manager.logout();
    expect(await tokenStore.get()).toBeNull();
  } finally {
    release?.(); await db.close(); jest.restoreAllMocks();
  }
});
