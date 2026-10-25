import { ExpoDatabase } from '@/db/ExpoDatabase';
import { migrateDatabase } from '@/db/migrate';
import { PendingWriteRepository } from '@/features/sync/PendingWriteRepository';
import { SyncControlRepository } from '@/features/sync/SyncControlRepository';
import { SyncRepository, type FullRefreshResources } from '@/features/sync/SyncRepository';
import { OwnedSyncEngine } from '@/features/sync/OwnedSyncEngine';
import { SyncCoordinator } from '@/features/sync/SyncCoordinator';
import { NetworkError } from '@/api/errors';
import { FixtureSyncApi } from './FixtureSyncApi';

export const FIXTURE_NOW = new Date('2026-10-24T14:00:00Z');

export async function fixtureResources(api = new FixtureSyncApi()): Promise<FullRefreshResources> {
  return { subjects: await api.getSubjects(), assignments: await api.getAssignments(),
    reviewStatistics: await api.getReviewStatistics(), studyMaterials: await api.getStudyMaterials(),
    levelProgressions: await api.getLevelProgressions(), voiceActors: await api.getVoiceActors(), user: await api.getUser() };
}

function check(value: unknown, scenario: string): asserts value {
  if (!value) throw new Error(`Fixture failed: ${scenario}`);
}

/** Real Expo handles and production ownership boundaries; all server data is fake. */
export async function runNativeScenarios(report: (line: string) => void): Promise<void> {
  const name = `sync-fixture-${Date.now()}.db`;
  const a = await ExpoDatabase.open(name); const b = await ExpoDatabase.open(name);
  let coordinator: SyncCoordinator | undefined;
  try {
    const migrations = await Promise.allSettled([migrateDatabase(a), migrateDatabase(b)]);
    const failedMigration = migrations.find((result) => result.status === 'rejected');
    if (failedMigration?.status === 'rejected') throw failedMigration.reason;
    check((await a.first<{ user_version: number }>('PRAGMA user_version'))?.user_version === 2, 'migration');
    report('PASS simultaneous migration on two Expo connections');
    const api = new FixtureSyncApi();
    await new SyncRepository(a).replaceFullRefresh(await fixtureResources(api), FIXTURE_NOW);
    const firstControl = new SyncControlRepository(a); const secondControl = new SyncControlRepository(b);
    const context = await firstControl.activateCredentials(await firstControl.beginCredentialTransition(), api.user.data.id, false);
    let now = FIXTURE_NOW.getTime();
    const leases = await Promise.all([firstControl.acquire(context, now), secondControl.acquire(context, now)]);
    check(leases.filter((lease) => lease !== null).length === 1, 'exclusive owner');
    const lease = leases.find((item) => item !== null)!;
    await firstControl.release(lease);
    report('PASS foreground/background owner contention');
    await new PendingWriteRepository(a).completeReview({ assignmentId: 501, subjectId: 201, completedAt: FIXTURE_NOW,
      incorrectMeaningAnswers: 1, incorrectReadingAnswers: 0 });
    await new PendingWriteRepository(a).queueStudyMaterial({ subjectId: 201, meaningNote: 'fixture-note', readingNote: null,
      meaningSynonyms: ['fixture'], queuedAt: FIXTURE_NOW });
    const accepted = api.createReview.bind(api);
    api.createReview = async (input) => { await accepted(input); throw new NetworkError('fixture-lost-response'); };
    const makeEngine = (db: ExpoDatabase) => new OwnedSyncEngine({ db, context, apiFactory: () => api,
      isOnline: async () => true, invalidate: () => {}, updateNotifications: () => {}, now: () => new Date(now) });
    check((await makeEngine(a).synchronize('quick')).status === 'failed', 'lost response retained');
    check((await b.first<{ n: number }>('SELECT COUNT(*) AS n FROM pending_progress'))?.n === 1, 'other connection sees outbox');
    api.createReview = accepted; now += 120_001;
    coordinator = new SyncCoordinator({ db: b, context, engine: makeEngine(b), now: () => new Date(now) });
    const result = await coordinator.request('startup');
    check(result.status === 'completed' && result.queue?.pending === 0 && api.reviews.length === 1, 'reconciliation and drain');
    report('PASS lost acknowledgement reconciles once; notes drain');
    const fresh = (await firstControl.acquire(context, now))!;
    await firstControl.assertLease(a, fresh, now);
    let rolledBack = false;
    try { await secondControl.assertLease(b, fresh, now - 1); } catch { rolledBack = true; }
    check(rolledBack, 'clock rollback stops owner');
    await firstControl.release(fresh);
    report('PASS backwards clock invalidates current owner');
    let release!: () => void; let enter!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { enter = resolve; });
    const subjects = api.getSubjects.bind(api);
    api.getSubjects = async () => { enter(); await held; return subjects(); };
    const late = makeEngine(a).synchronize('full');
    await started; await secondControl.invalidateAccount(context);
    const next = await secondControl.activateCredentials(await secondControl.beginCredentialTransition(), 'fixture-account-b', true);
    release();
    check((await late).status === 'failed', 'late old response rejected');
    check((await secondControl.getAccountContext())?.accountEpoch === next.accountEpoch &&
      await b.first('SELECT id FROM subjects') === null, 'old import cannot repopulate');
    report('PASS logout/new account rejects outstanding old import');
    check((await b.first<{ integrity_check: string }>('PRAGMA integrity_check'))?.integrity_check === 'ok', 'integrity');
    report('PASS SQLite integrity');
  } finally { coordinator?.dispose(); await a.close(); await b.close(); }
}

export async function persistOfflineFixture(): Promise<void> {
  const db = await ExpoDatabase.open('sync-force-stop-fixture.db');
  try {
    await migrateDatabase(db); const control = new SyncControlRepository(db);
    // This named fixture database starts a new controlled offline scenario.
    await control.invalidateAccount();
    await new SyncRepository(db).replaceFullRefresh(await fixtureResources(), FIXTURE_NOW);
    await control.activateCredentials(await control.beginCredentialTransition(), new FixtureSyncApi().user.data.id, false);
    await new PendingWriteRepository(db).completeReview({ assignmentId: 501, subjectId: 201,
      completedAt: FIXTURE_NOW, incorrectMeaningAnswers: 1, incorrectReadingAnswers: 0 });
  } finally { await db.close(); }
}

export async function recoverOfflineFixture(): Promise<void> {
  const db = await ExpoDatabase.open('sync-force-stop-fixture.db');
  try {
    await migrateDatabase(db);
    const context = await new SyncControlRepository(db).getAccountContext(); check(context !== null, 'persisted account');
    check((await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM pending_progress'))?.n === 1, 'persisted completion');
    const api = new FixtureSyncApi();
    const result = await new OwnedSyncEngine({ db, context, apiFactory: () => api, isOnline: async () => true,
      invalidate: () => {}, updateNotifications: () => {}, now: () => FIXTURE_NOW }).synchronize('quick');
    check(result.status === 'completed', 'force-stop sync completed');
    check(result.queue?.pending === 0, 'force-stop pending drained');
    check(api.reviews.length === 1, 'force-stop submitted once');
  } finally { await db.close(); }
}
