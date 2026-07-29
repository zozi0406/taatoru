import type { SubjectResource } from '@/api/types';
import type { Database } from '@/db/Database';
import type { LessonCandidate } from '@/features/lessons/types';

export type LessonSessionPhase = 'presentation' | 'quiz' | 'selection';
export type LessonPrompt = 'meaning' | 'reading';

export interface LessonSessionItem {
  readonly assignmentId: number;
  readonly subjectId: number;
}

export interface LessonQuizState {
  readonly completedSubjectIds: readonly number[];
  readonly currentPrompt: LessonPrompt | null;
  readonly currentSubjectId: number | null;
  readonly incorrectMeaningBySubject: Readonly<Record<string, number>>;
  readonly incorrectReadingBySubject: Readonly<Record<string, number>>;
}

export interface LessonSessionSnapshot {
  readonly createdAt: string;
  readonly id: 'lesson';
  readonly items: readonly LessonSessionItem[];
  readonly kind: 'lesson';
  readonly phase: LessonSessionPhase;
  readonly queuePosition: number;
  readonly quizState: LessonQuizState;
  readonly updatedAt: string;
}

interface SessionRow {
  readonly createdAt: string;
  readonly stateJson: string;
  readonly updatedAt: string;
}

interface SubjectRow {
  readonly id: number;
  readonly resourceJson: string;
}

interface StoredLessonState {
  readonly items: readonly LessonSessionItem[];
  readonly phase: LessonSessionPhase;
  readonly queuePosition: number;
  readonly quizState: LessonQuizState;
}

const EMPTY_QUIZ_STATE: LessonQuizState = {
  completedSubjectIds: [],
  currentPrompt: null,
  currentSubjectId: null,
  incorrectMeaningBySubject: {},
  incorrectReadingBySubject: {},
};

export class SessionRepository {
  constructor(private readonly db: Database) {}

  saveLessonSelection(
    candidates: readonly LessonCandidate[],
    now = new Date(),
  ): Promise<LessonSessionSnapshot> {
    return this.writeLessonSession(candidates, 'selection', now);
  }

  startLessonSession(
    candidates: readonly LessonCandidate[],
    now = new Date(),
  ): Promise<LessonSessionSnapshot> {
    if (candidates.length === 0) {
      throw new Error('A lesson session requires at least one subject');
    }
    return this.writeLessonSession(candidates, 'presentation', now);
  }

  async saveLessonSession(
    snapshot: LessonSessionSnapshot,
    now = new Date(),
  ): Promise<LessonSessionSnapshot> {
    const updated = {
      ...snapshot,
      updatedAt: now.toISOString(),
    };
    await this.db.run(
      `UPDATE active_sessions
       SET state_json = ?, updated_at = ?
       WHERE id = 'lesson' AND kind = 'lesson'`,
      [JSON.stringify(toStoredState(updated)), updated.updatedAt],
    );
    return updated;
  }

  async loadLessonSession(): Promise<LessonSessionSnapshot | null> {
    const row = await this.db.first<SessionRow>(
      `SELECT state_json AS stateJson,
              created_at AS createdAt,
              updated_at AS updatedAt
       FROM active_sessions
       WHERE id = 'lesson' AND kind = 'lesson'`,
    );
    if (row === null) {
      return null;
    }
    const state = parseStoredState(row.stateJson);
    return {
      id: 'lesson',
      kind: 'lesson',
      ...state,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async loadLessonSelectionIds(): Promise<readonly number[]> {
    const snapshot = await this.loadLessonSession();
    return snapshot?.phase === 'selection'
      ? snapshot.items.map(({ subjectId }) => subjectId)
      : [];
  }

  async loadLessonSubjects(
    snapshot: LessonSessionSnapshot,
  ): Promise<readonly SubjectResource[]> {
    const ids = [...new Set(snapshot.items.map(({ subjectId }) => subjectId))];
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.db.all<SubjectRow>(
      `SELECT id, resource_json AS resourceJson
       FROM subjects
       WHERE hidden_at IS NULL
         AND id IN (${ids.map(() => '?').join(', ')})`,
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

  clearLessonSession(): Promise<void> {
    return this.db
      .run(
        `DELETE FROM active_sessions
         WHERE id = 'lesson' AND kind = 'lesson'`,
      )
      .then(() => undefined);
  }

  private async writeLessonSession(
    candidates: readonly LessonCandidate[],
    phase: LessonSessionPhase,
    now: Date,
  ): Promise<LessonSessionSnapshot> {
    const timestamp = now.toISOString();
    const existing = await this.loadLessonSession();
    const snapshot: LessonSessionSnapshot = {
      id: 'lesson',
      kind: 'lesson',
      phase,
      items: candidates.map(({ assignmentId, subjectId }) => ({
        assignmentId,
        subjectId,
      })),
      queuePosition: 0,
      quizState: EMPTY_QUIZ_STATE,
      createdAt:
        phase === 'selection'
          ? (existing?.createdAt ?? timestamp)
          : timestamp,
      updatedAt: timestamp,
    };
    await this.db.run(
      `INSERT INTO active_sessions (
        id, kind, state_json, created_at, updated_at
      ) VALUES ('lesson', 'lesson', ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        kind = excluded.kind,
        state_json = excluded.state_json,
        updated_at = excluded.updated_at`,
      [
        JSON.stringify(toStoredState(snapshot)),
        snapshot.createdAt,
        snapshot.updatedAt,
      ],
    );
    return snapshot;
  }
}

function toStoredState(
  snapshot: LessonSessionSnapshot,
): StoredLessonState {
  return {
    phase: snapshot.phase,
    items: snapshot.items,
    queuePosition: snapshot.queuePosition,
    quizState: snapshot.quizState,
  };
}

function parseStoredState(value: string): StoredLessonState {
  const parsed: unknown = JSON.parse(value);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('phase' in parsed) ||
    !('items' in parsed) ||
    !Array.isArray(parsed.items) ||
    !('queuePosition' in parsed) ||
    typeof parsed.queuePosition !== 'number' ||
    !('quizState' in parsed)
  ) {
    throw new Error('Invalid lesson session state');
  }
  if (
    parsed.phase !== 'selection' &&
    parsed.phase !== 'presentation' &&
    parsed.phase !== 'quiz'
  ) {
    throw new Error('Invalid lesson session phase');
  }
  return parsed as unknown as StoredLessonState;
}
