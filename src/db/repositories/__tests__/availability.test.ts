import type {
  AssignmentData,
  IdentifiedResource,
  Resource,
  StudyMaterialData,
  SubjectResource,
  UserData,
} from '@/api/types';
import {
  assignmentFixture,
  kanaVocabularyFixture,
  kanjiFixture,
  radicalFixture,
  studyMaterialFixture,
  userFixture,
  vocabularyFixture,
} from '@/fixtures/api';
import { migrateDatabase } from '../../migrate';
import { NodeTestDatabase } from '../../NodeTestDatabase';
import { AssignmentRepository } from '../AssignmentRepository';
import { DerivedRepository } from '../DerivedRepository';
import { ResourceRepository } from '../ResourceRepository';
import { StudyMaterialRepository } from '../StudyMaterialRepository';
import { SubjectRepository } from '../SubjectRepository';

const FIXED_NOW = new Date('2026-07-29T12:00:00.000Z');

test('available lessons exclude hidden, started, locked, above-plan, and marked items', async () => {
  const db = await availabilityDatabase();
  try {
    const assignments = new AssignmentRepository(db);
    expect(
      (await assignments.getAvailableLessons(FIXED_NOW)).map(
        ({ subjectId }) => subjectId,
      ),
    ).toEqual([101, 105]);
  } finally {
    await db.close();
  }
});

test('derived reviews, hourly buckets, SRS counts, and leeches are stable', async () => {
  const db = await availabilityDatabase();
  try {
    const derived = new DerivedRepository(db);
    expect(
      (await derived.getAvailableReviews(FIXED_NOW)).map(
        ({ subjectId }) => subjectId,
      ),
    ).toEqual([108]);
    expect(await derived.getUpcomingReviews(FIXED_NOW, 3)).toEqual([
      { hoursFromNow: 2, count: 1 },
    ]);
    expect(await derived.getSrsCounts()).toEqual({
      apprentice: 2,
      guru: 0,
      master: 0,
      enlightened: 0,
      burned: 0,
    });
    expect((await derived.getLeeches(1)).map(({ subjectId }) => subjectId)).toEqual([
      108,
    ]);
  } finally {
    await db.close();
  }
});

async function availabilityDatabase(): Promise<NodeTestDatabase> {
  const db = await NodeTestDatabase.open();
  await migrateDatabase(db);
  await new ResourceRepository(db).replaceUser(freeUser());
  await new SubjectRepository(db).replaceSubjects(subjects(), null);
  await new StudyMaterialRepository(db).replaceStudyMaterials(
    [excludedMaterial()],
    null,
  );
  await new AssignmentRepository(db).replaceAssignments(assignments(), null);
  await db.run(
    `INSERT INTO review_statistics (
      id, subject_id, subject_type, meaning_correct, meaning_incorrect,
      meaning_max_streak, meaning_current_streak, reading_correct,
      reading_incorrect, reading_max_streak, reading_current_streak,
      percentage_correct, hidden, data_updated_at, resource_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      900,
      108,
      'kanji',
      10,
      4,
      4,
      2,
      10,
      2,
      4,
      2,
      80,
      false,
      '2026-07-29T12:00:00.000Z',
      '{}',
    ],
  );
  return db;
}

function freeUser(): Resource<UserData, 'user'> {
  return {
    ...userFixture,
    data: {
      ...userFixture.data,
      level: 3,
      subscription: {
        ...userFixture.data.subscription,
        max_level_granted: 3,
      },
    },
  };
}

function subjects(): SubjectResource[] {
  return [
    subject(radicalFixture, 101, 1),
    subject(kanjiFixture, 102, 1, '2026-07-01T00:00:00.000Z'),
    subject(kanjiFixture, 103, 1),
    subject(vocabularyFixture, 104, 1),
    subject(kanaVocabularyFixture, 105, 2),
    subject(kanjiFixture, 106, 4),
    subject(vocabularyFixture, 107, 2),
    subject(kanjiFixture, 108, 3),
    subject(vocabularyFixture, 109, 3),
  ];
}

function subject(
  fixture: SubjectResource,
  id: number,
  level: number,
  hiddenAt: string | null = null,
): SubjectResource {
  const data = { ...fixture.data, level, hidden_at: hiddenAt };
  return {
    ...fixture,
    id,
    url: `https://api.wanikani.com/v2/subjects/${id}`,
    data:
      'pronunciation_audios' in data
        ? {
            ...data,
            pronunciation_audios: data.pronunciation_audios.map((audio) => ({
              ...audio,
              url: `${audio.url}-${id}`,
            })),
          }
        : data,
  } as SubjectResource;
}

function assignments(): IdentifiedResource<AssignmentData, 'assignment'>[] {
  return [
    assignment(101, 0, null, null),
    assignment(102, 0, null, null),
    assignment(103, 0, '2026-07-01T00:00:00.000Z', null),
    assignment(104, 0, null, null, null),
    assignment(105, 0, null, null),
    assignment(106, 0, null, null),
    assignment(107, 0, null, null),
    assignment(108, 2, '2026-07-01T00:00:00.000Z', '2026-07-29T11:00:00.000Z'),
    assignment(109, 3, '2026-07-01T00:00:00.000Z', '2026-07-29T14:00:00.000Z'),
  ];
}

function assignment(
  subjectId: number,
  srsStage: number,
  startedAt: string | null,
  availableAt: string | null,
  unlockedAt: string | null = '2026-07-01T00:00:00.000Z',
): IdentifiedResource<AssignmentData, 'assignment'> {
  return {
    ...assignmentFixture,
    id: 1_000 + subjectId,
    data: {
      ...assignmentFixture.data,
      subject_id: subjectId,
      subject_type:
        subjectId === 101
          ? 'radical'
          : subjectId === 105
            ? 'kana_vocabulary'
            : subjectId === 104 || subjectId === 107 || subjectId === 109
              ? 'vocabulary'
              : 'kanji',
      srs_stage: srsStage,
      unlocked_at: unlockedAt,
      started_at: startedAt,
      available_at: availableAt,
      passed_at: subjectId === 108 ? '2026-07-20T00:00:00.000Z' : null,
    },
  };
}

function excludedMaterial(): IdentifiedResource<
  StudyMaterialData,
  'study_material'
> {
  return {
    ...studyMaterialFixture,
    data: {
      ...studyMaterialFixture.data,
      subject_id: 107,
      subject_type: 'vocabulary',
      meaning_note: '#tsurukameExclude',
    },
  };
}
