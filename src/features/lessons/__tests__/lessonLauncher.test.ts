import { migrateDatabase } from '@/db/migrate';
import { NodeTestDatabase } from '@/db/NodeTestDatabase';
import { AssignmentRepository } from '@/db/repositories/AssignmentRepository';
import { ResourceRepository } from '@/db/repositories/ResourceRepository';
import { SubjectRepository } from '@/db/repositories/SubjectRepository';
import {
  assignmentFixture,
  kanjiFixture,
  radicalFixture,
  userFixture,
} from '@/fixtures/api';
import { startAutomaticLessons } from '../lessonLauncher';
import { SessionRepository } from '@/features/sessions/SessionRepository';

test('starts the configured automatic queue without creating a picker draft', async () => {
  const db = await NodeTestDatabase.open();
  await migrateDatabase(db);
  try {
    await new ResourceRepository(db).replaceUser(userFixture);
    await new SubjectRepository(db).replaceSubjects(
      [kanjiFixture, radicalFixture],
      null,
    );
    await new AssignmentRepository(db).replaceAssignments(
      [
        lessonAssignment(601, kanjiFixture.id, 'kanji'),
        lessonAssignment(602, radicalFixture.id, 'radical'),
      ],
      null,
    );

    const session = await startAutomaticLessons(
      db,
      new Date('2026-07-29T12:00:00.000Z'),
    );
    expect(session).toMatchObject({
      phase: 'presentation',
      items: [
        { assignmentId: 602, subjectId: radicalFixture.id },
        { assignmentId: 601, subjectId: kanjiFixture.id },
      ],
    });
  } finally {
    await db.close();
  }
});

test('ordinary Start lessons resumes an active chosen batch without replacing it', async () => {
  const db = await NodeTestDatabase.open();
  await migrateDatabase(db);
  try {
    const repository = new SessionRepository(db);
    const chosen = await repository.startLessonSession([
      {
        assignmentId: 602,
        available: true,
        excluded: false,
        lessonPosition: 1,
        level: 1,
        subjectId: radicalFixture.id,
        subjectType: 'radical',
      },
    ]);
    expect(await startAutomaticLessons(db)).toEqual(chosen);
    expect(await repository.loadLessonSession()).toEqual(chosen);
  } finally {
    await db.close();
  }
});

function lessonAssignment(
  id: number,
  subjectId: number,
  subjectType: 'kanji' | 'radical',
) {
  return {
    ...assignmentFixture,
    id,
    data: {
      ...assignmentFixture.data,
      available_at: null,
      id,
      srs_stage: 0,
      started_at: null,
      subject_id: subjectId,
      subject_type: subjectType,
    },
  };
}
