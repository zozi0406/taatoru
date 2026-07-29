import {
  assignmentFixture,
  kanjiFixture,
  userFixture,
  vocabularyFixture,
} from '@/fixtures/api';
import { migrateDatabase } from '../../migrate';
import { NodeTestDatabase } from '../../NodeTestDatabase';
import { AssignmentRepository } from '../AssignmentRepository';
import { ResourceRepository } from '../ResourceRepository';
import { SubjectRepository } from '../SubjectRepository';

test('normalizes subjects for search and advances the subject cursor', async () => {
  const db = await NodeTestDatabase.open();
  try {
    await migrateDatabase(db);
    const subjects = new SubjectRepository(db);

    await subjects.replaceSubjects(
      [kanjiFixture, vocabularyFixture],
      '2026-07-29T13:00:00.000000Z',
    );

    expect(
      await db.first('SELECT level, object FROM subjects WHERE id = ?', [
        kanjiFixture.id,
      ]),
    ).toEqual({ level: 1, object: 'kanji' });
    expect(
      await db.first(
        'SELECT readings, meanings FROM subjects_fts WHERE subject_id = ?',
        [kanjiFixture.id],
      ),
    ).toEqual({ readings: 'いち', meanings: 'One One Thing' });
    expect(
      await db.first('SELECT subjects_updated_at FROM sync_state WHERE id = 1'),
    ).toEqual({
      subjects_updated_at: '2026-07-29T13:00:00.000000Z',
    });
  } finally {
    await db.close();
  }
});

test('assignment replacement preserves the local mistake timestamp', async () => {
  const db = await NodeTestDatabase.open();
  try {
    await migrateDatabase(db);
    await new ResourceRepository(db).replaceUser(userFixture);
    await new SubjectRepository(db).replaceSubjects([kanjiFixture], null);
    const assignments = new AssignmentRepository(db);
    await assignments.replaceAssignments([assignmentFixture], null);
    await db.run(
      'UPDATE subject_progress SET last_mistake_at = ? WHERE subject_id = ?',
      ['2026-07-29T12:00:00.000Z', kanjiFixture.id],
    );

    await assignments.replaceAssignments(
      [
        {
          ...assignmentFixture,
          data: { ...assignmentFixture.data, srs_stage: 4 },
        },
      ],
      '2026-07-29T13:00:00.000000Z',
    );

    expect(
      await db.first(
        `SELECT srs_stage, last_mistake_at
         FROM subject_progress WHERE subject_id = ?`,
        [kanjiFixture.id],
      ),
    ).toEqual({
      srs_stage: 4,
      last_mistake_at: '2026-07-29T12:00:00.000Z',
    });
  } finally {
    await db.close();
  }
});
