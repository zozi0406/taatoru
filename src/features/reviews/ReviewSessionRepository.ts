import type { SubjectResource } from '@/api/types';
import type { Database, DatabaseTransaction } from '@/db/Database';
import { SUBJECT_WITHIN_GRANTED_LEVEL } from '@/db/subscription';
import { PendingWriteRepository } from '@/features/sync/PendingWriteRepository';
import type { ReviewPrompt } from './types';

export type ReviewSessionPhase = 'active' | 'complete';

export interface ReviewSessionItem {
  readonly assignmentId: number;
  readonly subjectId: number;
}

export interface CompletedReviewItem extends ReviewSessionItem {
  readonly incorrectMeaningAnswers: number;
  readonly incorrectReadingAnswers: number;
}

export interface ReviewSessionSnapshot {
  readonly createdAt: string;
  readonly currentPrompt: ReviewPrompt | null;
  readonly id: 'review';
  readonly incorrectMeaningBySubject: Readonly<Record<string, number>>;
  readonly incorrectReadingBySubject: Readonly<Record<string, number>>;
  readonly items: readonly ReviewSessionItem[];
  readonly kind: 'review';
  readonly phase: ReviewSessionPhase;
  readonly queuePosition: number;
  readonly updatedAt: string;
}

interface SessionRow {
  readonly createdAt: string;
  readonly stateJson: string;
  readonly updatedAt: string;
}

interface StoredReviewState {
  readonly currentPrompt: ReviewPrompt | null;
  readonly incorrectMeaningBySubject: Readonly<Record<string, number>>;
  readonly incorrectReadingBySubject: Readonly<Record<string, number>>;
  readonly items: readonly ReviewSessionItem[];
  readonly phase: ReviewSessionPhase;
  readonly queuePosition: number;
}

interface SubjectRow {
  readonly id: number;
  readonly resourceJson: string;
}

export class ReviewSessionRepository {
  constructor(private readonly db: Database) {}

  async startReviewSession(
    items: readonly ReviewSessionItem[],
    now = new Date(),
  ): Promise<ReviewSessionSnapshot> {
    if (items.length === 0) {
      throw new Error('A review session requires at least one subject');
    }
    const timestamp = now.toISOString();
    const snapshot: ReviewSessionSnapshot = {
      id: 'review',
      kind: 'review',
      phase: 'active',
      items: items.map(({ assignmentId, subjectId }) => ({
        assignmentId,
        subjectId,
      })),
      queuePosition: 0,
      currentPrompt: 'meaning',
      incorrectMeaningBySubject: {},
      incorrectReadingBySubject: {},
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.db.run(
      `INSERT INTO active_sessions (
        id, kind, state_json, created_at, updated_at
      ) VALUES ('review', 'review', ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        kind = excluded.kind,
        state_json = excluded.state_json,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at`,
      [JSON.stringify(toStoredState(snapshot)), timestamp, timestamp],
    );
    return snapshot;
  }

  async loadReviewSession(): Promise<ReviewSessionSnapshot | null> {
    const row = await this.db.first<SessionRow>(
      `SELECT state_json AS stateJson,
              created_at AS createdAt,
              updated_at AS updatedAt
       FROM active_sessions
       WHERE id = 'review' AND kind = 'review'`,
    );
    if (row === null) {
      return null;
    }
    return {
      id: 'review',
      kind: 'review',
      ...parseStoredState(row.stateJson),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  saveReviewSession(
    snapshot: ReviewSessionSnapshot,
    now = new Date(),
  ): Promise<ReviewSessionSnapshot> {
    return this.saveReviewSnapshotWith(this.db, snapshot, now);
  }

  async loadReviewSubjects(
    snapshot: ReviewSessionSnapshot,
  ): Promise<readonly SubjectResource[]> {
    const ids = [...new Set(snapshot.items.map(({ subjectId }) => subjectId))];
    const rows = await this.db.all<SubjectRow>(
      `SELECT id, resource_json AS resourceJson
       FROM subjects s
       WHERE s.hidden_at IS NULL
         AND ${SUBJECT_WITHIN_GRANTED_LEVEL}
         AND s.id IN (${ids.map(() => '?').join(', ')})`,
      ids,
    );
    const byId = new Map(
      rows.map(({ id, resourceJson }) => [
        id,
        JSON.parse(resourceJson) as SubjectResource,
      ]),
    );
    return snapshot.items.flatMap(({ subjectId }) => {
      const subject = byId.get(subjectId);
      return subject === undefined ? [] : [subject];
    });
  }

  commitReviewTransition(
    completedItem: CompletedReviewItem | null,
    snapshot: ReviewSessionSnapshot,
    now = new Date(),
  ): Promise<ReviewSessionSnapshot> {
    return this.db.transaction(async (tx) => {
      if (completedItem !== null) {
        await new PendingWriteRepository(
          this.db,
        ).completeReviewInTransaction(tx, {
          ...completedItem,
          completedAt: now,
        });
      }
      return this.saveReviewSnapshotWith(tx, snapshot, now);
    });
  }

  clearReviewSession(): Promise<void> {
    return this.db
      .run(
        `DELETE FROM active_sessions
         WHERE id = 'review' AND kind = 'review'`,
      )
      .then(() => undefined);
  }

  private async saveReviewSnapshotWith(
    tx: DatabaseTransaction,
    snapshot: ReviewSessionSnapshot,
    now: Date,
  ): Promise<ReviewSessionSnapshot> {
    const updated = { ...snapshot, updatedAt: now.toISOString() };
    await tx.run(
      `UPDATE active_sessions
       SET state_json = ?, updated_at = ?
       WHERE id = 'review' AND kind = 'review'`,
      [JSON.stringify(toStoredState(updated)), updated.updatedAt],
    );
    return updated;
  }
}

function toStoredState(
  snapshot: ReviewSessionSnapshot,
): StoredReviewState {
  return {
    phase: snapshot.phase,
    items: snapshot.items,
    queuePosition: snapshot.queuePosition,
    currentPrompt: snapshot.currentPrompt,
    incorrectMeaningBySubject: snapshot.incorrectMeaningBySubject,
    incorrectReadingBySubject: snapshot.incorrectReadingBySubject,
  };
}

function parseStoredState(value: string): StoredReviewState {
  const parsed: unknown = JSON.parse(value);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('phase' in parsed) ||
    (parsed.phase !== 'active' && parsed.phase !== 'complete') ||
    !('items' in parsed) ||
    !Array.isArray(parsed.items) ||
    !('queuePosition' in parsed) ||
    typeof parsed.queuePosition !== 'number' ||
    !('currentPrompt' in parsed) ||
    (parsed.currentPrompt !== null &&
      parsed.currentPrompt !== 'meaning' &&
      parsed.currentPrompt !== 'reading') ||
    !('incorrectMeaningBySubject' in parsed) ||
    !('incorrectReadingBySubject' in parsed)
  ) {
    throw new Error('Invalid review session state');
  }
  return parsed as unknown as StoredReviewState;
}
