import {
  assignmentFixture,
  collectionPage,
  kanaVocabularyFixture,
  kanjiFixture,
  levelProgressionFixture,
  reviewStatisticFixture,
  studyMaterialFixture,
  userFixture,
  vocabularyFixture,
  voiceActorFixture,
} from '@/fixtures/api';
import type { WaniKaniApi } from '@/api/WaniKaniApi';
import type { SubjectData, SubjectObject } from '@/api/types';
import type {
  Database,
  DatabaseTransaction,
  RunResult,
  SqlValue,
} from '@/db/Database';
import { migrateDatabase } from '@/db/migrate';
import { NodeTestDatabase } from '@/db/NodeTestDatabase';
import { AssignmentRepository } from '@/db/repositories/AssignmentRepository';
import { ResourceRepository } from '@/db/repositories/ResourceRepository';
import { ReviewStatisticRepository } from '@/db/repositories/ReviewStatisticRepository';
import { StudyMaterialRepository } from '@/db/repositories/StudyMaterialRepository';
import { SubjectRepository } from '@/db/repositories/SubjectRepository';
import { SynchronizationEngine } from '../SyncEngine';
import {
  type FullRefreshResources,
  SyncRepository,
} from '../SyncRepository';

const NOW = new Date('2026-07-29T12:00:00.000Z');

test('a failed full-refresh fetch leaves the previous cache generation intact', async () => {
  const db = await populatedDatabase();
  try {
    const before = await cacheFingerprint(db);
    const api = fullRefreshApi();
    api.getAssignments.mockRejectedValueOnce(
      new Error('assignment download failed'),
    );
    const engine = new SynchronizationEngine({
      api,
      repository: new SyncRepository(db),
      pendingWrites: {
        sendSelectedPendingWrites: async () => undefined,
      },
      isOnline: async () => true,
      invalidate: () => undefined,
      updateNotifications: () => undefined,
      now: () => NOW,
    });

    await expect(engine.synchronize('full')).resolves.toMatchObject({
      status: 'failed',
    });
    await expect(cacheFingerprint(db)).resolves.toEqual(before);
  } finally {
    await db.close();
  }
});

test('full refresh replaces server caches while preserving local durable state', async () => {
  const db = await populatedDatabase();
  try {
    await db.run('PRAGMA foreign_keys = OFF');
    await db.run(
      `INSERT INTO audio_urls (
        url, subject_id, content_type, pronunciation, metadata_json
      ) VALUES ('https://example.com/orphan.mp3', 999, 'audio/mpeg', 'x', '{}')`,
    );
    await db.run('PRAGMA foreign_keys = ON');
    await expect(
      db.first<{ count: number }>(
        'SELECT COUNT(*) AS count FROM audio_urls',
      ),
    ).resolves.toEqual({ count: 2 });
    await db.run(
      `INSERT INTO recent_mistakes (subject_id, mistaken_at)
       VALUES (?, ?), (?, ?)`,
      [
        kanjiFixture.id,
        '2026-07-29T11:00:00.000Z',
        999,
        '2026-07-27T11:00:00.000Z',
      ],
    );
    await db.run(
      `INSERT INTO pending_progress (
        subject_id, assignment_id, operation_kind, created_at, payload_json
      ) VALUES (999, 999, 'lesson_start', ?, '{}')`,
      [NOW.toISOString()],
    );
    await db.run(
      `INSERT INTO pending_study_materials (
        subject_id, meaning_synonyms_json, created_at
      ) VALUES (999, '[]', ?)`,
      [NOW.toISOString()],
    );
    await db.run("INSERT INTO settings (key, value) VALUES ('theme', 'dark')");
    await db.run(
      `INSERT INTO sync_errors (
        occurred_at, phase, kind, message
      ) VALUES (?, 'phase-two', 'api', 'fixture')`,
      [NOW.toISOString()],
    );

    await new SyncRepository(db).replaceFullRefresh(
      fullRefreshResources(),
      NOW,
    );

    await expectCounts(db, {
      assignments: 1,
      audio_urls: 1,
      review_statistics: 1,
      study_materials: 1,
      subject_progress: 1,
      subjects: 2,
      subjects_fts: 2,
      voice_actors: 1,
      pending_progress: 1,
      pending_study_materials: 1,
      recent_mistakes: 1,
      settings: 1,
      sync_errors: 1,
      user: 1,
    });
    expect(
      await db.all(
        `SELECT subject_id AS subjectId, mistaken_at AS mistakenAt
         FROM recent_mistakes ORDER BY subject_id`,
      ),
    ).toEqual([
      {
        subjectId: kanjiFixture.id,
        mistakenAt: '2026-07-29T11:00:00.000Z',
      },
    ]);
    expect(
      await db.first(
        `SELECT assignments_updated_at, study_materials_updated_at,
                subjects_updated_at, voice_actors_updated_at,
                review_statistics_updated_at
         FROM sync_state WHERE id = 1`,
      ),
    ).toEqual({
      assignments_updated_at: assignmentFixture.data_updated_at,
      study_materials_updated_at: studyMaterialFixture.data_updated_at,
      subjects_updated_at: kanjiFixture.data_updated_at,
      voice_actors_updated_at: voiceActorFixture.data_updated_at,
      review_statistics_updated_at: reviewStatisticFixture.data_updated_at,
    });
  } finally {
    await db.close();
  }
});

