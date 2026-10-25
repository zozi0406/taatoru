import { NetworkError } from '@/api/errors';
import { studyMaterialFixture } from '@/fixtures/api';
import { FixtureSyncApi, SYNC_NOW, syncDatabase } from '@/test/sync/fixtures';
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

test.each([false, true])('remote and local %s same-field edits are merged or retained for a decision', async (sameField) => {
  const db = await syncDatabase();
  const api = new FixtureSyncApi();
  try {
    await new PendingWriteRepository(db).queueStudyMaterial(edit('local meaning'));
    api.material = { ...studyMaterialFixture, data: { ...studyMaterialFixture.data,
      ...(sameField ? { meaning_note: 'remote meaning' } : { reading_note: 'remote reading' }) } };
    await new PendingWriteSender(db, api).sendSelectedPendingWrites(selection, SYNC_NOW);
    if (sameField) {
      expect(api.materialWrites).toHaveLength(0);
      expect(await db.first('SELECT delivery_state, last_error_kind FROM pending_study_materials'))
        .toEqual({ delivery_state: 'rejected', last_error_kind: 'material-conflict' });
      const row = await db.first<{ conflict_json: string }>('SELECT conflict_json FROM pending_study_materials');
      expect(JSON.parse(row!.conflict_json).remote.data.meaning_note).toBe('remote meaning');
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
