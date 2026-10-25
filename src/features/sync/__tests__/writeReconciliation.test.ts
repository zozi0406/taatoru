import { ApiError, NetworkError } from '@/api/errors';
import { FixtureSyncApi, SYNC_NOW, syncDatabase } from '@/test/sync/fixtures';
import { PendingWriteRepository } from '../PendingWriteRepository';
import { PendingWriteSender } from '../PendingWriteSender';
import { FencedDatabase } from '../FencedDatabase';
import { SyncControlRepository } from '../SyncControlRepository';

const selection = { progressIds: [201], studyMaterialIds: [] };
async function queuedReview() {
  const db = await syncDatabase();
  await new PendingWriteRepository(db).completeReview({ assignmentId: 501, subjectId: 201,
    completedAt: SYNC_NOW, incorrectMeaningAnswers: 1, incorrectReadingAnswers: 0 });
  return db;
}

test('accepted review with lost response is reconciled without a second mutation', async () => {
  const db = await queuedReview();
  const api = new FixtureSyncApi();
  const accept = api.createReview.bind(api);
  api.createReview = async (input) => { await accept(input); throw new NetworkError('response lost'); };
  try {
    const sender = new PendingWriteSender(db, api);
    await expect(sender.sendSelectedPendingWrites(selection, SYNC_NOW)).rejects.toBeInstanceOf(NetworkError);
    expect(await db.first('SELECT delivery_state FROM pending_progress')).toEqual({ delivery_state: 'uncertain' });
    expect(await db.first('SELECT COUNT(*) AS n FROM sync_dispatches')).toEqual({ n: 1 });
    await sender.sendSelectedPendingWrites(selection, new Date(SYNC_NOW.getTime() + 60_000));
    expect(api.reviews).toHaveLength(1);
    expect(await db.first('SELECT COUNT(*) AS n FROM pending_progress')).toEqual({ n: 0 });
    expect(await db.first('SELECT outcome FROM sync_outcomes')).toEqual({ outcome: 'superseded' });
  } finally { await db.close(); }
});

test('every attempt includes the same persisted completion timestamp, including recent reviews', async () => {
  const db = await queuedReview();
  const api = new FixtureSyncApi();
  api.createReview = async (input) => { api.reviews.push(input); throw new NetworkError('not delivered'); };
  try {
    const sender = new PendingWriteSender(db, api);
    await expect(sender.sendSelectedPendingWrites(selection, SYNC_NOW)).rejects.toBeInstanceOf(NetworkError);
    await expect(sender.sendSelectedPendingWrites(selection, new Date(SYNC_NOW.getTime() + 60_000)))
      .rejects.toBeInstanceOf(NetworkError);
    expect(api.reviews.map((input) => input.createdAt?.toISOString()))
      .toEqual(['2026-10-24T14:00:00.000Z', '2026-10-24T14:00:00.000Z']);
  } finally { await db.close(); }
});

test('a validation rejection retains counts and makes the item actionable', async () => {
  const db = await queuedReview();
  const api = new FixtureSyncApi();
  api.createReview = async () => { throw new ApiError('invalid payload', { status: 422 }); };
  try {
    await new PendingWriteSender(db, api).sendSelectedPendingWrites(selection, SYNC_NOW);
    expect(await db.first('SELECT delivery_state, incorrect_meaning_answers FROM pending_progress'))
      .toEqual({ delivery_state: 'rejected', incorrect_meaning_answers: 1 });
  } finally { await db.close(); }
});

test('a due-time shift without new review counters is not treated as accepted progress', async () => {
  const db = await queuedReview();
  const api = new FixtureSyncApi();
  api.assignment = { ...api.assignment, data: { ...api.assignment.data,
    available_at: '2026-11-01T12:00:00.000000Z' } };
  try {
    await new PendingWriteSender(db, api).sendSelectedPendingWrites(selection, SYNC_NOW);
    expect(api.reviews).toHaveLength(0);
    expect(await db.first('SELECT delivery_state FROM pending_progress')).toEqual({ delivery_state: 'rejected' });
  } finally { await db.close(); }
});

test('metadata-only changes preserve a valid review opportunity', async () => {
  const db = await queuedReview();
  const api = new FixtureSyncApi();
  api.assignment = { ...api.assignment, data_updated_at: '2026-10-24T13:00:00.000000Z' };
  try {
    await new PendingWriteSender(db, api).sendSelectedPendingWrites(selection, SYNC_NOW);
    expect(api.reviews).toHaveLength(1);
    expect(await db.first('SELECT COUNT(*) AS n FROM pending_progress')).toEqual({ n: 0 });
    expect(await db.first('SELECT outcome FROM sync_outcomes')).toEqual({ outcome: 'acknowledged' });
  } finally { await db.close(); }
});

