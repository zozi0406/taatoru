import type { WaniKaniApi } from '@/api/WaniKaniApi';
import {
  ApiDecodeError,
  ApiError,
  NetworkError,
} from '@/api/errors';
import {
  assignmentFixture,
  kanjiFixture,
  studyMaterialFixture,
  userFixture,
} from '@/fixtures/api';
import { migrateDatabase } from '@/db/migrate';
import { NodeTestDatabase } from '@/db/NodeTestDatabase';
import { AssignmentRepository } from '@/db/repositories/AssignmentRepository';
import { ResourceRepository } from '@/db/repositories/ResourceRepository';
import { StudyMaterialRepository } from '@/db/repositories/StudyMaterialRepository';
import { SubjectRepository } from '@/db/repositories/SubjectRepository';
import { PendingWriteRepository } from '../PendingWriteRepository';
import { PendingWriteSender } from '../PendingWriteSender';

const FIXED_NOW = new Date('2026-07-29T12:00:00.000Z');

test('queues a review and updates local state in one transaction', async () => {
  const db = await reviewDatabase();
  try {
    const repository = new PendingWriteRepository(db);

    await repository.completeReview({
      assignmentId: assignmentFixture.id,
      subjectId: kanjiFixture.id,
      incorrectMeaningAnswers: 1,
      incorrectReadingAnswers: 0,
      completedAt: FIXED_NOW,
    });

    expect(
      await db.first(
        `SELECT operation_kind AS kind, assignment_id AS assignmentId,
                incorrect_meaning_answers AS incorrectMeaningAnswers,
                incorrect_reading_answers AS incorrectReadingAnswers
         FROM pending_progress WHERE subject_id = ?`,
        [kanjiFixture.id],
      ),
    ).toEqual({
      kind: 'review',
      assignmentId: assignmentFixture.id,
      incorrectMeaningAnswers: 1,
      incorrectReadingAnswers: 0,
    });
    expect(
      await db.first('SELECT id FROM assignments WHERE id = ?', [
        assignmentFixture.id,
      ]),
    ).toBeNull();
    expect(
      await db.first(
        `SELECT srs_stage AS srsStage, last_mistake_at AS lastMistakeAt
         FROM subject_progress WHERE subject_id = ?`,
        [kanjiFixture.id],
      ),
    ).toEqual({
      srsStage: 1,
      lastMistakeAt: FIXED_NOW.toISOString(),
    });
    expect(
      await db.first(
        `SELECT mistaken_at AS mistakenAt
         FROM recent_mistakes WHERE subject_id = ?`,
        [kanjiFixture.id],
      ),
    ).toEqual({ mistakenAt: FIXED_NOW.toISOString() });
  } finally {
    await db.close();
  }
});

test('queues lesson progress and advances the local projection', async () => {
  const db = await reviewDatabase(0);
  try {
    const repository = new PendingWriteRepository(db);
    const completion = {
      assignmentId: assignmentFixture.id,
      subjectId: kanjiFixture.id,
      completedAt: FIXED_NOW,
    };
    await repository.completeLesson(completion);
    await repository.completeLesson(completion);

    expect(
      await db.first(
        `SELECT operation_kind AS kind
         FROM pending_progress WHERE subject_id = ?`,
        [kanjiFixture.id],
      ),
    ).toEqual({ kind: 'lesson_start' });
    await expect(pendingProgressCount(db)).resolves.toBe(1);
    expect(
      await db.first(
        `SELECT srs_stage AS srsStage, last_mistake_at AS lastMistakeAt
         FROM subject_progress WHERE subject_id = ?`,
        [kanjiFixture.id],
      ),
    ).toEqual({ srsStage: 1, lastMistakeAt: null });
  } finally {
    await db.close();
  }
});

test('queues a study-material edit with its local cache update', async () => {
  const db = await reviewDatabase();
  try {
    await new StudyMaterialRepository(db).replaceStudyMaterials(
      [studyMaterialFixture],
      null,
    );

    await new PendingWriteRepository(db).queueStudyMaterial({
      subjectId: kanjiFixture.id,
      meaningNote: 'Remember this.',
      readingNote: null,
      meaningSynonyms: ['Single', 'One'],
      queuedAt: FIXED_NOW,
    });

    expect(
      await db.first(
        `SELECT study_material_id AS studyMaterialId,
                meaning_note AS meaningNote,
                reading_note AS readingNote,
                meaning_synonyms_json AS meaningSynonymsJson
         FROM pending_study_materials WHERE subject_id = ?`,
        [kanjiFixture.id],
      ),
    ).toEqual({
      studyMaterialId: studyMaterialFixture.id,
      meaningNote: 'Remember this.',
      readingNote: null,
      meaningSynonymsJson: '["Single","One"]',
    });
    expect(
      await db.first(
        `SELECT meaning_note AS meaningNote,
                meaning_synonyms_json AS meaningSynonymsJson
         FROM study_materials WHERE subject_id = ?`,
        [kanjiFixture.id],
      ),
    ).toEqual({
      meaningNote: 'Remember this.',
      meaningSynonymsJson: '["Single","One"]',
    });
  } finally {
    await db.close();
  }
});