test('cursor-backed resources roll back rows and cursors at the commit boundary', async () => {
  const db = await populatedDatabase();
  const repository = new SyncRepository(
    new FailBeforeCommitDatabase(db),
  );
  try {
    await expect(
      repository.replaceSubjects(
        [{ ...kanjiFixture, data: { ...kanjiFixture.data, level: 9 } }],
        'new-subjects',
      ),
    ).rejects.toThrow('injected commit failure');
    await expect(
      repository.replaceAssignments(
        [
          {
            ...assignmentFixture,
            data: { ...assignmentFixture.data, srs_stage: 8 },
          },
        ],
        'new-assignments',
      ),
    ).rejects.toThrow('injected commit failure');
    await expect(
      repository.replaceStudyMaterials(
        [
          {
            ...studyMaterialFixture,
            data: { ...studyMaterialFixture.data, meaning_note: 'New note' },
          },
        ],
        'new-study-materials',
      ),
    ).rejects.toThrow('injected commit failure');
    await expect(
      repository.replaceVoiceActors(
        [
          {
            ...voiceActorFixture,
            data: { ...voiceActorFixture.data, name: 'New voice' },
          },
        ],
        'new-voice-actors',
      ),
    ).rejects.toThrow('injected commit failure');
    await expect(
      repository.replaceReviewStatistics(
        [
          {
            ...reviewStatisticFixture,
            data: {
              ...reviewStatisticFixture.data,
              percentage_correct: 1,
            },
          },
        ],
        'new-review-statistics',
      ),
    ).rejects.toThrow('injected commit failure');

    expect(
      await db.first(
        `SELECT
          (SELECT level FROM subjects WHERE id = ?) AS subjectLevel,
          (SELECT srs_stage FROM assignments WHERE id = ?) AS srsStage,
          (SELECT meaning_note FROM study_materials WHERE id = ?) AS meaningNote,
          (SELECT name FROM voice_actors WHERE id = ?) AS voiceName,
          (SELECT percentage_correct FROM review_statistics WHERE id = ?)
            AS percentageCorrect,
          assignments_updated_at,
          study_materials_updated_at,
          subjects_updated_at,
          voice_actors_updated_at,
          review_statistics_updated_at
         FROM sync_state WHERE id = 1`,
        [
          kanjiFixture.id,
          assignmentFixture.id,
          studyMaterialFixture.id,
          voiceActorFixture.id,
          reviewStatisticFixture.id,
        ],
      ),
    ).toEqual({
      subjectLevel: kanjiFixture.data.level,
      srsStage: assignmentFixture.data.srs_stage,
      meaningNote: studyMaterialFixture.data.meaning_note,
      voiceName: voiceActorFixture.data.name,
      percentageCorrect: reviewStatisticFixture.data.percentage_correct,
      assignments_updated_at: 'assignments-cursor',
      study_materials_updated_at: 'study-materials-cursor',
      subjects_updated_at: 'subjects-cursor',
      voice_actors_updated_at: 'voice-actors-cursor',
      review_statistics_updated_at: 'review-statistics-cursor',
    });
  } finally {
    await db.close();
  }
});

