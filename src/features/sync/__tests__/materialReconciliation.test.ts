import { ApiError, NetworkError } from '@/api/errors';
import { studyMaterialFixture } from '@/fixtures/api';
import { FixtureSyncApi, SYNC_NOW, syncDatabase } from '@/test/sync/fixtures';
import { StudyMaterialRepository } from '@/db/repositories/StudyMaterialRepository';
import { SyncRepository } from '../SyncRepository';
import { PendingWriteRepository } from '../PendingWriteRepository';
import { PendingWriteSender } from '../PendingWriteSender';
import { FencedDatabase } from '../FencedDatabase';
import { SyncControlRepository } from '../SyncControlRepository';

const selection = { progressIds: [], studyMaterialIds: [201] };
const edit = (meaningNote: string) => ({ subjectId: 201, meaningNote,
  readingNote: studyMaterialFixture.data.reading_note,
  meaningSynonyms: studyMaterialFixture.data.meaning_synonyms, queuedAt: SYNC_NOW });

test('create then edit before acknowledgement binds the server ID without losing the new edit', async () => {
  const db = await syncDatabase();
  const api = new FixtureSyncApi();
  const writes = new PendingWriteRepository(db);
  try {
    await db.run('DELETE FROM study_materials'); api.material = null;
    await writes.queueStudyMaterial(edit('first'));
    const accept = api.upsertStudyMaterial.bind(api);
    api.upsertStudyMaterial = async (input) => {
      const receipt = await accept(input);
      await writes.queueStudyMaterial(edit('second'));
      api.upsertStudyMaterial = accept;
      return receipt;
    };
    await new PendingWriteSender(db, api).sendSelectedPendingWrites(selection, SYNC_NOW);
    expect(await db.first('SELECT study_material_id, meaning_note, revision FROM pending_study_materials'))
      .toEqual({ study_material_id: studyMaterialFixture.id, meaning_note: 'second', revision: 2 });
    await new PendingWriteSender(db, api).sendSelectedPendingWrites(selection, SYNC_NOW);
    expect(api.materialWrites.map((input) => input.studyMaterialId)).toEqual([undefined, studyMaterialFixture.id]);
    expect(api.material).toMatchObject({ data: { meaning_note: 'second' } });
    expect(await db.first('SELECT COUNT(*) AS n FROM pending_study_materials')).toEqual({ n: 0 });
  } finally { await db.close(); }
});

test('lost create acknowledgement is looked up before any second POST', async () => {
  const db = await syncDatabase();
  const api = new FixtureSyncApi();
  try {
    await db.run('DELETE FROM study_materials'); api.material = null;
    await new PendingWriteRepository(db).queueStudyMaterial(edit('created'));
    const accept = api.upsertStudyMaterial.bind(api);
    api.upsertStudyMaterial = async (input) => { await accept(input); throw new NetworkError('lost'); };
    await expect(new PendingWriteSender(db, api).sendSelectedPendingWrites(selection, SYNC_NOW)).rejects.toThrow('lost');
    await new PendingWriteSender(db, api).sendSelectedPendingWrites(selection, SYNC_NOW);
    expect(api.materialWrites).toHaveLength(1);
    expect(await db.first('SELECT id FROM study_materials')).toEqual({ id: studyMaterialFixture.id });
    expect(await db.first('SELECT COUNT(*) AS n FROM pending_study_materials')).toEqual({ n: 0 });
  } finally { await db.close(); }
});

test('an older lost dispatch rebases a newer edit after restart', async () => {
  const db = await syncDatabase();
  const api = new FixtureSyncApi();
  const writes = new PendingWriteRepository(db);
  try {
    await writes.queueStudyMaterial(edit('first'));
    const accept = api.upsertStudyMaterial.bind(api);
    api.upsertStudyMaterial = async (input) => {
      await accept(input); await writes.queueStudyMaterial(edit('second')); throw new NetworkError('lost');
    };
    await expect(new PendingWriteSender(db, api).sendSelectedPendingWrites(selection, SYNC_NOW)).rejects.toThrow('lost');
    api.upsertStudyMaterial = accept;
    await new PendingWriteSender(db, api).sendSelectedPendingWrites(selection, SYNC_NOW);
    expect(api.material?.data.meaning_note).toBe('second');
    expect(await db.first('SELECT COUNT(*) AS n FROM pending_study_materials')).toEqual({ n: 0 });
    expect(await db.first('SELECT COUNT(*) AS n FROM sync_dispatches')).toEqual({ n: 0 });
  } finally { await db.close(); }
});

