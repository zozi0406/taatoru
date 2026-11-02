/** @jest-environment node */
import { runInThisContext } from 'node:vm';
import { HttpWaniKaniApi } from '../../src/api/HttpWaniKaniApi';
import { NodeTestDatabase } from '../../src/db/NodeTestDatabase';
import { migrateDatabase } from '../../src/db/migrate';
import { PendingWriteRepository } from '../../src/features/sync/PendingWriteRepository';
import { SyncRepository } from '../../src/features/sync/SyncRepository';
import { SyncControlRepository } from '../../src/features/sync/SyncControlRepository';
import { OwnedSyncEngine } from '../../src/features/sync/OwnedSyncEngine';
import { seedE2EAccount } from '../../src/test/e2e/seed';
import { startMockServer } from '../mock/server';

const networkFetch = runInThisContext('fetch') as typeof fetch;
let server: Awaited<ReturnType<typeof startMockServer>>;
let db: NodeTestDatabase;
let engine: OwnedSyncEngine;
beforeEach(async () => {
  server = await startMockServer({ scenario: 'smoke', port: 0 });
  db = await NodeTestDatabase.open(); await migrateDatabase(db);
  await seedE2EAccount(db, { setCredential: async () => {} }, { runId: 'delivery', resources: server.world.resources() });
  const context = (await new SyncControlRepository(db).getAccountContext())!;
  engine = new OwnedSyncEngine({ db, context, apiFactory: () => new HttpWaniKaniApi({ token: 'synthetic-only',
    baseUrl: `${server.origin}/v2/`, fetch: networkFetch }), isOnline: async () => true,
    now: () => new Date(), invalidate: () => {}, updateNotifications: () => {} });
});
afterEach(async () => { await db.close(); await server.close(); });
async function enqueue() {
  const a = server.world.dueReviews()[0]!;
  await new PendingWriteRepository(db).completeReview({ assignmentId: a.id, subjectId: a.data.subject_id,
    incorrectMeaningAnswers: 1, incorrectReadingAnswers: 0, completedAt: new Date() });
  return a;
}

test('typed HTTP receipt settles exact operation and installs authoritative state', async () => {
  const a = await enqueue();
  const result = await engine.synchronize('quick');
  expect(result.status).toBe('completed');
  expect(result.queue?.pending).toBe(0);
  expect(await db.first('SELECT subject_id FROM pending_progress')).toBeNull();
  expect((await db.first<{ srs_stage: number }>('SELECT srs_stage FROM assignments WHERE id=?', [a.id]))?.srs_stage).toBe(4);
  expect(server.journal.filter(x => x.accepted)).toHaveLength(1);
});

test('accepted lost review is reconciled from dispatch evidence without replay', async () => {
  await enqueue(); server.arm({ method: 'POST', path: '/v2/reviews', kind: 'drop-after' });
  expect((await engine.synchronize('quick')).status).toBe('failed');
  expect((await db.first<{ delivery_state: string }>('SELECT delivery_state FROM pending_progress'))?.delivery_state).toBe('uncertain');
  // This integration test advances eligibility only, not the native scheduler. Device tests retain real backoff.
  await db.run('UPDATE pending_progress SET next_attempt_at = NULL');
  expect((await engine.synchronize('quick')).queue?.pending).toBe(0);
  expect(server.journal.filter(x => x.accepted)).toHaveLength(1);
});

test('unresolved 422 retains rejected work and visible queue attention', async () => {
  await enqueue(); server.arm({ method: 'POST', path: '/v2/reviews', kind: 'reject', status: 422 });
  const result = await engine.synchronize('quick');
  expect(result.delivery).toBe('attention');
  expect(result.queue?.rejected).toBe(1);
  expect(server.journal.filter(x => x.accepted)).toHaveLength(0);
});

test('accepted material create with lost response recovers positive identity without duplicate create', async () => {
  const subject = server.world.dueReviews()[0]!.data.subject_id;
  await new PendingWriteRepository(db).queueStudyMaterial({ subjectId: subject, meaningNote: 'synthetic note',
    readingNote: null, meaningSynonyms: ['test glow'], queuedAt: new Date() });
  server.arm({ method: 'POST', path: '/v2/study_materials', kind: 'drop-after' });
  expect((await engine.synchronize('quick')).status).toBe('failed');
  await db.run('UPDATE pending_study_materials SET next_attempt_at = NULL');
  await engine.synchronize('quick');
  expect((await new SyncRepository(db).getQueueSummary()).pending).toBe(0);
  expect((await db.first<{ id: number }>('SELECT id FROM study_materials WHERE subject_id = ?', [subject]))!.id).toBeGreaterThan(0);
  const creates = server.journal.filter(e => e.method === 'POST' && e.path === '/v2/study_materials');
  expect(creates).toHaveLength(1);
  expect(server.journal.some(e => e.sequence > creates[0]!.sequence && e.method === 'GET' &&
    e.path.startsWith('/v2/study_materials?subject_ids='))).toBe(true);

  expect(server.journal.filter(x => x.accepted)).toHaveLength(1);
});

