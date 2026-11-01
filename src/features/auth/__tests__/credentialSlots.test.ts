import * as SecureStore from 'expo-secure-store';
import type { WaniKaniApi } from '@/api/WaniKaniApi';
import { migrateDatabase } from '@/db/migrate';
import { NodeTestDatabase } from '@/db/NodeTestDatabase';
import { ResourceRepository } from '@/db/repositories/ResourceRepository';
import { SyncRepository } from '@/features/sync/SyncRepository';
import { userFixture } from '@/fixtures/api';
import { FixtureSyncApi, SYNC_NOW, syncDatabase } from '@/test/sync/fixtures';
import { PendingWriteRepository } from '@/features/sync/PendingWriteRepository';
import { SyncControlRepository } from '@/features/sync/SyncControlRepository';
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


test.each(['continue', 'another', 'different-account', 'another-activation-race'] as const)(
  'interrupted token repair preserves offline work when choosing %s', async (choice) => {
    const db = await syncDatabase();
    const values = new Map<string, string>();
    jest.spyOn(SecureStore, 'getItemAsync').mockImplementation(async (key) => values.get(key) ?? null);
    jest.spyOn(SecureStore, 'setItemAsync').mockImplementation(async (key, value) => { values.set(key, value); });
    jest.spyOn(SecureStore, 'deleteItemAsync').mockImplementation(async (key) => { values.delete(key); });
    try {
      const control = new SyncControlRepository(db);
      const store = new SecureTokenStore(db);
      const original = await control.beginCredentialTransition();
      await store.setCredential(original.credentialKey, 'original-fixture-token');
      const account = await control.activateCredentials(original, userFixture.data.id, false);
      const writes = new PendingWriteRepository(db);
      await writes.completeReview({ assignmentId: 501, subjectId: 201, completedAt: SYNC_NOW,
        incorrectMeaningAnswers: 1, incorrectReadingAnswers: 0 });
      await writes.queueStudyMaterial({ subjectId: 201, meaningNote: 'offline fixture note',
        readingNote: null, meaningSynonyms: [], queuedAt: SYNC_NOW });
      const reserved = await control.beginCredentialTransition();
      await store.setCredential(reserved.credentialKey, 'candidate-fixture-token');
      // Reconstruct the manager after the candidate was saved, as on process restart.
      const api = new FixtureSyncApi();
      if (choice === 'different-account') api.user = { ...api.user, data: { ...api.user.data, id: 'other-fixture-account' } };
      const synchronize = jest.fn(async () => ({ status: 'skipped' as const, reason: 'offline' as const }));
      const clearAccount = jest.fn(() => new SyncRepository(db).clearForLogout());
      const restarted = new AuthManager({ db, tokenStore: store, apiFactory: () => api,
        syncFactory: () => ({ synchronize }), clearAccount });
      expect(await store.get()).toBeNull();
      expect(await store.getPending()).toBe('candidate-fixture-token');
      if (choice === 'another-activation-race') {
        const cancel = SyncControlRepository.prototype.cancelCredentialTransition;
        jest.spyOn(SyncControlRepository.prototype, 'cancelCredentialTransition').mockImplementationOnce(async function (reservation) {
          await control.activateCredentials(reservation, userFixture.data.id, false);
          return cancel.call(control, reservation);
        });
        await restarted.useAnotherApiKey();
        expect(await store.get()).toBe('candidate-fixture-token');
      } else if (choice === 'another') await restarted.useAnotherApiKey();
      else if (choice === 'different-account') await expect(restarted.continueInterruptedSetup()).rejects.toThrow('different account');
      else await restarted.continueInterruptedSetup();
      expect(clearAccount).not.toHaveBeenCalled();
      expect(await db.first('SELECT incorrect_meaning_answers FROM pending_progress')).toEqual({ incorrect_meaning_answers: 1 });
      expect(await db.first('SELECT meaning_note FROM pending_study_materials')).toEqual({ meaning_note: 'offline fixture note' });
      expect((await control.getLocalAccountContext())?.accountEpoch).toBe(account.accountEpoch);
      if (choice === 'another') {
        expect(await control.getPendingReservation()).toBeNull();
        expect(await store.getCredential(reserved.credentialKey)).toBeNull();
      }
    } finally { await db.close(); jest.restoreAllMocks(); }
  },
);
