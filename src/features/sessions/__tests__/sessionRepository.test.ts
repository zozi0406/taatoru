import { migrateDatabase } from '@/db/migrate';
import { NodeTestDatabase } from '@/db/NodeTestDatabase';
import type { LessonCandidate } from '@/features/lessons/types';
import { SessionRepository } from '../SessionRepository';

const NOW = new Date('2026-07-29T12:00:00.000Z');

test('persists and restores only stable lesson session state', async () => {
  const db = await NodeTestDatabase.open();
  await migrateDatabase(db);
  try {
    const repository = new SessionRepository(db);
    await repository.startLessonSession(
      [candidate(2), candidate(1)],
      NOW,
    );

    await expect(repository.loadLessonSession()).resolves.toEqual({
      id: 'lesson',
      kind: 'lesson',
      phase: 'presentation',
      items: [
        { assignmentId: 1_002, subjectId: 2 },
        { assignmentId: 1_001, subjectId: 1 },
      ],
      queuePosition: 0,
      quizState: {
        completedSubjectIds: [],
        currentPrompt: null,
        currentSubjectId: null,
        incorrectMeaningBySubject: {},
        incorrectReadingBySubject: {},
      },
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    const row = await db.first<{ stateJson: string }>(
      `SELECT state_json AS stateJson
       FROM active_sessions WHERE id = 'lesson'`,
    );
    expect(row?.stateJson).not.toContain('resource_json');
    expect(row?.stateJson).not.toContain('characters');
  } finally {
    await db.close();
  }
});

test('saves picker IDs for process restoration and clears them on cancel', async () => {
  const db = await NodeTestDatabase.open();
  await migrateDatabase(db);
  try {
    const repository = new SessionRepository(db);
    await repository.saveLessonSelection(
      [candidate(3), candidate(1)],
      NOW,
    );
    await expect(repository.loadLessonSelectionIds()).resolves.toEqual([3, 1]);

    await repository.clearLessonSession();
    await expect(repository.loadLessonSession()).resolves.toBeNull();
  } finally {
    await db.close();
  }
});

test('reloads subjects by ID after process recreation in queue order', async () => {
  const db = await NodeTestDatabase.open();
  await migrateDatabase(db);
  try {
    await seedSubject(db, 1, 'One');
    await seedSubject(db, 2, 'Two');
    const repository = new SessionRepository(db);
    const snapshot = await repository.startLessonSession(
      [candidate(2), candidate(99), candidate(1)],
      NOW,
    );

    await expect(
      repository.loadLessonSubjects(snapshot),
    ).resolves.toEqual([
      expect.objectContaining({ id: 2 }),
      expect.objectContaining({ id: 1 }),
    ]);
  } finally {
    await db.close();
  }
});

function candidate(subjectId: number): LessonCandidate {
  return {
    assignmentId: subjectId + 1_000,
    available: true,
    excluded: false,
    lessonPosition: subjectId,
    level: 1,
    subjectId,
    subjectType: 'kanji',
  };
}

async function seedSubject(
  db: NodeTestDatabase,
  id: number,
  meaning: string,
): Promise<void> {
  await db.run(
    `INSERT INTO subjects (
      id, object, level, lesson_position, slug, characters, meanings_text,
      readings_text, data_updated_at, resource_json
    ) VALUES (?, 'kanji', 1, ?, ?, ?, ?, '', ?, ?)`,
    [
      id,
      id,
      meaning.toLowerCase(),
      String(id),
      meaning,
      NOW.toISOString(),
      JSON.stringify({
        id,
        object: 'kanji',
        url: `https://api.wanikani.com/v2/subjects/${id}`,
        data_updated_at: NOW.toISOString(),
        data: {
          meanings: [{ meaning, primary: true, accepted_answer: true }],
        },
      }),
    ],
  );
}
