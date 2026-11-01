import { FixtureSyncApi, SYNC_NOW, syncDatabase } from '@/test/sync/fixtures';
import { studyMaterialFixture } from '@/fixtures/api';
import { PendingWriteRepository } from '../PendingWriteRepository';
import { PendingWriteSender } from '../PendingWriteSender';
import { SyncAttentionRepository } from '../SyncAttentionRepository';
import { SyncControlRepository } from '../SyncControlRepository';
import { AccountDatabase } from '../FencedDatabase';

test('same-field materials adopt the API version without a local-or-remote decision', async () => {
  const db = await syncDatabase(); const api = new FixtureSyncApi();
  try {
    await new PendingWriteRepository(db).queueStudyMaterial({ subjectId: 201, meaningNote: 'local',
      readingNote: studyMaterialFixture.data.reading_note, meaningSynonyms: studyMaterialFixture.data.meaning_synonyms, queuedAt: SYNC_NOW });
    api.material = { ...studyMaterialFixture, data: { ...studyMaterialFixture.data, meaning_note: 'external' } };
    await new PendingWriteSender(db, api).sendSelectedPendingWrites({ progressIds: [], studyMaterialIds: [201] }, SYNC_NOW);
    expect(await new SyncAttentionRepository(db).list()).toEqual([]);
    expect(await db.first('SELECT meaning_note FROM study_materials')).toEqual({ meaning_note: 'external' });
    expect(api.materialWrites).toHaveLength(0);
  } finally { await db.close(); }
});

test('a stale discard decision cannot remove a newer local edit', async () => {
  const db = await syncDatabase();
  try {
    const writes = new PendingWriteRepository(db);
    const material = { subjectId: 201, meaningNote: 'first', readingNote: null, meaningSynonyms: [], queuedAt: SYNC_NOW };
    await writes.queueStudyMaterial(material);
    const attention = new SyncAttentionRepository(db);
    const change = (await attention.list())[0]!;
    await writes.queueStudyMaterial({ ...material, meaningNote: 'second' });
    await expect(attention.resolve(change, 'discard')).rejects.toThrow('changed');
    expect(await db.first('SELECT meaning_note FROM pending_study_materials')).toEqual({ meaning_note: 'second' });
  } finally { await db.close(); }
});

test('discarding progress restores authoritative stage and never makes an API mutation', async () => {
  const db = await syncDatabase();
  try {
    await new PendingWriteRepository(db).completeReview({ assignmentId: 501, subjectId: 201, completedAt: SYNC_NOW,
      incorrectMeaningAnswers: 1, incorrectReadingAnswers: 0 });
    const attention = new SyncAttentionRepository(db);
    await attention.resolve((await attention.list())[0]!, 'discard');
    expect(await db.first('SELECT srs_stage FROM subject_progress')).toEqual({ srs_stage: 2 });
    expect(await db.first('SELECT COUNT(*) AS n FROM pending_progress')).toEqual({ n: 0 });
    expect(await db.first('SELECT outcome FROM sync_outcomes')).toEqual({ outcome: 'discarded' });
  } finally { await db.close(); }
});

test('an old screen cannot enqueue edits or read replacement account data', async () => {
  const db = await syncDatabase(); const control = new SyncControlRepository(db);
  try {
    const context = await control.activateCredentials(await control.beginCredentialTransition(), 'account-a', true);
    const oldScreen = new AccountDatabase(db, context);
    await control.invalidateAccount(context);
    await control.activateCredentials(await control.beginCredentialTransition(), 'account-b', true);
    await expect(new PendingWriteRepository(oldScreen).queueStudyMaterial({ subjectId: 201,
      meaningNote: 'old', readingNote: null, meaningSynonyms: [], queuedAt: SYNC_NOW })).rejects.toThrow('ownership');
    await expect(oldScreen.first('SELECT id FROM user')).rejects.toThrow('ownership');
    expect(await db.first('SELECT COUNT(*) AS n FROM pending_study_materials')).toEqual({ n: 0 });
  } finally { await db.close(); }
});

test('account transition freezes local writes before the pending-work check and replacement', async () => {
  const db = await syncDatabase(); const control = new SyncControlRepository(db);
  try {
    const context = await control.activateCredentials(await control.beginCredentialTransition(), 'account-a', true);
    const screen = new AccountDatabase(db, context);
    await control.beginCredentialTransition();
    await expect(screen.run("INSERT INTO settings VALUES ('late-transition-write', 'fixture')")).rejects.toThrow('ownership');
    expect(await db.first("SELECT key FROM settings WHERE key = 'late-transition-write'")).toBeNull();
  } finally { await db.close(); }
});
