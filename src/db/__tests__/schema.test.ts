import { migrateDatabase } from '../migrate';
import { NodeTestDatabase } from '../NodeTestDatabase';

test('creates every durable sync table and FTS index', async () => {
  const db = await NodeTestDatabase.open();
  try {
    await migrateDatabase(db);

    expect(await db.tableNames()).toEqual(
      expect.arrayContaining([
        'sync_state',
        'user',
        'subjects',
        'subjects_fts',
        'assignments',
        'study_materials',
        'level_progressions',
        'voice_actors',
        'review_statistics',
        'audio_urls',
        'subject_progress',
        'pending_progress',
        'pending_study_materials',
        'recent_mistakes',
        'sync_errors',
        'settings',
        'active_sessions',
      ]),
    );
  } finally {
    await db.close();
  }
});

test('initializes the singleton sync cursor row exactly once', async () => {
  const db = await NodeTestDatabase.open();
  try {
    await migrateDatabase(db);
    await migrateDatabase(db);

    expect(await db.all('SELECT * FROM sync_state')).toEqual([
      expect.objectContaining({
        id: 1,
        schema_version: 1,
        assignments_updated_at: null,
        study_materials_updated_at: null,
        subjects_updated_at: null,
        voice_actors_updated_at: null,
        review_statistics_updated_at: null,
      }),
    ]);
    expect(
      await db.first<{ user_version: number }>('PRAGMA user_version'),
    ).toEqual({ user_version: 1 });
  } finally {
    await db.close();
  }
});

test('creates indexes for the sync and derived-query access paths', async () => {
  const db = await NodeTestDatabase.open();
  try {
    await migrateDatabase(db);

    const indexes = await db.all<{ name: string }>(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'index' AND name NOT LIKE 'sqlite_%'`,
    );
    expect(indexes.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'assignments_subject_id_idx',
        'subjects_level_object_idx',
        'review_statistics_subject_id_idx',
        'audio_urls_subject_actor_idx',
        'pending_progress_created_at_idx',
        'pending_study_materials_created_at_idx',
        'recent_mistakes_mistaken_at_idx',
      ]),
    );
  } finally {
    await db.close();
  }
});
