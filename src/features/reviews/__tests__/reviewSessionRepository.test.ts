import type { Resource, UserData } from '@/api/types';
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
import { SubjectRepository } from '@/db/repositories/SubjectRepository';
import { assignmentFixture, kanjiFixture, userFixture } from '@/fixtures/api';
import {
  ReviewSessionRepository,
  type ReviewSessionSnapshot,
} from '../ReviewSessionRepository';

const NOW = new Date('2026-07-29T12:00:00.000Z');

test('resuming replaces stale assignment IDs and resets only their attempts', async () => {
  const db = await reviewDatabase();
  try {
    const repository = new ReviewSessionRepository(db);
    const started = await repository.startReviewSession(
      [{ assignmentId: assignmentFixture.id - 1, subjectId: kanjiFixture.id }],
      NOW,
    );
    const resumed = await repository.revalidateReviewSession(
      {
        ...started,
        currentPrompt: 'reading',
        incorrectMeaningBySubject: { [kanjiFixture.id]: 2 },
      },
      new Date('2026-07-30T12:00:00.000Z'),
    );
    expect(resumed.items).toEqual([
      { assignmentId: assignmentFixture.id, subjectId: kanjiFixture.id },
    ]);
    expect(resumed.currentPrompt).toBe('meaning');
    expect(resumed.incorrectMeaningBySubject).toEqual({});
    expect(await repository.loadReviewSession()).toEqual(resumed);
  } finally {
    await db.close();
  }
});

test('resuming drops subjects that are no longer due without completing them', async () => {
  const db = await reviewDatabase();
  try {
    const repository = new ReviewSessionRepository(db);
    const started = await repository.startReviewSession(
      [{ assignmentId: assignmentFixture.id, subjectId: kanjiFixture.id }],
      NOW,
    );
    await db.run('UPDATE assignments SET available_at = ?', [
      '2026-07-30T12:00:00.000Z',
    ]);
    const resumed = await repository.revalidateReviewSession(started, NOW);
    expect(resumed.phase).toBe('complete');
    expect(resumed.currentPrompt).toBeNull();
    expect(await rowCount(db, 'pending_progress')).toBe(0);
    expect(await rowCount(db, 'assignments')).toBe(1);
  } finally {
    await db.close();
  }
});

test('resuming a mixed queue asks the successor half that is still unanswered', async () => {
  const db = await reviewDatabase();
  try {
    const repository = new ReviewSessionRepository(db);
    const started = await repository.startReviewSession(
      [
        { assignmentId: 999, subjectId: 999 },
        { assignmentId: assignmentFixture.id, subjectId: kanjiFixture.id },
      ],
      NOW,
    );
    const resumed = await repository.revalidateReviewSession(
      {
        ...started,
        questionProgress: { answeredReadingSubjectIds: [kanjiFixture.id] },
      },
      NOW,
      'reading-first',
    );
    expect(resumed.items).toEqual([
      { assignmentId: assignmentFixture.id, subjectId: kanjiFixture.id },
    ]);
    expect(resumed.currentPrompt).toBe('meaning');
  } finally {
    await db.close();
  }
});

test('rejects a superseded assignment without writing completion or advancing', async () => {
  const db = await reviewDatabase();
  try {
    const repository = new ReviewSessionRepository(db);
    const started = await repository.startReviewSession(
      [{ assignmentId: assignmentFixture.id - 1, subjectId: kanjiFixture.id }],
      NOW,
    );
    await expect(
      repository.commitReviewTransition(
        {
          ...started.items[0]!,
          incorrectMeaningAnswers: 0,
          incorrectReadingAnswers: 0,
        },
        completedSnapshot(started),
        new Date('2026-07-30T12:00:00.000Z'),
      ),
    ).rejects.toThrow('Review availability changed');
    expect(await repository.loadReviewSession()).toEqual(started);
    expect(await rowCount(db, 'pending_progress')).toBe(0);
  } finally {
    await db.close();
  }
});

test('persists and restores stable review state and subjects by ID', async () => {
  const db = await reviewDatabase();
  try {
    const repository = new ReviewSessionRepository(db);
    const started = await repository.startReviewSession(
      [
        {
          assignmentId: assignmentFixture.id,
          subjectId: kanjiFixture.id,
        },
      ],
      NOW,
    );

    await expect(repository.loadReviewSession()).resolves.toEqual(started);
    await expect(repository.loadReviewSubjects(started)).resolves.toEqual([
      kanjiFixture,
    ]);
    const row = await db.first<{ stateJson: string }>(
      `SELECT state_json AS stateJson
       FROM active_sessions WHERE id = 'review'`,
    );
    expect(row?.stateJson).not.toContain('resource_json');
    expect(row?.stateJson).not.toContain('characters');
  } finally {
    await db.close();
  }
});

