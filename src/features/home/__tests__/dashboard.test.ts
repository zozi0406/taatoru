import type {
  AssignmentData,
  IdentifiedResource,
  Resource,
  UserData,
} from '@/api/types';
import {
  assignmentFixture,
  kanjiFixture,
  radicalFixture,
  userFixture,
  vocabularyFixture,
} from '@/fixtures/api';
import { migrateDatabase } from '@/db/migrate';
import { NodeTestDatabase } from '@/db/NodeTestDatabase';
import { AssignmentRepository } from '@/db/repositories/AssignmentRepository';
import { ResourceRepository } from '@/db/repositories/ResourceRepository';
import { SubjectRepository } from '@/db/repositories/SubjectRepository';
import { getDashboardSnapshot } from '../dashboard';

const NOW = new Date('2026-07-29T12:00:00.000Z');

test('builds the complete local dashboard snapshot', async () => {
  const db = await dashboardDatabase();
  try {
    await expect(
      getDashboardSnapshot(db, NOW, false),
    ).resolves.toEqual({
      level: 1,
      lessonCount: 1,
      reviewCount: 1,
      nextReviewAt: NOW.toISOString(),
      reviewBuckets: [
        { hoursFromNow: 0, count: 1, cumulative: 1 },
        { hoursFromNow: 2, count: 1, cumulative: 2 },
      ],
      currentLevel: {
        radical: { locked: 0, lesson: 1, apprentice: 0, guru: 0 },
        kanji: { locked: 0, lesson: 0, apprentice: 1, guru: 0 },
        vocabulary: { locked: 0, lesson: 0, apprentice: 0, guru: 1 },
      },
      srs: {
        apprentice: 1,
        guru: 1,
        master: 0,
        enlightened: 0,
        burned: 0,
      },
      pendingWriteCount: 2,
      vacationActive: true,
      online: false,
      lastSyncAt: '2026-07-29T11:30:00.000Z',
    });
  } finally {
    await db.close();
  }
});

async function dashboardDatabase(): Promise<NodeTestDatabase> {
  const db = await NodeTestDatabase.open();
  await migrateDatabase(db);
  await new ResourceRepository(db).replaceUser(vacationUser());
  await new SubjectRepository(db).replaceSubjects(
    [radicalFixture, kanjiFixture, vocabularyFixture],
    null,
  );
  await new AssignmentRepository(db).replaceAssignments(
    [
      assignment(radicalFixture.id, 'radical', 0, null, null),
      assignment(
        kanjiFixture.id,
        'kanji',
        2,
        '2026-07-01T00:00:00.000Z',
        '2026-07-29T11:00:00.000Z',
      ),
      assignment(
        vocabularyFixture.id,
        'vocabulary',
        5,
        '2026-07-01T00:00:00.000Z',
        '2026-07-29T14:00:00.000Z',
      ),
    ],
    null,
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
  await db.run(
    'UPDATE sync_state SET last_sync_at = ? WHERE id = 1',
    ['2026-07-29T11:30:00.000Z'],
  );
  return db;
}

function vacationUser(): Resource<UserData, 'user'> {
  return {
    ...userFixture,
    data: {
      ...userFixture.data,
      level: 1,
      current_vacation_started_at: '2026-07-28T12:00:00.000Z',
    },
  };
}

function assignment(
  subjectId: number,
  subjectType: AssignmentData['subject_type'],
  srsStage: number,
  startedAt: string | null,
  availableAt: string | null,
): IdentifiedResource<AssignmentData, 'assignment'> {
  return {
    ...assignmentFixture,
    id: 1_000 + subjectId,
    data: {
      ...assignmentFixture.data,
      subject_id: subjectId,
      subject_type: subjectType,
      srs_stage: srsStage,
      started_at: startedAt,
      available_at: availableAt,
    },
  };
}
