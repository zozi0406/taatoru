export const SCHEMA_VERSION = 1;

export const MIGRATION_1_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS sync_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    schema_version INTEGER NOT NULL,
    assignments_updated_at TEXT,
    study_materials_updated_at TEXT,
    subjects_updated_at TEXT,
    voice_actors_updated_at TEXT,
    review_statistics_updated_at TEXT,
    last_full_sync_at TEXT,
    last_sync_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS user (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    level INTEGER NOT NULL,
    max_level_granted INTEGER NOT NULL,
    subscription_active INTEGER NOT NULL CHECK (subscription_active IN (0, 1)),
    data_updated_at TEXT NOT NULL,
    resource_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY,
    object TEXT NOT NULL CHECK (
      object IN ('radical', 'kanji', 'vocabulary', 'kana_vocabulary')
    ),
    level INTEGER NOT NULL,
    lesson_position INTEGER NOT NULL,
    slug TEXT NOT NULL,
    characters TEXT,
    meanings_text TEXT NOT NULL,
    readings_text TEXT NOT NULL,
    hidden_at TEXT,
    visually_similar_subject_ids_json TEXT NOT NULL DEFAULT '[]',
    data_updated_at TEXT NOT NULL,
    resource_json TEXT NOT NULL
  )`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS subjects_fts USING fts5(
    subject_id UNINDEXED,
    characters,
    readings,
    meanings,
    synonyms,
    tokenize = 'unicode61'
  )`,
  `CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY,
    subject_id INTEGER NOT NULL UNIQUE,
    subject_type TEXT NOT NULL,
    srs_stage INTEGER NOT NULL,
    available_at TEXT,
    unlocked_at TEXT,
    started_at TEXT,
    passed_at TEXT,
    burned_at TEXT,
    resurrected_at TEXT,
    hidden INTEGER NOT NULL CHECK (hidden IN (0, 1)),
    data_updated_at TEXT NOT NULL,
    resource_json TEXT NOT NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS study_materials (
    id INTEGER PRIMARY KEY,
    subject_id INTEGER NOT NULL UNIQUE,
    subject_type TEXT NOT NULL,
    meaning_note TEXT,
    reading_note TEXT,
    meaning_synonyms_json TEXT NOT NULL,
    hidden INTEGER NOT NULL CHECK (hidden IN (0, 1)),
    data_updated_at TEXT NOT NULL,
    resource_json TEXT NOT NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS level_progressions (
    id INTEGER PRIMARY KEY,
    level INTEGER NOT NULL,
    unlocked_at TEXT,
    started_at TEXT,
    passed_at TEXT,
    completed_at TEXT,
    abandoned_at TEXT,
    data_updated_at TEXT NOT NULL,
    resource_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS voice_actors (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    gender TEXT NOT NULL,
    description TEXT NOT NULL,
    data_updated_at TEXT NOT NULL,
    resource_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS review_statistics (
    id INTEGER PRIMARY KEY,
    subject_id INTEGER NOT NULL UNIQUE,
    subject_type TEXT NOT NULL,
    meaning_correct INTEGER NOT NULL,
    meaning_incorrect INTEGER NOT NULL,
    meaning_max_streak INTEGER NOT NULL,
    meaning_current_streak INTEGER NOT NULL,
    reading_correct INTEGER NOT NULL,
    reading_incorrect INTEGER NOT NULL,
    reading_max_streak INTEGER NOT NULL,
    reading_current_streak INTEGER NOT NULL,
    percentage_correct INTEGER NOT NULL,
    hidden INTEGER NOT NULL CHECK (hidden IN (0, 1)),
    data_updated_at TEXT NOT NULL,
    resource_json TEXT NOT NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS audio_urls (
    url TEXT PRIMARY KEY,
    subject_id INTEGER NOT NULL,
    voice_actor_id INTEGER,
    content_type TEXT NOT NULL,
    pronunciation TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS subject_progress (
    subject_id INTEGER PRIMARY KEY,
    assignment_id INTEGER,
    subject_type TEXT NOT NULL,
    level INTEGER NOT NULL,
    srs_stage INTEGER NOT NULL,
    available_at TEXT,
    started_at TEXT,
    passed_at TEXT,
    burned_at TEXT,
    last_mistake_at TEXT,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS pending_progress (
    subject_id INTEGER PRIMARY KEY,
    assignment_id INTEGER NOT NULL,
    operation_kind TEXT NOT NULL CHECK (
      operation_kind IN ('lesson_start', 'review')
    ),
    incorrect_meaning_answers INTEGER NOT NULL DEFAULT 0,
    incorrect_reading_answers INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_error_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS pending_study_materials (
    subject_id INTEGER PRIMARY KEY,
    study_material_id INTEGER,
    meaning_note TEXT,
    reading_note TEXT,
    meaning_synonyms_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS recent_mistakes (
    subject_id INTEGER PRIMARY KEY,
    mistaken_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sync_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    occurred_at TEXT NOT NULL,
    phase TEXT NOT NULL,
    kind TEXT NOT NULL,
    status INTEGER,
    safe_url TEXT,
    retry_at TEXT,
    message TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS active_sessions (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('lesson', 'review')),
    state_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS assignments_subject_id_idx
    ON assignments(subject_id)`,
  `CREATE INDEX IF NOT EXISTS subjects_level_object_idx
    ON subjects(level, object, lesson_position, id)`,
  `CREATE INDEX IF NOT EXISTS review_statistics_subject_id_idx
    ON review_statistics(subject_id)`,
  `CREATE INDEX IF NOT EXISTS audio_urls_subject_actor_idx
    ON audio_urls(subject_id, voice_actor_id)`,
  `CREATE INDEX IF NOT EXISTS pending_progress_created_at_idx
    ON pending_progress(created_at)`,
  `CREATE INDEX IF NOT EXISTS pending_study_materials_created_at_idx
    ON pending_study_materials(created_at)`,
  `CREATE INDEX IF NOT EXISTS recent_mistakes_mistaken_at_idx
    ON recent_mistakes(mistaken_at)`,
  `CREATE INDEX IF NOT EXISTS sync_errors_occurred_at_idx
    ON sync_errors(occurred_at)`,
  `INSERT OR IGNORE INTO sync_state (
    id,
    schema_version,
    assignments_updated_at,
    study_materials_updated_at,
    subjects_updated_at,
    voice_actors_updated_at,
    review_statistics_updated_at
  ) VALUES (1, 1, NULL, NULL, NULL, NULL, NULL)`,
  'PRAGMA user_version = 1',
];
