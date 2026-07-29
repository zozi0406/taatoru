import type { Database } from '@/db/Database';
import {
  AssignmentRepository,
  NOT_EXCLUDED,
} from '@/db/repositories/AssignmentRepository';
import {
  DerivedRepository,
  type SrsCounts,
} from '@/db/repositories/DerivedRepository';

export interface ReviewForecastBucket {
  readonly hoursFromNow: number;
  readonly count: number;
  readonly cumulative: number;
}

export interface LevelProgressSlice {
  readonly locked: number;
  readonly lesson: number;
  readonly apprentice: number;
  readonly guru: number;
}

export interface CurrentLevelProgress {
  readonly radical: LevelProgressSlice;
  readonly kanji: LevelProgressSlice;
  readonly vocabulary: LevelProgressSlice;
}

type MutableLevelProgressSlice = {
  -readonly [Key in keyof LevelProgressSlice]: number;
};

interface MutableCurrentLevelProgress {
  readonly radical: MutableLevelProgressSlice;
  readonly kanji: MutableLevelProgressSlice;
  readonly vocabulary: MutableLevelProgressSlice;
}

export interface DashboardSnapshot {
  readonly level: number;
  readonly lessonCount: number;
  readonly reviewCount: number;
  readonly nextReviewAt: string | null;
  readonly reviewBuckets: readonly ReviewForecastBucket[];
  readonly currentLevel: CurrentLevelProgress;
  readonly srs: SrsCounts;
  readonly pendingWriteCount: number;
  readonly vacationActive: boolean;
  readonly online: boolean;
  readonly lastSyncAt: string | null;
}

interface DashboardUserRow {
  readonly level: number;
  readonly maxLevelGranted: number;
  readonly resourceJson: string;
}

interface PendingRow {
  readonly count: number;
}

interface NextReviewRow {
  readonly nextReviewAt: string | null;
}

interface SyncRow {
  readonly lastSyncAt: string | null;
}

interface LevelRow {
  readonly subjectType: string;
  readonly srsStage: number | null;
  readonly startedAt: string | null;
}

export async function getDashboardSnapshot(
  db: Database,
  now: Date,
  online: boolean,
): Promise<DashboardSnapshot> {
  const assignments = new AssignmentRepository(db);
  const derived = new DerivedRepository(db);
  const [
    user,
    lessons,
    reviews,
    futureBuckets,
    srs,
    pending,
    nextReview,
    sync,
  ] = await Promise.all([
    db.first<DashboardUserRow>(
      `SELECT level,
              max_level_granted AS maxLevelGranted,
              resource_json AS resourceJson
       FROM user LIMIT 1`,
    ),
    assignments.getAvailableLessons(now),
    derived.getAvailableReviews(now),
    derived.getUpcomingReviews(now, 24),
    derived.getSrsCounts(),
    db.first<PendingRow>(
      `SELECT
        (SELECT COUNT(*) FROM pending_progress) +
        (SELECT COUNT(*) FROM pending_study_materials) AS count`,
    ),
    db.first<NextReviewRow>(
      `SELECT MIN(a.available_at) AS nextReviewAt
       FROM assignments a
       JOIN subjects s ON s.id = a.subject_id
       WHERE a.srs_stage BETWEEN 1 AND 8
         AND a.available_at > ?
         AND a.hidden = 0
         AND s.hidden_at IS NULL
         AND s.level <= (SELECT max_level_granted FROM user LIMIT 1)
         AND ${NOT_EXCLUDED}`,
      [now.toISOString()],
    ),
    db.first<SyncRow>(
      'SELECT last_sync_at AS lastSyncAt FROM sync_state WHERE id = 1',
    ),
  ]);
  if (user === null) {
    throw new Error('Dashboard requires a cached WaniKani user');
  }

  const level = Math.min(user.level, user.maxLevelGranted);
  const levelRows = await db.all<LevelRow>(
    `SELECT s.object AS subjectType,
            a.srs_stage AS srsStage,
            a.started_at AS startedAt
     FROM subjects s
     LEFT JOIN assignments a ON a.subject_id = s.id
     WHERE s.level = ? AND s.hidden_at IS NULL
     ORDER BY s.lesson_position, s.id`,
    [level],
  );
  const currentLevel = emptyCurrentLevel();
  for (const row of levelRows) {
    const subjectType =
      row.subjectType === 'kana_vocabulary'
        ? 'vocabulary'
        : row.subjectType;
    if (
      subjectType !== 'radical' &&
      subjectType !== 'kanji' &&
      subjectType !== 'vocabulary'
    ) {
      continue;
    }
    currentLevel[subjectType][progressState(row)] += 1;
  }

  const reviewBuckets = cumulativeBuckets(reviews.length, futureBuckets);
  return {
    level,
    lessonCount: lessons.length,
    reviewCount: reviews.length,
    nextReviewAt:
      reviews.length > 0
        ? now.toISOString()
        : (nextReview?.nextReviewAt ?? null),
    reviewBuckets,
    currentLevel,
    srs,
    pendingWriteCount: pending?.count ?? 0,
    vacationActive: vacationActive(user.resourceJson),
    online,
    lastSyncAt: sync?.lastSyncAt ?? null,
  };
}

function emptySlice(): MutableLevelProgressSlice {
  return { locked: 0, lesson: 0, apprentice: 0, guru: 0 };
}

function emptyCurrentLevel(): MutableCurrentLevelProgress {
  return {
    radical: emptySlice(),
    kanji: emptySlice(),
    vocabulary: emptySlice(),
  };
}

function progressState(row: LevelRow): keyof LevelProgressSlice {
  if (row.srsStage === null) {
    return 'locked';
  }
  if (row.srsStage === 0 && row.startedAt === null) {
    return 'lesson';
  }
  return row.srsStage < 5 ? 'apprentice' : 'guru';
}

function cumulativeBuckets(
  availableCount: number,
  future: readonly { hoursFromNow: number; count: number }[],
): readonly ReviewForecastBucket[] {
  const result: ReviewForecastBucket[] = [];
  let cumulative = 0;
  if (availableCount > 0) {
    cumulative = availableCount;
    result.push({ hoursFromNow: 0, count: availableCount, cumulative });
  }
  for (const bucket of future) {
    cumulative += bucket.count;
    result.push({ ...bucket, cumulative });
  }
  return result;
}

function vacationActive(resourceJson: string): boolean {
  try {
    const decoded: unknown = JSON.parse(resourceJson);
    if (
      typeof decoded === 'object' &&
      decoded !== null &&
      'data' in decoded &&
      typeof decoded.data === 'object' &&
      decoded.data !== null &&
      'current_vacation_started_at' in decoded.data
    ) {
      return decoded.data.current_vacation_started_at !== null;
    }
  } catch {
    //
  }
  return false;
}