test('full refresh restores recent mistakes after assignments are rebuilt', async () => {
  const db = await populatedDatabase();
  const repository = new SyncRepository(db);
  try {
    await db.run(
      `INSERT INTO recent_mistakes (subject_id, mistaken_at)
       VALUES (?, ?)`,
      [kanjiFixture.id, '2026-07-29T11:00:00.000Z'],
    );
    await repository.replaceFullRefresh(fullRefreshResources(), NOW);

    expect(
      await db.first(
        `SELECT last_mistake_at AS lastMistakeAt
         FROM subject_progress WHERE subject_id = ?`,
        [kanjiFixture.id],
      ),
    ).toEqual({ lastMistakeAt: '2026-07-29T11:00:00.000Z' });
  } finally {
    await db.close();
  }
});

test('a failed full-refresh commit rolls the entire cache generation back', async () => {
  const db = await populatedDatabase();
  try {
    const before = await cacheFingerprint(db);
    const repository = new SyncRepository(
      new FailBeforeCommitDatabase(db),
    );

    await expect(
      repository.replaceFullRefresh(fullRefreshResources(), NOW),
    ).rejects.toThrow('injected commit failure');
    await expect(cacheFingerprint(db)).resolves.toEqual(before);
  } finally {
    await db.close();
  }
});

test('logout clears account data and every cursor including review statistics', async () => {
  const db = await populatedDatabase();
  try {
    await db.run(
      `INSERT INTO recent_mistakes (subject_id, mistaken_at)
       VALUES (?, ?)`,
      [kanjiFixture.id, NOW.toISOString()],
    );
    await db.run(
      `INSERT INTO pending_progress (
        subject_id, assignment_id, operation_kind, created_at, payload_json
      ) VALUES (999, 999, 'lesson_start', ?, '{}')`,
      [NOW.toISOString()],
    );

    await new SyncRepository(db).clearForLogout();

    await expectCounts(db, {
      assignments: 0,
      audio_urls: 0,
      level_progressions: 0,
      pending_progress: 0,
      recent_mistakes: 0,
      review_statistics: 0,
      study_materials: 0,
      subject_progress: 0,
      subjects: 0,
      sync_errors: 0,
      user: 0,
      voice_actors: 0,
    });
    expect(
      await db.first(
        `SELECT assignments_updated_at, study_materials_updated_at,
                subjects_updated_at, voice_actors_updated_at,
                review_statistics_updated_at
         FROM sync_state WHERE id = 1`,
      ),
    ).toEqual({
      assignments_updated_at: null,
      study_materials_updated_at: null,
      subjects_updated_at: null,
      voice_actors_updated_at: null,
      review_statistics_updated_at: null,
    });
  } finally {
    await db.close();
  }
});

test('an increased subscription level resets the subject cursor', async () => {
  const db = await populatedDatabase();
  try {
    await db.run('UPDATE user SET max_level_granted = 3');

    await new SyncRepository(db).replaceUser(userFixture);

    expect(
      await db.first(
        'SELECT subjects_updated_at FROM sync_state WHERE id = 1',
      ),
    ).toEqual({ subjects_updated_at: null });
  } finally {
    await db.close();
  }
});

test('quick sync downloads newly granted subjects in the same run', async () => {
  const db = await populatedDatabase();
  try {
    await db.run('UPDATE user SET max_level_granted = 3');
    const api = fullRefreshApi();
    api.getSubjects.mockImplementation(async (updatedAfter) =>
      collectionPage(updatedAfter === null ? [kanaVocabularyFixture] : []),
    );
    const engine = new SynchronizationEngine({
      api,
      repository: new SyncRepository(db),
      pendingWrites: {
        sendSelectedPendingWrites: async () => undefined,
      },
      isOnline: async () => true,
      invalidate: () => undefined,
      updateNotifications: () => undefined,
      now: () => NOW,
    });

    await expect(engine.synchronize('quick')).resolves.toMatchObject({
      status: 'completed',
    });
    expect(api.getSubjects).toHaveBeenCalledWith(null);
    await expect(
      db.first('SELECT level FROM subjects WHERE id = ?', [
        kanaVocabularyFixture.id,
      ]),
    ).resolves.toEqual({ level: 8 });
  } finally {
    await db.close();
  }
});

