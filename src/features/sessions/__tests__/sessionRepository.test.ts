import type { Resource, UserData } from '@/api/types';
import { migrateDatabase } from '@/db/migrate';
import { NodeTestDatabase } from '@/db/NodeTestDatabase';
import type {
  Database,
  DatabaseTransaction,
  RunResult,
  SqlValue,
} from '@/db/Database';
import { AssignmentRepository } from '@/db/repositories/AssignmentRepository';
import { ResourceRepository } from '@/db/repositories/ResourceRepository';
import { SubjectRepository } from '@/db/repositories/SubjectRepository';
import type { LessonCandidate } from '@/features/lessons/types';
import {
  assignmentFixture,
  kanjiFixture,
  userFixture,
} from '@/fixtures/api';
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
    await new ResourceRepository(db).replaceUser(userFixture);
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

test('limits resumed lesson subjects to max_level_granted', async () => {
  const db = await NodeTestDatabase.open();
  await migrateDatabase(db);
  try {
    const highSubject = {
      ...kanjiFixture,
      id: 402,
      url: 'https://api.wanikani.com/v2/subjects/402',
      data: { ...kanjiFixture.data, level: 4 },
    };
    const users = new ResourceRepository(db);
    await users.replaceUser(userWithMaxLevel(3));
    await new SubjectRepository(db).replaceSubjects(
      [kanjiFixture, highSubject],
      null,
    );
    const repository = new SessionRepository(db);
    const snapshot = await repository.startLessonSession(
      [candidate(kanjiFixture.id), candidate(highSubject.id)],
      NOW,
    );

    await expect(repository.loadLessonSubjects(snapshot)).resolves.toEqual([
      kanjiFixture,
    ]);

    await users.replaceUser(userWithMaxLevel(60));
    await expect(repository.loadLessonSubjects(snapshot)).resolves.toEqual([
      kanjiFixture,
      highSubject,
    ]);
  } finally {
    await db.close();
  }
});

test('rolls back lesson completion when saving the next session snapshot fails', async () => {
  const db = await NodeTestDatabase.open();
  await migrateDatabase(db);
  try {
    await new SubjectRepository(db).replaceSubjects([kanjiFixture], null);
    await new AssignmentRepository(db).replaceAssignments(
      [assignmentFixture],
      null,
    );
    const repository = new SessionRepository(db);
    const previous = await repository.startLessonSession(
      [candidate(kanjiFixture.id, assignmentFixture.id)],
      NOW,
    );
    const next = {
      ...previous,
      phase: 'complete' as const,
      queuePosition: 1,
      quizState: {
        ...previous.quizState,
        completedSubjectIds: [kanjiFixture.id],
      },
    };
    const failingDb = new FailSessionSaveDatabase(db);

    await expect(
      new SessionRepository(failingDb).commitLessonTransition(
        {
          assignmentId: assignmentFixture.id,
          subjectId: kanjiFixture.id,
        },
        next,
        NOW,
      ),
    ).rejects.toThrow('injected session save failure');

    await expect(
      db.first<{ count: number }>(
        'SELECT COUNT(*) AS count FROM assignments WHERE id = ?',
        [assignmentFixture.id],
      ),
    ).resolves.toEqual({ count: 1 });
    await expect(
      db.first<{ count: number }>(
        'SELECT COUNT(*) AS count FROM pending_progress',
      ),
    ).resolves.toEqual({ count: 0 });
    await expect(repository.loadLessonSession()).resolves.toEqual(previous);
  } finally {
    await db.close();
  }
});

function candidate(
  subjectId: number,
  assignmentId = subjectId + 1_000,
): LessonCandidate {
  return {
    assignmentId,
    available: true,
    excluded: false,
    lessonPosition: subjectId,
    level: 1,
    subjectId,
    subjectType: 'kanji',
  };
}

class FailSessionSaveDatabase implements Database {
  constructor(private readonly delegate: Database) {}

  run(
    sql: string,
    params?: readonly SqlValue[],
  ): Promise<RunResult> {
    return sessionSaveFails(sql)
      ? Promise.reject(new Error('injected session save failure'))
      : this.delegate.run(sql, params);
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
    return this.delegate.transaction((tx) =>
      operation(new FailSessionSaveTransaction(tx)),
    );
  }

  close(): Promise<void> {
    return this.delegate.close();
  }
}

class FailSessionSaveTransaction implements DatabaseTransaction {
  constructor(private readonly delegate: DatabaseTransaction) {}

  run(
    sql: string,
    params?: readonly SqlValue[],
  ): Promise<RunResult> {
    return sessionSaveFails(sql)
      ? Promise.reject(new Error('injected session save failure'))
      : this.delegate.run(sql, params);
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
}

function sessionSaveFails(sql: string): boolean {
  return sql.includes('UPDATE active_sessions');
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

function userWithMaxLevel(
  maxLevelGranted: number,
): Resource<UserData, 'user'> {
  const fullAccess = maxLevelGranted === 60;
  return {
    ...userFixture,
    data: {
      ...userFixture.data,
      subscription: {
        ...userFixture.data.subscription,
        active: fullAccess,
        max_level_granted: maxLevelGranted,
        period_ends_at: fullAccess
          ? userFixture.data.subscription.period_ends_at
          : null,
        type: fullAccess ? 'recurring' : 'free',
      },
    },
  };
}
