import { PendingWriteRepository } from '../PendingWriteRepository';
import type { WaniKaniApi } from '@/api/WaniKaniApi';
import { migrateDatabase } from '@/db/migrate';
import { NodeTestDatabase } from '@/db/NodeTestDatabase';
import { collectionPage, kanjiFixture, userFixture } from '@/fixtures/api';
import { FencedDatabase } from '../FencedDatabase';
import { OwnedSyncEngine } from '../OwnedSyncEngine';
import { SyncControlRepository } from '../SyncControlRepository';
import { FixtureSyncApi, syncDatabase, SYNC_NOW } from '@/test/sync/fixtures';
import { NotificationService } from '@/features/notifications/NotificationService';

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


test.each(['rotation', 'expiry', 'new-owner'] as const)(
  'notification permission suspension cannot outlive sync %s', async (kind) => {
    const db = await syncDatabase();
    let release!: () => void; let enter!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const entered = new Promise<void>((resolve) => { enter = resolve; });
    const cancelAll = jest.fn(async () => {}); const setBadge = jest.fn(async () => {});
    const schedule = jest.fn(async () => {});
    try {
      const control = new SyncControlRepository(db); const api = new FixtureSyncApi();
      const context = await control.activateCredentials(await control.beginCredentialTransition(), api.user.data.id, false);
      let now = SYNC_NOW.getTime();
      const notifications = new NotificationService({ createChannel: async () => {},
        getPermission: async () => { enter(); await held; return true; },
        requestPermission: async () => true, cancelAll, setBadge, schedule });
      const engine = new OwnedSyncEngine({ db, context, apiFactory: () => api, isOnline: async () => true,
        invalidate: () => {}, now: () => new Date(now),
        updateNotifications: (...guards: readonly (() => Promise<void>)[]) => notifications.rebuild({
          alerts: true, badges: true, currentReviewCount: 3, hourlyNewCounts: [2], now: SYNC_NOW,
          sound: false, vacationActive: false,
        }, guards[0] ?? (() => control.assertAccount(db, context))),
      });
      const running = engine.synchronize('quick');
      await entered;
      if (kind === 'rotation') await control.activateCredentials(await control.beginCredentialTransition(), api.user.data.id, false);
      else { now += 120_001; if (kind === 'new-owner') await control.acquire(context, now); }
      release();
      expect(await running).toMatchObject({ status: 'failed', error: { kind: 'ownership' } });
      expect(cancelAll).not.toHaveBeenCalled();
      expect(setBadge).not.toHaveBeenCalled();
      expect(schedule).not.toHaveBeenCalled();
    } finally { release?.(); await db.close(); }
  },
);


test('a post-delivery user response cannot commit after credential rotation', async () => {
  const db = await syncDatabase();
  let release!: () => void; let enter!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const entered = new Promise<void>(resolve => { enter = resolve; });
  try {
    const control = new SyncControlRepository(db); const api = new FixtureSyncApi();
    const context = await control.activateCredentials(await control.beginCredentialTransition(), api.user.data.id, false);
    await new PendingWriteRepository(db).completeReview({ assignmentId: 501, subjectId: 201,
      incorrectMeaningAnswers: 0, incorrectReadingAnswers: 0, completedAt: SYNC_NOW });
    let calls = 0;
    api.getUser = async () => {
      if (++calls === 3) { enter(); await blocked; return { ...api.user, data: { ...api.user.data, level: 59 } }; }
      return api.user;
    };
    const notifications = jest.fn();
    const running = new OwnedSyncEngine({ db, context, apiFactory: () => api, isOnline: async () => true,
      now: () => SYNC_NOW, invalidate: () => {}, updateNotifications: notifications }).synchronize('quick');
    const reached = await Promise.race([entered.then(() => 'blocked'), running.then(() => 'finished')]);
    expect(reached).toBe('blocked');
    await control.beginCredentialTransition();
    release();
    expect((await running).status).toBe('failed');
    expect((await db.first<{ level: number }>('SELECT level FROM user'))?.level).not.toBe(59);
    expect(notifications).not.toHaveBeenCalled();
  } finally { release?.(); await db.close(); }
});