test('replacing a new local study-material edit still creates it remotely', async () => {
  const db = await reviewDatabase();
  const repository = new PendingWriteRepository(db);
  const api = writeApi();
  try {
    await repository.queueStudyMaterial({
      subjectId: kanjiFixture.id,
      meaningNote: 'First draft.',
      readingNote: null,
      meaningSynonyms: [],
      queuedAt: new Date('2026-07-29T11:00:00.000Z'),
    });
    await repository.queueStudyMaterial({
      subjectId: kanjiFixture.id,
      meaningNote: 'Final draft.',
      readingNote: null,
      meaningSynonyms: ['One'],
      queuedAt: FIXED_NOW,
    });

    await new PendingWriteSender(db, api).sendSelectedPendingWrites(
      { progressIds: [], studyMaterialIds: [kanjiFixture.id] },
      FIXED_NOW,
    );

    expect(api.upsertStudyMaterial).toHaveBeenCalledWith({
      subjectId: kanjiFixture.id,
      meaningNote: 'Final draft.',
      readingNote: null,
      meaningSynonyms: ['One'],
    });
  } finally {
    await db.close();
  }
});

test('successful progress delivery removes the pending row', async () => {
  const db = await pendingDatabase([
    pendingReview(201, 501, '2026-07-29T11:50:00.000Z'),
  ]);
  const api = writeApi();
  try {
    await new PendingWriteSender(db, api).sendSelectedPendingWrites(
      { progressIds: [201], studyMaterialIds: [] },
      FIXED_NOW,
    );

    expect(api.createReview).toHaveBeenCalledTimes(1);
    expect(await pendingProgressCount(db)).toBe(0);
  } finally {
    await db.close();
  }
});

test('HTTP 422 drops stale progress and continues with the next item', async () => {
  const db = await pendingDatabase([
    pendingReview(201, 501, '2026-07-29T11:40:00.000Z'),
    pendingReview(202, 502, '2026-07-29T11:50:00.000Z'),
  ]);
  const api = writeApi();
  api.createReview
    .mockRejectedValueOnce(new ApiError('invalid assignment', { status: 422 }))
    .mockResolvedValueOnce(undefined);
  try {
    await new PendingWriteSender(db, api).sendSelectedPendingWrites(
      { progressIds: [201, 202], studyMaterialIds: [] },
      FIXED_NOW,
    );

    expect(api.createReview).toHaveBeenCalledTimes(2);
    expect(await pendingProgressCount(db)).toBe(0);
  } finally {
    await db.close();
  }
});

test.each([
  ['HTTP 401', new ApiError('unauthorized', { status: 401 })],
  ['HTTP 403', new ApiError('forbidden', { status: 403 })],
  ['HTTP 429', new ApiError('rate limited', { status: 429 })],
  ['decode', new ApiDecodeError('invalid response')],
  ['timeout', new NetworkError('timed out')],
  ['server', new ApiError('server error', { status: 500 })],
])('%s failure preserves progress for retry', async (_label, error) => {
  const db = await pendingDatabase([
    pendingReview(201, 501, '2026-07-29T11:50:00.000Z'),
  ]);
  const api = writeApi();
  api.createReview.mockRejectedValueOnce(error);
  try {
    await expect(
      new PendingWriteSender(db, api).sendSelectedPendingWrites(
        { progressIds: [201], studyMaterialIds: [] },
        FIXED_NOW,
      ),
    ).rejects.toBe(error);

    expect(await pendingProgressCount(db)).toBe(1);
    expect(
      await db.first(
        `SELECT attempt_count AS attemptCount,
                last_error_at AS lastErrorAt
         FROM pending_progress WHERE subject_id = 201`,
      ),
    ).toEqual({
      attemptCount: 1,
      lastErrorAt: FIXED_NOW.toISOString(),
    });
  } finally {
    await db.close();
  }
});

test('progress sends sequentially in creation order', async () => {
  const db = await pendingDatabase([
    pendingReview(203, 503, '2026-07-29T11:50:00.000Z'),
    pendingReview(201, 501, '2026-07-29T11:30:00.000Z'),
    pendingReview(202, 502, '2026-07-29T11:40:00.000Z'),
  ]);
  const events: number[] = [];
  const api = writeApi();
  api.createReview.mockImplementation(async ({ assignmentId }) => {
    events.push(assignmentId ?? -1);
  });
  try {
    await new PendingWriteSender(db, api).sendSelectedPendingWrites(
      { progressIds: [203, 202, 201], studyMaterialIds: [] },
      FIXED_NOW,
    );

    expect(events).toEqual([501, 502, 503]);
  } finally {
    await db.close();
  }
});