test('a newer material revision survives an older in-flight receipt', async () => {
  const subject = server.world.dueReviews()[0]!.data.subject_id;
  const repository = new PendingWriteRepository(db);
  const edit = (note: string) => repository.queueStudyMaterial({ subjectId: subject, meaningNote: note,
    readingNote: null, meaningSynonyms: [], queuedAt: new Date() });
  await edit('first synthetic revision');
  server.arm({ method: 'POST', path: '/v2/study_materials', kind: 'hold-after' });
  const running = engine.synchronize('quick');
  await server.waitForHeld();
  await edit('newer synthetic revision');
  server.release();
  await running;
  const local = await db.first<{ meaning_note: string }>('SELECT meaning_note FROM study_materials WHERE subject_id=?', [subject]);
  expect(local?.meaning_note).toBe('newer synthetic revision');
  await engine.synchronize('quick');
  expect(server.world.scenario.studyMaterials[0]?.data.meaning_note).toBe('newer synthetic revision');
  expect((await new SyncRepository(db).getQueueSummary()).pending).toBe(0);
});

test('bounded owned runs drain four progress operations then the remainder', async () => {
  const selected = server.world.dueReviews().slice(0, 6);
  for (const a of selected) await new PendingWriteRepository(db).completeReview({ assignmentId: a.id, subjectId: a.data.subject_id,
    incorrectMeaningAnswers: 0, incorrectReadingAnswers: 0, completedAt: new Date() });
  const first = await engine.synchronize('quick');
  expect(first.queue?.pending).toBe(2);
  expect(server.journal.filter(e => e.accepted)).toHaveLength(4);
  const next = await engine.synchronize('quick');
  expect(next.queue?.pending).toBe(0);
  expect(server.journal.filter(e => e.accepted)).toHaveLength(6);
});


test('one owned quick sync persists threshold level-up and the exact unlocked lessons', async () => {
  await server.close(); await db.close();
  server = await startMockServer({ scenario: 'level-up', port: 0 });
  db = await NodeTestDatabase.open(); await migrateDatabase(db);
  await seedE2EAccount(db, { setCredential: async () => {} }, { runId: 'level', resources: server.world.resources() });
  const context = (await new SyncControlRepository(db).getAccountContext())!;
  engine = new OwnedSyncEngine({ db, context, apiFactory: () => new HttpWaniKaniApi({ token: 'synthetic-only',
    baseUrl: `${server.origin}/v2/`, fetch: networkFetch }), isOnline: async () => true,
    now: () => new Date(), invalidate: () => {}, updateNotifications: () => {} });
  const a = server.world.dueReviews()[0]!;
  await new PendingWriteRepository(db).completeReview({ assignmentId: a.id, subjectId: a.data.subject_id,
    incorrectMeaningAnswers: 0, incorrectReadingAnswers: 0, completedAt: new Date() });
  const result = await engine.synchronize('quick');
  expect(result.status).toBe('completed');
  expect(server.world.scenario.user.data.level).toBe(4);
  expect((await db.first<{ level: number }>('SELECT level FROM user'))?.level).toBe(4);
  const local = await db.all<{ subject_id: number }>('SELECT subject_id FROM assignments WHERE unlocked_at IS NOT NULL AND started_at IS NULL ORDER BY subject_id');
  expect(local.map(a => a.subject_id)).toEqual(server.world.availableLessons().map(a => a.data.subject_id).sort((a,b) => a-b));
  expect(result.queue?.pending).toBe(0);
  expect(await db.all('SELECT * FROM sync_dispatches')).toEqual([]);
  expect(server.journal.filter(e => e.accepted)).toHaveLength(1);
});

test('failed post-write user refresh retains settlement and retries metadata without a second review', async () => {
  const context = (await new SyncControlRepository(db).getAccountContext())!;
  const fetchWithFailedUserRead: typeof fetch = async (input, init) => {
    const response = await networkFetch(input, init);
    if (init?.method === 'POST' && String(input).endsWith('/reviews'))
      server.arm({ method: 'GET', path: '/v2/user', kind: 'reject', status: 500 });
    return response;
  };
  engine = new OwnedSyncEngine({ db, context, apiFactory: () => new HttpWaniKaniApi({ token: 'synthetic-only',
    baseUrl: `${server.origin}/v2/`, fetch: fetchWithFailedUserRead }), isOnline: async () => true,
    now: () => new Date(), invalidate: () => {}, updateNotifications: () => {} });
  await enqueue();
  expect((await engine.synchronize('quick')).status).toBe('failed');
  expect(await db.all('SELECT * FROM pending_progress')).toEqual([]);
  expect(await db.all('SELECT * FROM sync_dispatches')).toEqual([]);
  expect((await engine.synchronize('quick')).status).toBe('completed');
  expect(server.journal.filter(e => e.method === 'POST' && e.path === '/v2/reviews')).toHaveLength(1);
});