test('limits resumed review subjects to max_level_granted', async () => {
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
    const repository = new ReviewSessionRepository(db);
    const snapshot = await repository.startReviewSession(
      [
        { assignmentId: 1_201, subjectId: kanjiFixture.id },
        { assignmentId: 1_402, subjectId: highSubject.id },
      ],
      NOW,
    );

    await expect(repository.loadReviewSubjects(snapshot)).resolves.toEqual([
      kanjiFixture,
    ]);

    await users.replaceUser(userWithMaxLevel(60));
    await expect(repository.loadReviewSubjects(snapshot)).resolves.toEqual([
      kanjiFixture,
      highSubject,
    ]);
  } finally {
    await db.close();
  }
});

test('commits a completed review and next snapshot in one transaction', async () => {
  const db = await reviewDatabase();
  try {
    const repository = new ReviewSessionRepository(db);
    const started = await repository.startReviewSession(
      [
        {
          assignmentId: assignmentFixture.id,
          subjectId: kanjiFixture.id,
        },
      ],
      NOW,
    );
    const next = completedSnapshot(started);

    await repository.commitReviewTransition(
      {
        assignmentId: assignmentFixture.id,
        subjectId: kanjiFixture.id,
        incorrectMeaningAnswers: 1,
        incorrectReadingAnswers: 0,
      },
      next,
      NOW,
    );

    await expect(rowCount(db, 'assignments')).resolves.toBe(0);
    await expect(rowCount(db, 'pending_progress')).resolves.toBe(1);
    await expect(repository.loadReviewSession()).resolves.toEqual(next);
  } finally {
    await db.close();
  }
});

test('rolls back review completion when its next snapshot cannot be saved', async () => {
  const db = await reviewDatabase();
  try {
    const repository = new ReviewSessionRepository(db);
    const started = await repository.startReviewSession(
      [
        {
          assignmentId: assignmentFixture.id,
          subjectId: kanjiFixture.id,
        },
      ],
      NOW,
    );
    const failing = new ReviewSessionRepository(
      new FailSessionSaveDatabase(db),
    );

    await expect(
      failing.commitReviewTransition(
        {
          assignmentId: assignmentFixture.id,
          subjectId: kanjiFixture.id,
          incorrectMeaningAnswers: 1,
          incorrectReadingAnswers: 0,
        },
        completedSnapshot(started),
        NOW,
      ),
    ).rejects.toThrow('injected session save failure');

    await expect(rowCount(db, 'assignments')).resolves.toBe(1);
    await expect(rowCount(db, 'pending_progress')).resolves.toBe(0);
    await expect(repository.loadReviewSession()).resolves.toEqual(started);
  } finally {
    await db.close();
  }
});

async function reviewDatabase(): Promise<NodeTestDatabase> {
  const db = await NodeTestDatabase.open();
  await migrateDatabase(db);
  await new ResourceRepository(db).replaceUser(userFixture);
  await new SubjectRepository(db).replaceSubjects([kanjiFixture], null);
  await new AssignmentRepository(db).replaceAssignments(
    [
      {
        ...assignmentFixture,
        data: {
          ...assignmentFixture.data,
          available_at: '2026-07-29T11:00:00.000Z',
        },
      },
    ],
    null,
  );
  return db;
}

function completedSnapshot(
  snapshot: ReviewSessionSnapshot,
): ReviewSessionSnapshot {
  return {
    ...snapshot,
    phase: 'complete',
    queuePosition: 1,
    currentPrompt: null,
  };
}

async function rowCount(db: Database, table: string): Promise<number> {
  return (
    (
      await db.first<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ${table}`,
      )
    )?.count ?? 0
  );
}

class FailSessionSaveDatabase implements Database {
  constructor(private readonly delegate: Database) {}

  run(sql: string, params?: readonly SqlValue[]): Promise<RunResult> {
    return sessionSaveFails(sql)
      ? Promise.reject(new Error('injected session save failure'))
      : this.delegate.run(sql, params);
  }

  first<T>(sql: string, params?: readonly SqlValue[]): Promise<T | null> {
    return this.delegate.first<T>(sql, params);
  }

  all<T>(sql: string, params?: readonly SqlValue[]): Promise<readonly T[]> {
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

  run(sql: string, params?: readonly SqlValue[]): Promise<RunResult> {
    return sessionSaveFails(sql)
      ? Promise.reject(new Error('injected session save failure'))
      : this.delegate.run(sql, params);
  }

  first<T>(sql: string, params?: readonly SqlValue[]): Promise<T | null> {
    return this.delegate.first<T>(sql, params);
  }

  all<T>(sql: string, params?: readonly SqlValue[]): Promise<readonly T[]> {
    return this.delegate.all<T>(sql, params);
  }
}

function sessionSaveFails(sql: string): boolean {
  return sql.includes('UPDATE active_sessions');
}

function userWithMaxLevel(maxLevelGranted: number): Resource<UserData, 'user'> {
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
