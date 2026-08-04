import type {
  Database,
  DatabaseTransaction,
  RunResult,
  SqlValue,
} from '@/db/Database';
import { migrateDatabase } from '@/db/migrate';
import { NodeTestDatabase } from '@/db/NodeTestDatabase';
import { AssignmentRepository } from '@/db/repositories/AssignmentRepository';
import { SubjectRepository } from '@/db/repositories/SubjectRepository';
import { assignmentFixture, kanjiFixture } from '@/fixtures/api';
import {
  ReviewSessionRepository,
  type ReviewSessionSnapshot,
} from '../ReviewSessionRepository';

const NOW = new Date('2026-07-29T12:00:00.000Z');

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
  await new SubjectRepository(db).replaceSubjects([kanjiFixture], null);
  await new AssignmentRepository(db).replaceAssignments(
    [assignmentFixture],
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
    await db.first<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${table}`,
    )
  )?.count ?? 0;
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