test('old reviews include createdAt while recent reviews omit it', async () => {
  const db = await pendingDatabase([
    pendingReview(201, 501, '2026-07-29T11:44:59.999Z'),
    pendingReview(202, 502, '2026-07-29T11:45:00.000Z'),
  ]);
  const api = writeApi();
  try {
    await new PendingWriteSender(db, api).sendSelectedPendingWrites(
      { progressIds: [201, 202], studyMaterialIds: [] },
      FIXED_NOW,
    );

    expect(api.createReview.mock.calls[0]?.[0]).toMatchObject({
      assignmentId: 501,
      createdAt: new Date('2026-07-29T11:44:59.999Z'),
    });
    expect(api.createReview.mock.calls[1]?.[0]).toEqual({
      assignmentId: 502,
      incorrectMeaningAnswers: 1,
      incorrectReadingAnswers: 0,
    });
  } finally {
    await db.close();
  }
});

test('study-material success removes its marker and failure preserves it', async () => {
  const db = await pendingDatabase([]);
  await db.run(
    `INSERT INTO pending_study_materials (
      subject_id, study_material_id, meaning_note, reading_note,
      meaning_synonyms_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [201, 601, 'First', null, '["One"]', '2026-07-29T11:00:00.000Z'],
  );
  await db.run(
    `INSERT INTO pending_study_materials (
      subject_id, study_material_id, meaning_note, reading_note,
      meaning_synonyms_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [202, null, null, 'Second', '[]', '2026-07-29T11:01:00.000Z'],
  );
  const api = writeApi();
  api.upsertStudyMaterial
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new NetworkError('offline'));
  try {
    await expect(
      new PendingWriteSender(db, api).sendSelectedPendingWrites(
        { progressIds: [], studyMaterialIds: [201, 202] },
        FIXED_NOW,
      ),
    ).rejects.toBeInstanceOf(NetworkError);

    expect(api.upsertStudyMaterial).toHaveBeenCalledTimes(2);
    expect(
      await db.all<{ subjectId: number }>(
        `SELECT subject_id AS subjectId
         FROM pending_study_materials ORDER BY subject_id`,
      ),
    ).toEqual([{ subjectId: 202 }]);
  } finally {
    await db.close();
  }
});

async function reviewDatabase(srsStage = 2): Promise<NodeTestDatabase> {
  const db = await NodeTestDatabase.open();
  await migrateDatabase(db);
  await new ResourceRepository(db).replaceUser(userFixture);
  await new SubjectRepository(db).replaceSubjects([kanjiFixture], null);
  await new AssignmentRepository(db).replaceAssignments(
    [
      {
        ...assignmentFixture,
        data: { ...assignmentFixture.data, srs_stage: srsStage },
      },
    ],
    null,
  );
  return db;
}

interface PendingProgressSeed {
  readonly subjectId: number;
  readonly assignmentId: number;
  readonly createdAt: string;
}

function pendingReview(
  subjectId: number,
  assignmentId: number,
  createdAt: string,
): PendingProgressSeed {
  return { subjectId, assignmentId, createdAt };
}

async function pendingDatabase(
  rows: readonly PendingProgressSeed[],
): Promise<NodeTestDatabase> {
  const db = await NodeTestDatabase.open();
  await migrateDatabase(db);
  for (const row of rows) {
    await db.run(
      `INSERT INTO pending_progress (
        subject_id, assignment_id, operation_kind,
        incorrect_meaning_answers, incorrect_reading_answers,
        created_at, payload_json
      ) VALUES (?, ?, 'review', 1, 0, ?, '{}')`,
      [row.subjectId, row.assignmentId, row.createdAt],
    );
  }
  return db;
}

async function pendingProgressCount(db: NodeTestDatabase): Promise<number> {
  return (
    await db.first<{ count: number }>(
      'SELECT COUNT(*) AS count FROM pending_progress',
    )
  )?.count ?? 0;
}

function writeApi() {
  return {
    startAssignment: jest.fn<Promise<void>, [Parameters<WaniKaniApi['startAssignment']>[0]]>(),
    createReview: jest.fn<Promise<void>, [Parameters<WaniKaniApi['createReview']>[0]]>(),
    upsertStudyMaterial: jest.fn<
      Promise<void>,
      [Parameters<WaniKaniApi['upsertStudyMaterial']>[0]]
    >(),
  } as unknown as WaniKaniApi & {
    startAssignment: jest.MockedFunction<WaniKaniApi['startAssignment']>;
    createReview: jest.MockedFunction<WaniKaniApi['createReview']>;
    upsertStudyMaterial: jest.MockedFunction<
      WaniKaniApi['upsertStudyMaterial']
    >;
  };
}
