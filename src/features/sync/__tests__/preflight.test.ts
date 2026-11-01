import type { WaniKaniApi } from '@/api/WaniKaniApi';
import { migrateDatabase } from '@/db/migrate';
import { NodeTestDatabase } from '@/db/NodeTestDatabase';
import { OwnedSyncEngine } from '../OwnedSyncEngine';
import { collectionPage, userFixture } from '@/fixtures/api';
import { FixtureSyncApi, syncDatabase } from '@/test/sync/fixtures';
import { ReviewSessionRepository } from '@/features/reviews/ReviewSessionRepository';
import { SessionRepository } from '@/features/sessions/SessionRepository';
import { SyncPreflight } from '../SyncPreflight';
import { SyncControlRepository } from '../SyncControlRepository';
import { PendingWriteRepository } from '../PendingWriteRepository';

test('a same-level reset rebuilds stale availability and preserves the pending payload', async () => {
  const db = await syncDatabase();
  try {
    await new PendingWriteRepository(db).completeReview({ subjectId: 201, assignmentId: 501,
      completedAt: new Date('2026-10-24T13:00:00Z'), incorrectMeaningAnswers: 1,
      incorrectReadingAnswers: 0 });
    const control = new SyncControlRepository(db);
    const context = await control.activateCredentials(await control.beginCredentialTransition(), userFixture.data.id, false);
    const api = {
      getUser: async () => userFixture,
      getResets: async () => collectionPage([{ id: 1, object: 'reset', url: 'https://api.wanikani.com/v2/resets/1',
        data_updated_at: '2026-10-24T13:30:00.000000Z', data: {
          created_at: '2026-10-24T13:29:00Z', confirmed_at: '2026-10-24T13:30:00Z',
          original_level: 8, target_level: 1,
        } }]),
      getAssignments: async () => collectionPage([]),
      getReviewStatistics: async () => collectionPage([]),
    } as unknown as WaniKaniApi;
    await new SyncPreflight(db, api, context).run();
    expect(await db.first('SELECT COUNT(*) AS n FROM assignments')).toEqual({ n: 0 });
    expect(await db.first('SELECT COUNT(*) AS n FROM pending_progress')).toEqual({ n: 1 });
    expect(await db.first('SELECT delivery_state FROM pending_progress')).toEqual({ delivery_state: 'uncertain' });
    expect(await db.first('SELECT target_level FROM sync_resets')).toEqual({ target_level: 1 });
  } finally { await db.close(); }
});

test('failed reset preflight does not remove the cache or allow write delivery', async () => {
  const db = await syncDatabase();
  try {
    const before = await db.all('SELECT resource_json FROM assignments');
    const control = new SyncControlRepository(db);
    const context = await control.activateCredentials(await control.beginCredentialTransition(), userFixture.data.id, false);
    const api = { getUser: async () => userFixture,
      getResets: async () => { throw new Error('connection lost'); } } as unknown as WaniKaniApi;
    await expect(new SyncPreflight(db, api, context).run()).rejects.toThrow('connection lost');
    expect(await db.all('SELECT resource_json FROM assignments')).toEqual(before);
  } finally { await db.close(); }
});

test('a mismatched user is rejected before another account can be imported', async () => {
  const db = await syncDatabase();
  try {
    const control = new SyncControlRepository(db);
    const context = await control.activateCredentials(await control.beginCredentialTransition(), userFixture.data.id, false);
    const api = { getUser: async () => ({ ...userFixture, data: { ...userFixture.data, id: 'other' } }) } as WaniKaniApi;
    await expect(new SyncPreflight(db, api, context).run()).rejects.toThrow('account');
    expect(await db.first('SELECT id FROM user')).toEqual({ id: userFixture.data.id });
  } finally { await db.close(); }
});


test('discovering a reset invalidates affected sessions created offline after its remote timestamp', async () => {
  const db = await syncDatabase(); const api = new FixtureSyncApi();
  try {
    const control = new SyncControlRepository(db);
    const context = await control.activateCredentials(await control.beginCredentialTransition(), userFixture.data.id, false);
    const reviews = new ReviewSessionRepository(db);
    const lessons = new SessionRepository(db);
    const item = { assignmentId: 501, subjectId: 201 };
    const stale = await reviews.startReviewSession([item], new Date('2026-10-24T15:00:00Z'));
    await lessons.startLessonSession([{ ...item, available: true, excluded: false, lessonPosition: 1,
      level: 1, subjectType: 'kanji' }], new Date('2026-10-24T15:00:00Z'));
    (api as WaniKaniApi).getResets = async () => collectionPage([{ id: 2, object: 'reset',
      url: 'https://api.wanikani.com/v2/resets/2', data_updated_at: '2026-10-24T13:30:00Z',
      data: { created_at: '2026-10-24T13:29:00Z', confirmed_at: '2026-10-24T13:30:00Z', original_level: 8, target_level: 1 } }]);
    // Assignment IDs and account level can look unchanged after re-levelling.
    await new SyncPreflight(db, api, context).run();
    expect(await reviews.loadReviewSession()).toBeNull();
    expect(await lessons.loadLessonSession()).toBeNull();
    await expect(reviews.commitReviewTransition({ ...item, incorrectMeaningAnswers: 1, incorrectReadingAnswers: 0 },
      stale, new Date('2026-10-24T16:00:00Z'))).rejects.toThrow('changed');
    expect(await db.first('SELECT COUNT(*) AS n FROM pending_progress')).toEqual({ n: 0 });
    const fresh = await reviews.startReviewSession([item], new Date('2026-10-24T16:00:00Z'));
    await new SyncPreflight(db, api, context).run();
    expect(await reviews.loadReviewSession()).toEqual(fresh);
  } finally { await db.close(); }
});


test.each(['quick', 'full'] as const)('first %s sync with reset history imports missing subjects before dependent resources', async (mode) => {
  const db = await NodeTestDatabase.open(); const api = new FixtureSyncApi();
  try {
    await migrateDatabase(db);
    const control = new SyncControlRepository(db);
    const context = await control.activateCredentials(await control.beginCredentialTransition(), userFixture.data.id, false);
    (api as WaniKaniApi).getResets = async () => collectionPage([{ id: 8, object: 'reset',
      url: 'https://api.wanikani.com/v2/resets/8', data_updated_at: '2026-10-01T12:00:00Z',
      data: { created_at: '2026-10-01T11:00:00Z', confirmed_at: '2026-10-01T12:00:00Z', original_level: 8, target_level: 1 } }]);
    const engine = new OwnedSyncEngine({ db, context, apiFactory: () => api, isOnline: async () => true,
      now: () => new Date('2026-11-01T09:00:00Z'), invalidate: () => {}, updateNotifications: () => {} });
    expect(await engine.synchronize(mode)).toMatchObject({ status: 'completed' });
    expect(await db.first('SELECT id FROM subjects')).toEqual({ id: api.assignment.data.subject_id });
    expect(await db.first('SELECT id FROM assignments')).toEqual({ id: api.assignment.id });
    expect(await db.first('SELECT id FROM review_statistics')).toEqual({ id: api.statistic.id });
    expect(await db.first('SELECT id FROM sync_resets')).toEqual({ id: 8 });
    expect(await db.first('PRAGMA foreign_key_check')).toBeNull();
  } finally { await db.close(); }
});
