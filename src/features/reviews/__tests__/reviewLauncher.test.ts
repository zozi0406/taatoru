import { migrateDatabase } from '@/db/migrate';
import { NodeTestDatabase } from '@/db/NodeTestDatabase';
import { AssignmentRepository } from '@/db/repositories/AssignmentRepository';
import { ResourceRepository } from '@/db/repositories/ResourceRepository';
import { SubjectRepository } from '@/db/repositories/SubjectRepository';
import {
  assignmentFixture,
  kanjiFixture,
  userFixture,
} from '@/fixtures/api';
import { ReviewSessionRepository } from '../ReviewSessionRepository';
import { startReviewSession } from '../reviewLauncher';

const NOW = new Date('2026-07-29T14:00:00.000Z');

test('starts and persists a session from currently available reviews', async () => {
  const db = await NodeTestDatabase.open();
  await migrateDatabase(db);
  try {
    await new ResourceRepository(db).replaceUser(userFixture);
    await new SubjectRepository(db).replaceSubjects([kanjiFixture], null);
    await new AssignmentRepository(db).replaceAssignments(
      [assignmentFixture],
      null,
    );

    await expect(startReviewSession(db, NOW)).resolves.toMatchObject({
      items: [
        {
          assignmentId: assignmentFixture.id,
          subjectId: kanjiFixture.id,
        },
      ],
      phase: 'active',
    });
    await expect(
      new ReviewSessionRepository(db).loadReviewSession(),
    ).resolves.toMatchObject({ phase: 'active' });
  } finally {
    await db.close();
  }
});

test('does not create an empty review session', async () => {
  const db = await NodeTestDatabase.open();
  await migrateDatabase(db);
  try {
    await expect(startReviewSession(db, NOW)).resolves.toBeNull();
    await expect(
      new ReviewSessionRepository(db).loadReviewSession(),
    ).resolves.toBeNull();
  } finally {
    await db.close();
  }
});
