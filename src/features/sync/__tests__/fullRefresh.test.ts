import {
  assignmentFixture,
  kanjiFixture,
  reviewStatisticFixture,
  studyMaterialFixture,
  userFixture,
  vocabularyFixture,
  voiceActorFixture,
} from '@/fixtures/api';
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
import { SyncRepository } from '../SyncRepository';

const NOW = new Date('2026-07-29T12:00:00.000Z');

test('full refresh clears server caches while preserving local durable state', async () => {
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

    const recentMistakes = await new SyncRepository(db).prepareFullRefresh(NOW);

    await expectCounts(db, {
      assignments: 0,
      audio_urls: 0,
      review_statistics: 0,
      study_materials: 0,
      subject_progress: 0,
      subjects: 0,
      subjects_fts: 0,
      voice_actors: 0,
      pending_progress: 1,
      pending_study_materials: 1,
      recent_mistakes: 1,
      settings: 1,
      sync_errors: 1,
      user: 1,
    });
    expect(recentMistakes).toEqual([
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
    const recentMistakes = await repository.prepareFullRefresh(NOW);

    await new SubjectRepository(db).replaceSubjects([kanjiFixture], null);
    await new AssignmentRepository(db).replaceAssignments(
      [assignmentFixture],
      null,
    );
    await repository.restoreRecentMistakes(recentMistakes, NOW);

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
