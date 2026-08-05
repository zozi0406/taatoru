import type { Database } from '../Database';
import { SUBJECT_WITHIN_GRANTED_LEVEL } from '../subscription';
import {
  BASE_ASSIGNMENT_QUERY,
  NOT_EXCLUDED,
  type AvailableAssignment,
} from './AssignmentRepository';

export interface UpcomingReviewBucket {
  readonly hoursFromNow: number;
  readonly count: number;
}

export interface SrsCounts {
  readonly apprentice: number;
  readonly guru: number;
  readonly master: number;
  readonly enlightened: number;
  readonly burned: number;
}

interface SrsRow {
  readonly srsStage: number;
  readonly count: number;
}

interface LeechRow extends AvailableAssignment {
  readonly meaningIncorrect: number;
  readonly meaningCurrentStreak: number;
  readonly readingIncorrect: number;
  readonly readingCurrentStreak: number;
}

export class DerivedRepository {
  constructor(private readonly db: Database) {}

  getAvailableReviews(
    now: Date,
  ): Promise<readonly AvailableAssignment[]> {
    return this.db.all(
      `${BASE_ASSIGNMENT_QUERY}
       WHERE a.srs_stage BETWEEN 1 AND 8
         AND a.available_at <= ?
         AND a.hidden = 0
         AND s.hidden_at IS NULL
         AND ${SUBJECT_WITHIN_GRANTED_LEVEL}
         AND ${NOT_EXCLUDED}
       ORDER BY a.available_at, s.level, s.lesson_position, s.id`,
      [now.toISOString()],
    );
  }

  async getUpcomingReviews(
    now: Date,
    hours: number,
  ): Promise<readonly UpcomingReviewBucket[]> {
    const rows = await this.db.all<{ availableAt: string }>(
      `${BASE_ASSIGNMENT_QUERY}
       WHERE a.srs_stage BETWEEN 1 AND 8
         AND a.available_at > ? AND a.available_at <= ?
         AND a.hidden = 0 AND s.hidden_at IS NULL
         AND ${SUBJECT_WITHIN_GRANTED_LEVEL}
         AND ${NOT_EXCLUDED}
       ORDER BY a.available_at, s.id`,
      [
        now.toISOString(),
        new Date(now.getTime() + hours * 3_600_000).toISOString(),
      ],
    );
    const counts = new Map<number, number>();
    for (const { availableAt } of rows) {
      const bucket = Math.ceil(
        (new Date(availableAt).getTime() - now.getTime()) / 3_600_000,
      );
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }
    return [...counts].map(([hoursFromNow, count]) => ({ hoursFromNow, count }));
  }

  async getSrsCounts(): Promise<SrsCounts> {
    const rows = await this.db.all<SrsRow>(
      `SELECT srs_stage AS srsStage, COUNT(*) AS count
       FROM subject_progress WHERE srs_stage >= 1 GROUP BY srs_stage`,
    );
    const result = {
      apprentice: 0,
      guru: 0,
      master: 0,
      enlightened: 0,
      burned: 0,
    };
    for (const { srsStage, count } of rows) {
      result[srsCategory(srsStage)] += count;
    }
    return result;
  }

  async getLeeches(
    threshold: number,
  ): Promise<readonly AvailableAssignment[]> {
    const rows = await this.db.all<LeechRow>(
      `SELECT
         a.id AS assignmentId,
         a.subject_id AS subjectId,
         a.subject_type AS subjectType,
         a.srs_stage AS srsStage,
         a.available_at AS availableAt,
         rs.meaning_incorrect AS meaningIncorrect,
         rs.meaning_current_streak AS meaningCurrentStreak,
         rs.reading_incorrect AS readingIncorrect,
         rs.reading_current_streak AS readingCurrentStreak
       FROM assignments a
       JOIN subjects s ON s.id = a.subject_id
       JOIN review_statistics rs ON rs.subject_id = a.subject_id
       WHERE a.passed_at IS NOT NULL AND a.burned_at IS NULL
       ORDER BY s.level, s.lesson_position, s.id`,
    );
    return rows.filter((row) => {
      const incorrect = Math.max(
        row.meaningIncorrect,
        row.readingIncorrect,
      );
      const streak = Math.min(
        row.meaningCurrentStreak,
        row.readingCurrentStreak,
      );
      return streak > 0 && incorrect / Math.pow(streak, 1.5) >= threshold;
    });
  }
}

function srsCategory(stage: number): keyof SrsCounts {
  if (stage <= 4) {
    return 'apprentice';
  }
  if (stage <= 6) {
    return 'guru';
  }
  if (stage === 7) {
    return 'master';
  }
  if (stage === 8) {
    return 'enlightened';
  }
  return 'burned';
}
