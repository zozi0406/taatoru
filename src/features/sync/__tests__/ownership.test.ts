import type { WaniKaniApi } from '@/api/WaniKaniApi';
import { migrateDatabase } from '@/db/migrate';
import { NodeTestDatabase } from '@/db/NodeTestDatabase';
import { collectionPage, kanjiFixture, userFixture } from '@/fixtures/api';
import { FencedDatabase } from '../FencedDatabase';
import { OwnedSyncEngine } from '../OwnedSyncEngine';
import { SyncControlRepository } from '../SyncControlRepository';

test('a late full refresh cannot restore account data after logout', async () => {
  const db = await NodeTestDatabase.open();
  let release!: () => void;
  let started!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const entered = new Promise<void>((resolve) => { started = resolve; });
  try {
    await migrateDatabase(db);
    const control = new SyncControlRepository(db);
    const context = await control.activateCredentials(
      await control.beginCredentialTransition(), userFixture.data.id, false,
    );
    const api = {
      rateLimit: { requestsRemaining: 60 },
      getSubjects: async () => { started(); await blocked; return collectionPage([kanjiFixture]); },
      getUser: async () => userFixture,
      getResets: async () => collectionPage([]),
      getAssignments: async () => collectionPage([]),
      getStudyMaterials: async () => collectionPage([]),
      getLevelProgressions: async () => collectionPage([]),
      getVoiceActors: async () => collectionPage([]),
      getReviewStatistics: async () => collectionPage([]),
    } as unknown as WaniKaniApi;
    const make = () => new OwnedSyncEngine({ db, context, apiFactory: () => api,
      isOnline: async () => true, invalidate: () => {}, updateNotifications: () => {},
      now: () => new Date(1_000) });
    const pending = make().synchronize('full');
    await entered;
    expect(await make().synchronize('quick')).toEqual({ status: 'skipped', reason: 'already-running' });
    await control.invalidateAccount(context);
    release();
    expect((await pending).status).toBe('failed');
    expect(await db.first('SELECT id FROM user')).toBeNull();
    expect(await db.first('SELECT id FROM subjects')).toBeNull();
  } finally { release?.(); await db.close(); }
});

test('a fenced transaction rolls back if ownership expires during its writes', async () => {
  const db = await NodeTestDatabase.open();
  try {
    await migrateDatabase(db);
    const control = new SyncControlRepository(db);
    const context = await control.activateCredentials(
      await control.beginCredentialTransition(), 'account', false,
    );
    let now = 1_000;
    const lease = (await control.acquire(context, now))!;
    const fenced = new FencedDatabase(db, lease, () => now);
    await expect(fenced.transaction(async (tx) => {
      await tx.run(`INSERT INTO settings VALUES ('test', 'stale')`);
      now = 121_001;
    })).rejects.toThrow('ownership');
    expect(await db.first(`SELECT * FROM settings WHERE key = 'test'`)).toBeNull();
  } finally { await db.close(); }
});