test.each([false, true])('remote and local %s same-field edits use API authority or merge compatible fields', async (sameField) => {
  const db = await syncDatabase();
  const api = new FixtureSyncApi();
  try {
    await new PendingWriteRepository(db).queueStudyMaterial(edit('local meaning'));
    api.material = { ...studyMaterialFixture, data: { ...studyMaterialFixture.data,
      ...(sameField ? { meaning_note: 'remote meaning' } : { reading_note: 'remote reading' }) } };
    await new PendingWriteSender(db, api).sendSelectedPendingWrites(selection, SYNC_NOW);
    if (sameField) {
      expect(api.materialWrites).toHaveLength(0);
      expect(await db.first('SELECT COUNT(*) AS n FROM pending_study_materials')).toEqual({ n: 0 });
      expect(await db.first('SELECT meaning_note FROM study_materials')).toEqual({ meaning_note: 'remote meaning' });
    } else {
      expect(api.material?.data).toMatchObject({ meaning_note: 'local meaning', reading_note: 'remote reading' });
      expect(await db.first('SELECT COUNT(*) AS n FROM pending_study_materials')).toEqual({ n: 0 });
    }
  } finally { await db.close(); }
});

test('a stale material ID is rebound by subject and a failed lookup never permits creation', async () => {
  const db = await syncDatabase();
  const api = new FixtureSyncApi();
  try {
    await new PendingWriteRepository(db).queueStudyMaterial(edit('local'));
    await db.run('UPDATE pending_study_materials SET study_material_id = 999');
    const lookup = api.findStudyMaterial.bind(api);
    api.findStudyMaterial = async () => { throw new NetworkError('lookup failed'); };
    await expect(new PendingWriteSender(db, api).sendSelectedPendingWrites(selection, SYNC_NOW)).rejects.toThrow('lookup failed');
    expect(api.materialWrites).toHaveLength(0);
    api.findStudyMaterial = lookup;
    await new PendingWriteSender(db, api).sendSelectedPendingWrites(selection, SYNC_NOW);
    expect(api.materialWrites[0]?.studyMaterialId).toBe(studyMaterialFixture.id);
  } finally { await db.close(); }
});

test('a late old PUT cannot erase evidence of the newer acknowledged desired values', async () => {
  const db = await syncDatabase();
  const api = new FixtureSyncApi();
  const writes = new PendingWriteRepository(db);
  let release!: () => void;
  let entered!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const accept = api.upsertStudyMaterial.bind(api);
  api.upsertStudyMaterial = async (input) => {
    if (input.meaningNote === 'older') { entered(); await barrier; }
    return accept(input);
  };
  try {
    const control = new SyncControlRepository(db);
    const context = await control.activateCredentials(await control.beginCredentialTransition(), api.user.data.id, false);
    let now = SYNC_NOW.getTime();
    const first = (await control.acquire(context, now))!;
    await writes.queueStudyMaterial(edit('older'));
    const sending = new PendingWriteSender(new FencedDatabase(db, first, () => now), api, first.ownerFence)
      .sendSelectedPendingWrites(selection, new Date(now));
    const stopped = expect(sending).rejects.toThrow('ownership');
    await started;
    now += 120_001;
    const second = (await control.acquire(context, now))!;
    await writes.queueStudyMaterial(edit('newer'));
    await new PendingWriteSender(new FencedDatabase(db, second, () => now), api, second.ownerFence)
      .sendSelectedPendingWrites(selection, new Date(now));
    release(); await stopped;
    // WaniKani provides no conditional PUT; remote arrival order cannot be fenced locally.
    expect(api.material?.data.meaning_note).toBe('older');
    const evidence = await db.first<{ payload_json: string }>(
      "SELECT payload_json FROM sync_dispatches WHERE delivery_state = 'acknowledged'");
    expect(JSON.parse(evidence!.payload_json).meaningNote).toBe('newer');
  } finally { release?.(); await db.close(); }
});

test('a definitively rejected older revision does not leave false unresolved upload history', async () => {
  const db = await syncDatabase(); const api = new FixtureSyncApi(); const writes = new PendingWriteRepository(db);
  try {
    await writes.queueStudyMaterial(edit('invalid first'));
    const accept = api.upsertStudyMaterial.bind(api);
    api.upsertStudyMaterial = async () => { throw new ApiError('validation', { status: 422 }); };
    await new PendingWriteSender(db, api).sendSelectedPendingWrites(selection, SYNC_NOW);
    await writes.queueStudyMaterial(edit('corrected'));
    api.upsertStudyMaterial = accept;
    await new PendingWriteSender(db, api).sendSelectedPendingWrites(selection, SYNC_NOW);
    expect(await db.first('SELECT COUNT(*) AS n FROM sync_dispatches')).toEqual({ n: 0 });
  } finally { await db.close(); }
});


test.each([false, true])('missing material baseline adopts verified API state: absent=%s', async (absent) => {
  const db = await syncDatabase(); const api = new FixtureSyncApi();
  try {
    await new PendingWriteRepository(db).queueStudyMaterial(edit('legacy local'));
    await db.run('UPDATE pending_study_materials SET source_json = NULL');
    if (absent) api.material = null;
    await new PendingWriteSender(db, api).sendSelectedPendingWrites(selection, SYNC_NOW);
    expect(api.materialWrites).toHaveLength(0);
    expect(await db.first('SELECT COUNT(*) AS n FROM pending_study_materials')).toEqual({ n: 0 });
    expect(await db.first('SELECT meaning_note FROM study_materials'))
      .toEqual(absent ? null : { meaning_note: api.material!.data.meaning_note });
  } finally { await db.close(); }
});

