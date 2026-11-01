import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeTestDatabase } from '@/db/NodeTestDatabase';
import { migrateDatabase } from '@/db/migrate';
import { NetworkError } from '@/api/errors';
import { FixtureSyncApi, SYNC_NOW, syncResources } from '@/test/sync/fixtures';
import { PendingWriteRepository } from '../PendingWriteRepository';
import { SyncRepository } from '../SyncRepository';
import { SyncControlRepository } from '../SyncControlRepository';
import { OwnedSyncEngine } from '../OwnedSyncEngine';
import { SyncCoordinator } from '../SyncCoordinator';

test.each([false, true])('offline completion or lost acknowledgement survives reopening: accepted=%s', async (accepted) => {
  const folder = mkdtempSync(join(tmpdir(), 'taatoru-sequence-'));
  const path = join(folder, 'cache.db');
  let db = await NodeTestDatabase.open(path);
  const api = new FixtureSyncApi();
  let coordinator: SyncCoordinator | undefined;
  let now = SYNC_NOW.getTime();
  try {
    await migrateDatabase(db);
    await new SyncRepository(db).replaceFullRefresh(syncResources(), SYNC_NOW);
    const control = new SyncControlRepository(db);
    const context = await control.activateCredentials(await control.beginCredentialTransition(), api.user.data.id, false);
    await new PendingWriteRepository(db).completeReview({ assignmentId: 501, subjectId: 201,
      completedAt: SYNC_NOW, incorrectMeaningAnswers: 1, incorrectReadingAnswers: 0 });
    const makeEngine = () => new OwnedSyncEngine({ db, context, apiFactory: () => api,
      now: () => new Date(now), isOnline: async () => true, invalidate: () => {}, updateNotifications: () => {} });
    if (accepted) {
      const accept = api.createReview.bind(api);
      api.createReview = async (input) => { await accept(input); throw new NetworkError('lost response'); };
      expect((await makeEngine().synchronize('quick')).status).toBe('failed');
      api.createReview = accept;
    }
    await db.close(); db = await NodeTestDatabase.open(path); await migrateDatabase(db);
    now += 120_001;
    coordinator = new SyncCoordinator({ db, context, engine: makeEngine(), now: () => new Date(now) });
    const result = await coordinator.request('startup');
    expect(result.status).toBe('completed');
    expect(result.queue?.pending).toBe(0);
    expect(api.reviews).toHaveLength(1);
    expect(await db.first('SELECT COUNT(*) AS n FROM sync_dispatches')).toEqual({ n: 0 });
    expect(await db.first('SELECT outcome FROM sync_outcomes')).toEqual({ outcome: accepted ? 'superseded' : 'acknowledged' });
  } finally { coordinator?.dispose(); await db.close(); rmSync(folder, { recursive: true }); }
});

test.each([7, 31, 129])('seed %i preserves desired note edits through refresh/failure/reopen sequences', async (seed) => {
  const folder = mkdtempSync(join(tmpdir(), 'taatoru-generated-')); const path = join(folder, 'cache.db');
  let db = await NodeTestDatabase.open(path);
  let expected: string | null = null; let sequence = seed;
  try {
    await migrateDatabase(db); await new SyncRepository(db).replaceFullRefresh(syncResources(), SYNC_NOW);
    for (let step = 0; step < 25; step++) {
      sequence = (sequence * 1664525 + 1013904223) >>> 0;
      const event = sequence % 4;
      if (event === 0 || expected === null) {
        expected = `fixture-${seed}-${step}`;
        await new PendingWriteRepository(db).queueStudyMaterial({ subjectId: 201, meaningNote: expected,
          readingNote: null, meaningSynonyms: ['fixture'], queuedAt: new Date(SYNC_NOW.getTime() + step) });
      } else if (event === 1) await new SyncRepository(db).replaceFullRefresh(syncResources(), SYNC_NOW);
      else if (event === 2) {
        await expect(db.transaction(async (tx) => { await tx.run('DELETE FROM study_materials'); throw new Error('interrupted import'); }))
          .rejects.toThrow('interrupted import');
      } else { await db.close(); db = await NodeTestDatabase.open(path); await migrateDatabase(db); }
      expect(await db.first('SELECT meaning_note FROM study_materials')).toEqual({ meaning_note: expected });
      expect(await db.first('SELECT meaning_note FROM pending_study_materials')).toEqual({ meaning_note: expected });
      expect(await db.first('PRAGMA integrity_check')).toEqual({ integrity_check: 'ok' });
      const pending = await db.first<{ operation_key: string; source_json: string }>('SELECT operation_key, source_json FROM pending_study_materials');
      expect(pending?.operation_key).toBeTruthy(); expect(JSON.parse(pending!.source_json).data.subject_id).toBe(201);
    }
  } finally { await db.close(); rmSync(folder, { recursive: true }); }
});