async function populatedDatabase(): Promise<NodeTestDatabase> {
  const db = await NodeTestDatabase.open();
  await migrateDatabase(db);
  await new ResourceRepository(db).replaceUser(userFixture);
  await new SubjectRepository(db).replaceSubjects(
    [kanjiFixture, vocabularyFixture],
    'subjects-cursor',
  );
  await new AssignmentRepository(db).replaceAssignments(
    [assignmentFixture],
    'assignments-cursor',
  );
  await new StudyMaterialRepository(db).replaceStudyMaterials(
    [studyMaterialFixture],
    'study-materials-cursor',
  );
  await new ResourceRepository(db).replaceVoiceActors(
    [voiceActorFixture],
    'voice-actors-cursor',
  );
  await new ReviewStatisticRepository(db).replaceReviewStatistics(
    [reviewStatisticFixture],
    'review-statistics-cursor',
  );
  return db;
}

async function cacheFingerprint(db: Database) {
  return {
    assignments: await db.all('SELECT * FROM assignments ORDER BY id'),
    reviewStatistics: await db.all(
      'SELECT * FROM review_statistics ORDER BY id',
    ),
    studyMaterials: await db.all(
      'SELECT * FROM study_materials ORDER BY id',
    ),
    subjects: await db.all('SELECT * FROM subjects ORDER BY id'),
    syncState: await db.first('SELECT * FROM sync_state WHERE id = 1'),
    user: await db.all('SELECT * FROM user ORDER BY id'),
    voiceActors: await db.all('SELECT * FROM voice_actors ORDER BY id'),
  };
}

function fullRefreshApi() {
  return {
    getSubjects: jest.fn(async () => collectionPage([kanjiFixture])),
    getAssignments: jest.fn(async () => collectionPage([assignmentFixture])),
    getStudyMaterials: jest.fn(async () =>
      collectionPage([studyMaterialFixture]),
    ),
    getUser: jest.fn(async () => userFixture),
    getLevelProgressions: jest.fn(async () =>
      collectionPage([levelProgressionFixture]),
    ),
    getVoiceActors: jest.fn(async () => collectionPage([voiceActorFixture])),
    getReviewStatistics: jest.fn(async () =>
      collectionPage([reviewStatisticFixture]),
    ),
    rateLimit: {
      limit: 60,
      requestsInServerMinute: 0,
      requestsRemaining: 60,
      resetAfterMs: 60_000,
      estimatedClockSkewMs: 0,
    },
  } as unknown as WaniKaniApi & {
    getAssignments: jest.MockedFunction<WaniKaniApi['getAssignments']>;
    getSubjects: jest.MockedFunction<WaniKaniApi['getSubjects']>;
  };
}

function fullRefreshResources(): FullRefreshResources {
  return {
    assignments: collectionPage([assignmentFixture]),
    levelProgressions: collectionPage([levelProgressionFixture]),
    reviewStatistics: collectionPage([reviewStatisticFixture]),
    studyMaterials: collectionPage([studyMaterialFixture]),
    subjects: collectionPage<SubjectData, SubjectObject>([
      kanjiFixture,
      vocabularyFixture,
    ]),
    user: userFixture,
    voiceActors: collectionPage([voiceActorFixture]),
  };
}

async function expectCounts(
  db: NodeTestDatabase,
  expected: Readonly<Record<string, number>>,
): Promise<void> {
  for (const [table, count] of Object.entries(expected)) {
    await expect(
      db.first<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`),
    ).resolves.toEqual({ count });
  }
}

class FailBeforeCommitDatabase implements Database {
  constructor(private readonly delegate: Database) {}

  run(
    sql: string,
    params?: readonly SqlValue[],
  ): Promise<RunResult> {
    return this.delegate.run(sql, params);
  }

  first<T>(
    sql: string,
    params?: readonly SqlValue[],
  ): Promise<T | null> {
    return this.delegate.first<T>(sql, params);
  }

  all<T>(
    sql: string,
    params?: readonly SqlValue[],
  ): Promise<readonly T[]> {
    return this.delegate.all<T>(sql, params);
  }

  transaction<T>(
    operation: (tx: DatabaseTransaction) => Promise<T>,
  ): Promise<T> {
    return this.delegate.transaction(async (tx) => {
      await operation(tx);
      throw new Error('injected commit failure');
    });
  }

  close(): Promise<void> {
    return this.delegate.close();
  }
}