test.each(['hidden', 'locked'] as const)('fresh %s assignment cannot receive an old offline review', async (kind) => {
  const db = await queuedReview();
  const api = new FixtureSyncApi();
  api.assignment = { ...api.assignment, data: { ...api.assignment.data,
    ...(kind === 'hidden' ? { hidden: true } : { unlocked_at: null }) } };
  try {
    await new PendingWriteSender(db, api).sendSelectedPendingWrites(selection, SYNC_NOW);
    expect(api.reviews).toHaveLength(0);
    expect(await db.first('SELECT delivery_state FROM pending_progress')).toEqual({ delivery_state: 'rejected' });
  } finally { await db.close(); }
});

test('unknown legacy provenance retains the operation without attempting a write', async () => {
  const db = await queuedReview();
  const api = new FixtureSyncApi();
  try {
    await db.run('UPDATE pending_progress SET source_json = NULL');
    await new PendingWriteSender(db, api).sendSelectedPendingWrites(selection, SYNC_NOW);
    expect(api.reviews).toHaveLength(0);
    expect(await db.first('SELECT last_error_kind FROM pending_progress')).toEqual({ last_error_kind: 'unknown-baseline' });
  } finally { await db.close(); }
});

test.each(['counts', 'future', 'reset', 'resurrected'] as const)('%s cannot turn an old completion into a new review', async (kind) => {
  const db = await queuedReview();
  const api = new FixtureSyncApi();
  try {
    if (kind === 'counts') await db.run('UPDATE pending_progress SET incorrect_meaning_answers = -1');
    if (kind === 'future') await db.run("UPDATE pending_progress SET created_at = '2026-10-25T14:00:00Z'");
    if (kind === 'reset') await db.run("INSERT INTO sync_resets VALUES (1, '2026-10-24T15:00:00.000000Z', 1, '2026-10-24T15:00:00.000000Z')");
    if (kind === 'resurrected') api.assignment = { ...api.assignment,
      data: { ...api.assignment.data, resurrected_at: '2026-10-24T14:00:00Z' } };
    await new PendingWriteSender(db, api).sendSelectedPendingWrites(selection, SYNC_NOW);
    expect(api.reviews).toHaveLength(0);
    expect(await db.first('SELECT delivery_state FROM pending_progress')).toEqual({ delivery_state: 'rejected' });
  } finally { await db.close(); }
});

test.each([-600_000, 600_000])('clock skew %i is frozen into the first wire timestamp', async (skew) => {
  const db = await queuedReview();
  const api = new FixtureSyncApi();
  api.rateLimit = { ...api.rateLimit, estimatedClockSkewMs: skew };
  try {
    await new PendingWriteSender(db, api).sendSelectedPendingWrites(selection, SYNC_NOW);
    expect(api.reviews[0]?.createdAt?.getTime()).toBe(SYNC_NOW.getTime() + skew);
  } finally { await db.close(); }
});

test('an expired owner with a successful request outstanding cannot acknowledge or replay it', async () => {
  const db = await queuedReview();
  const api = new FixtureSyncApi();
  let release!: () => void;
  let entered!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const accept = api.createReview.bind(api);
  api.createReview = async (input) => { const receipt = await accept(input); entered(); await barrier; return receipt; };
  try {
    const control = new SyncControlRepository(db);
    const context = await control.activateCredentials(await control.beginCredentialTransition(), api.user.data.id, false);
    let now = SYNC_NOW.getTime();
    const lease = (await control.acquire(context, now))!;
    const sending = new PendingWriteSender(new FencedDatabase(db, lease, () => now), api, lease.ownerFence)
      .sendSelectedPendingWrites(selection, SYNC_NOW);
    const failed = expect(sending).rejects.toThrow('ownership');
    await started;
    now += 120_001;
    const nextLease = (await control.acquire(context, now))!;
    release();
    await failed;
    expect(await db.first('SELECT delivery_state FROM pending_progress')).toEqual({ delivery_state: 'uncertain' });
    await new PendingWriteSender(new FencedDatabase(db, nextLease, () => now), api, nextLease.ownerFence)
      .sendSelectedPendingWrites(selection, new Date(now));
    expect(api.reviews).toHaveLength(1);
    expect(await db.first('SELECT COUNT(*) AS n FROM pending_progress')).toEqual({ n: 0 });
  } finally { release?.(); await db.close(); }
});
