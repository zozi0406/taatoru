import { ApiError, NetworkError } from '../errors';
import { RequestScheduler } from '../RequestScheduler';
import { migrateDatabase } from '@/db/migrate';
import { NodeTestDatabase } from '@/db/NodeTestDatabase';
import { SyncControlRepository } from '@/features/sync/SyncControlRepository';

async function fixture() {
  const db = await NodeTestDatabase.open(); await migrateDatabase(db);
  const context = await new SyncControlRepository(db).beginCredentialTransition();
  let tick = 1_000;
  const options = { now: () => tick, sleep: async (ms: number) => { tick += ms; }, random: () => 0 };
  return { db, context, options, now: () => tick };
}

test('every actual request is serialized and paced across 100 requests', async () => {
  const { db, context, options, now } = await fixture();
  try {
    const scheduler = new RequestScheduler(db, options);
    const starts: number[] = [];
    await Promise.all(Array.from({ length: 100 }, () => scheduler.run(async () => { starts.push(now()); }, context)));
    expect(starts).toHaveLength(100);
    expect(starts.every((time, index) => index === 0 || time - starts[index - 1]! >= 1_100)).toBe(true);
  } finally { await db.close(); }
});

test('a 429 wait persists through restart and respects a longer server deadline', async () => {
  const { db, context, options, now } = await fixture();
  try {
    const scheduler = new RequestScheduler(db, options);
    await expect(scheduler.run(async () => { throw new ApiError('slow down', { status: 429, retryAt: new Date(91_000) }); }, context))
      .rejects.toBeInstanceOf(ApiError);
    let started = 0;
    await new RequestScheduler(db, options).run(async () => { started = now(); }, context);
    expect(started).toBe(91_000);
  } finally { await db.close(); }
});

test('a valid exhausted budget waits for reset before another request', async () => {
  const { db, context, options, now } = await fixture();
  try {
    const scheduler = new RequestScheduler(db, options);
    await scheduler.recordBudget({ limit: 60, requestsRemaining: 0, requestsInServerMinute: 60,
      resetAfterMs: 60_000, estimatedClockSkewMs: 0 }, context);
    await scheduler.run(async () => {}, context);
    expect(now()).toBe(61_000);
  } finally { await db.close(); }
});

test('repeated 429 responses back off exponentially across scheduler restarts', async () => {
  const { db, context, options, now } = await fixture();
  try {
    const starts: number[] = [];
    for (let i = 0; i < 7; i++) {
      await expect(new RequestScheduler(db, options).run(async () => {
        starts.push(now()); throw new ApiError('limited', { status: 429 });
      }, context)).rejects.toBeInstanceOf(ApiError);
    }
    expect(starts).toEqual([1_000, 3_000, 7_000, 15_000, 31_000, 63_000, 123_000]);
  } finally { await db.close(); }
});

test('background yields instead of waiting outside its slice, with continuation preserved', async () => {
  const { db, context, options } = await fixture();
  try {
    await db.run('UPDATE sync_control SET blocked_until = 91_000');
    const operation = jest.fn(async () => {});
    await expect(new RequestScheduler(db, { ...options, deadlineAt: 21_000 }).run(operation, context)).rejects.toMatchObject({ name: 'SyncYieldError' });
    expect(operation).not.toHaveBeenCalled();
    expect(await db.first('SELECT blocked_until FROM sync_control')).toEqual({ blocked_until: 91_000 });
  } finally { await db.close(); }
});

test('a stalled request is aborted at 30 seconds and does not trap later requests', async () => {
  jest.useFakeTimers();
  const { db, context } = await fixture();
  const scheduler = new RequestScheduler(db);
  let signal: AbortSignal | undefined;
  try {
    const stalled = scheduler.run(async (value) => { signal = value; return new Promise<void>(() => {}); }, context);
    const failure = expect(stalled).rejects.toBeInstanceOf(NetworkError);
    for (let i = 0; i < 30 && signal === undefined; i++) await Promise.resolve();
    await jest.advanceTimersByTimeAsync(30_000);
    await failure;
    expect(signal?.aborted).toBe(true);
  } finally { jest.useRealTimers(); await db.close(); }
});
