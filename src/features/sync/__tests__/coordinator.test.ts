import { syncDatabase, SYNC_NOW } from '@/test/sync/fixtures';
import { SyncControlRepository } from '../SyncControlRepository';
import { SyncCoordinator } from '../SyncCoordinator';
import type { SyncEngine, SyncMode } from '../SyncEngine';

test('startup drains all batches and reports remaining pending writes truthfully', async () => {
  const db = await syncDatabase();
  let coordinator: SyncCoordinator | undefined;
  try {
    const control = new SyncControlRepository(db);
    const context = await control.activateCredentials(await control.beginCredentialTransition(), 'account', true);
    for (let id = 1; id <= 48; id++) await db.run(`INSERT INTO pending_progress
      (subject_id, assignment_id, operation_kind, incorrect_meaning_answers, incorrect_reading_answers, created_at, payload_json)
      VALUES (?, ?, 'review', 0, 0, ?, '{}')`, [id, id, SYNC_NOW.toISOString()]);
    const synchronize = jest.fn(async () => {
      await db.run('DELETE FROM pending_progress WHERE subject_id IN (SELECT subject_id FROM pending_progress LIMIT 8)');
      return { status: 'completed' as const, updatedResources: 1 };
    });
    coordinator = new SyncCoordinator({ db, context, engine: { synchronize }, now: () => SYNC_NOW });
    const result = await coordinator.request('startup');
    expect(synchronize).toHaveBeenCalledTimes(6);
    expect(result.queue?.pending).toBe(0);
    expect(result.delivery).toBe('complete');
  } finally { coordinator?.dispose(); await db.close(); }
});

test('enqueue during sync is coalesced and full refresh is promoted without parallel runs', async () => {
  const db = await syncDatabase();
  let coordinator: SyncCoordinator | undefined;
  let release!: () => void;
  let entered!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  try {
    const control = new SyncControlRepository(db);
    const context = await control.activateCredentials(await control.beginCredentialTransition(), 'account', true);
    const modes: SyncMode[] = [];
    const engine: SyncEngine = { synchronize: async (mode) => {
      modes.push(mode); if (modes.length === 1) { entered(); await blocked; }
      return { status: 'completed', updatedResources: 1 };
    } };
    coordinator = new SyncCoordinator({ db, context, engine, now: () => SYNC_NOW });
    const running = coordinator.request('manual');
    await started;
    coordinator.notifyPendingWrites();
    const full = coordinator.request('manual', 'full');
    expect(modes).toEqual(['quick']);
    release(); await running; await full;
    expect(modes).toEqual(['quick', 'full']);
  } finally { release?.(); coordinator?.dispose(); await db.close(); }
});

test('a disposed old-account coordinator cannot publish or start queued follow-up work', async () => {
  const db = await syncDatabase();
  let release!: () => void; let entered!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  try {
    const control = new SyncControlRepository(db);
    const context = await control.activateCredentials(await control.beginCredentialTransition(), 'account', true);
    const synchronize = jest.fn(async () => { entered(); await blocked; return { status: 'completed' as const, updatedResources: 1 }; });
    const coordinator = new SyncCoordinator({ db, context, engine: { synchronize }, now: () => SYNC_NOW });
    const running = coordinator.request('startup'); await started;
    coordinator.notifyPendingWrites(); coordinator.dispose(); await control.invalidateAccount(context);
    release(); await running;
    expect(synchronize).toHaveBeenCalledTimes(1);
    expect(coordinator.store.getState().lastResult).toBeNull();
  } finally { release?.(); await db.close(); }
});

test('a persisted future retry wakes while foregrounded without a connectivity transition', async () => {
  jest.useFakeTimers(); jest.setSystemTime(SYNC_NOW);
  const db = await syncDatabase();
  let coordinator: SyncCoordinator | undefined;
  try {
    const control = new SyncControlRepository(db);
    const context = await control.activateCredentials(await control.beginCredentialTransition(), 'account', true);
    const retryAt = new Date(SYNC_NOW.getTime() + 20_000).toISOString();
    await db.run(`INSERT INTO pending_progress (subject_id, assignment_id, operation_kind,
      incorrect_meaning_answers, incorrect_reading_answers, created_at, payload_json, next_attempt_at)
      VALUES (1, 1, 'review', 0, 0, ?, '{}', ?)`, [SYNC_NOW.toISOString(), retryAt]);
    const synchronize = jest.fn(async () => {
      if (Date.now() >= Date.parse(retryAt)) await db.run('DELETE FROM pending_progress');
      return { status: 'completed' as const, updatedResources: 1 };
    });
    coordinator = new SyncCoordinator({ db, context, engine: { synchronize } });
    const first = await coordinator.request('startup');
    expect(first.queue?.pending).toBe(1);
    await jest.advanceTimersByTimeAsync(20_000);
    expect(synchronize).toHaveBeenCalledTimes(2);
    expect(coordinator.store.getState().lastResult?.queue?.pending).toBe(0);
  } finally { coordinator?.dispose(); jest.useRealTimers(); await db.close(); }
});
