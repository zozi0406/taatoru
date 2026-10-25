import type { WaniKaniApi } from '@/api/WaniKaniApi';
import { collectionPage, userFixture } from '@/fixtures/api';
import { syncDatabase } from '@/test/sync/fixtures';
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