test('an edit arriving during authoritative conflict lookup survives the old decision', async () => {
  const db = await syncDatabase(); const api = new FixtureSyncApi();
  try {
    const writes = new PendingWriteRepository(db); await writes.queueStudyMaterial(edit('first local'));
    api.findStudyMaterial = async () => {
      await writes.queueStudyMaterial(edit('newer local'));
      return { ...studyMaterialFixture, data: { ...studyMaterialFixture.data, meaning_note: 'remote' } };
    };
    await new PendingWriteSender(db, api).sendSelectedPendingWrites(selection, SYNC_NOW);
    expect(await db.first('SELECT meaning_note FROM pending_study_materials')).toEqual({ meaning_note: 'newer local' });
    expect(await db.first('SELECT meaning_note FROM study_materials')).toEqual({ meaning_note: 'newer local' });
    expect(api.materialWrites).toHaveLength(0);
  } finally { await db.close(); }
});


test('authoritative material reconciliation cannot roll back a newer cached API version', async () => {
  const db = await syncDatabase(); const api = new FixtureSyncApi();
  try {
    await new StudyMaterialRepository(db).replaceStudyMaterials([{ ...studyMaterialFixture,
      data_updated_at: '2026-11-01T12:00:00Z', data: { ...studyMaterialFixture.data, meaning_note: 'newer API' } }], null);
    await new PendingWriteRepository(db).queueStudyMaterial(edit('local'));
    await new PendingWriteSender(db, api).sendSelectedPendingWrites(selection, SYNC_NOW);
    expect(await db.first('SELECT meaning_note FROM study_materials')).toEqual({ meaning_note: 'newer API' });
    expect(await db.first('SELECT COUNT(*) AS n FROM pending_study_materials')).toEqual({ n: 0 });
    expect(api.materialWrites).toHaveLength(0);
  } finally { await db.close(); }
});

test.each(['success', 'failed-lookup', 'new-edit'] as const)('old material dispatch history is verified automatically: %s', async (kind) => {
  const db = await syncDatabase(); const api = new FixtureSyncApi();
  try {
    await db.run(`INSERT INTO sync_dispatches (operation_key, revision, queue_kind, subject_id, account_epoch,
      payload_json, delivery_state, owner_fence) VALUES ('old-material', 1, 'material', 201, 0, '{}', 'uncertain', 1)`);
    api.findStudyMaterial = async () => {
      if (kind === 'failed-lookup') throw new NetworkError('fixture offline');
      if (kind === 'new-edit') await new PendingWriteRepository(db).queueStudyMaterial(edit('new local'));
      return studyMaterialFixture;
    };
    const sender = new PendingWriteSender(db, api);
    const attempt = sender.sendSelectedPendingWrites({ progressIds: [], studyMaterialIds: [] }, SYNC_NOW);
    if (kind === 'failed-lookup') await expect(attempt).rejects.toThrow('fixture offline');
    else await attempt;
    expect(api.materialWrites).toHaveLength(0);
    expect(await db.first('SELECT COUNT(*) AS n FROM sync_dispatches')).toEqual({ n: kind === 'success' ? 0 : 1 });
    if (kind !== 'success') expect((await new SyncRepository(db).getQueueSummary()).nextAttemptAt).not.toBeNull();
    if (kind === 'new-edit') expect(await db.first('SELECT meaning_note FROM pending_study_materials')).toEqual({ meaning_note: 'new local' });
  } finally { await db.close(); }
});


test('history blocked by a newer edit cannot bypass its retry deadline or spin on rejection', async () => {
  const db = await syncDatabase();
  try {
    await db.run(`INSERT INTO sync_dispatches (operation_key, revision, queue_kind, subject_id, account_epoch,
      payload_json, delivery_state, owner_fence) VALUES ('old-material', 1, 'material', 201, 0, '{}', 'uncertain', 1)`);
    await new PendingWriteRepository(db).queueStudyMaterial(edit('new local'));
    const future = '2026-11-02T12:00:00.000Z';
    await db.run('UPDATE pending_study_materials SET next_attempt_at = ?', [future]);
    const repository = new SyncRepository(db, () => SYNC_NOW);
    expect((await repository.getQueueSummary()).nextAttemptAt).toBe(future);
    await db.run("UPDATE pending_study_materials SET delivery_state = 'rejected', next_attempt_at = NULL");
    expect(await repository.getQueueSummary()).toMatchObject({ pending: 2, rejected: 1, nextAttemptAt: null });
  } finally { await db.close(); }
});
