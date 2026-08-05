import type { Database } from '@/db/Database';
import { SUBJECT_WITHIN_GRANTED_LEVEL } from '@/db/subscription';

export interface AnalyticsAssignmentInput {
  readonly availableAt: string;
  readonly assignmentHidden: boolean;
  readonly subjectHidden: boolean;
}

export interface AnalyticsProgressInput {
  readonly assignmentHidden: boolean;
  readonly srsStage: number;
  readonly subjectHidden: boolean;
}

export interface AnalyticsLevelInput {
  readonly abandonedAt: string | null;
  readonly level: number;
  readonly passedAt: string | null;
  readonly startedAt: string | null;
}

export interface AnalyticsSubjectInput {
  readonly assignmentBurnedAt: string | null;
  readonly assignmentHidden: boolean;
  readonly assignmentPassedAt: string | null;
  readonly id: number;
  readonly label: string;
  readonly meaningCorrect: number;
  readonly meaningCurrentStreak: number;
  readonly meaningIncorrect: number;
  readonly readingCorrect: number;
  readonly readingCurrentStreak: number;
  readonly readingIncorrect: number;
  readonly statisticHidden: boolean;
  readonly subjectHidden: boolean;
}

export interface AnalyticsInput {
  readonly assignments: readonly AnalyticsAssignmentInput[];
  readonly levelProgressions: readonly AnalyticsLevelInput[];
  readonly progress: readonly AnalyticsProgressInput[];
  readonly subjects: readonly AnalyticsSubjectInput[];
}

export interface ChartDatum {
  readonly label: string;
  readonly value: number;
}

export interface LevelTiming {
  readonly level: number;
  readonly hours: number;
}

export interface AccuracySummary {
  readonly correct: number;
  readonly total: number;
  readonly percentage: number;
}

export interface RankedSubject {
  readonly id: number;
  readonly label: string;
  readonly percentage: number;
  readonly totalAnswers: number;
}

export interface LeechSubject {
  readonly id: number;
  readonly label: string;
  readonly score: number;
}

export interface AnalyticsSnapshot {
  readonly upcoming: readonly ChartDatum[];
  readonly srs: readonly ChartDatum[];
  readonly levelTimings: readonly LevelTiming[];
  readonly accuracy: AccuracySummary | null;
  readonly strongest: readonly RankedSubject[];
  readonly weakest: readonly RankedSubject[];
  readonly leeches: readonly LeechSubject[];
}

interface SubjectRow extends Omit<AnalyticsSubjectInput, 'label'> {
  readonly resourceJson: string;
}

export function calculateAnalytics(
  input: AnalyticsInput,
  now: Date,
  leechThreshold: number,
): AnalyticsSnapshot {
  const upcomingCounts = new Map<number, number>();
  for (const assignment of input.assignments) {
    if (assignment.assignmentHidden || assignment.subjectHidden) {
      continue;
    }
    const difference =
      new Date(assignment.availableAt).getTime() - now.getTime();
    const hour = difference <= 0 ? 0 : Math.ceil(difference / 3_600_000);
    if (hour <= 24) {
      upcomingCounts.set(hour, (upcomingCounts.get(hour) ?? 0) + 1);
    }
  }
  const upcoming = [...upcomingCounts]
    .sort(([left], [right]) => left - right)
    .map(([hour, value]) => ({
      label: hour === 0 ? 'Now' : `${hour}h`,
      value,
    }));

  const srsCounts = new Map<string, number>();
  for (const progress of input.progress) {
    if (progress.assignmentHidden || progress.subjectHidden) {
      continue;
    }
    const category = srsCategory(progress.srsStage);
    if (category !== null) {
      srsCounts.set(category, (srsCounts.get(category) ?? 0) + 1);
    }
  }
  const srs = [
    'Apprentice',
    'Guru',
    'Master',
    'Enlightened',
    'Burned',
  ].flatMap((label) => {
    const value = srsCounts.get(label) ?? 0;
    return value === 0 ? [] : [{ label, value }];
  });

  const levelTimings = input.levelProgressions
    .filter(
      (level) =>
        level.abandonedAt === null &&
        level.startedAt !== null &&
        level.passedAt !== null,
    )
    .map((level) => ({
      level: level.level,
      hours: round(
        (new Date(level.passedAt!).getTime() -
          new Date(level.startedAt!).getTime()) /
          3_600_000,
        1,
      ),
    }))
    .filter(({ hours }) => hours >= 0)
    .sort((left, right) => left.level - right.level);

  const visibleSubjects = input.subjects.filter(
    (subject) =>
      !subject.assignmentHidden &&
      !subject.statisticHidden &&
      !subject.subjectHidden,
  );
  const ranked = visibleSubjects
    .map(rankSubject)
    .filter((subject): subject is RankedSubject => subject !== null);
  const correct = visibleSubjects.reduce(
    (total, subject) =>
      total + subject.meaningCorrect + subject.readingCorrect,
    0,
  );
  const total = visibleSubjects.reduce(
    (sum, subject) =>
      sum +
      subject.meaningCorrect +
      subject.meaningIncorrect +
      subject.readingCorrect +
      subject.readingIncorrect,
    0,
  );

  return {
    upcoming,
    srs,
    levelTimings,
    accuracy:
      total === 0
        ? null
        : { correct, total, percentage: round((correct / total) * 100, 1) },
    strongest: [...ranked]
      .sort(
        (left, right) =>
          right.percentage - left.percentage ||
          right.totalAnswers - left.totalAnswers ||
          left.id - right.id,
      )
      .slice(0, 5),
    weakest: [...ranked]
      .sort(
        (left, right) =>
          left.percentage - right.percentage ||
          right.totalAnswers - left.totalAnswers ||
          left.id - right.id,
      )
      .slice(0, 5),
    leeches: visibleSubjects
      .flatMap((subject) => {
        if (
          subject.assignmentHidden ||
          subject.assignmentPassedAt === null ||
          subject.assignmentBurnedAt !== null
        ) {
          return [];
        }
        const streak = Math.min(
          subject.meaningCurrentStreak,
          subject.readingCurrentStreak,
        );
        if (streak <= 0) {
          return [];
        }
        const score =
          Math.max(
            subject.meaningIncorrect,
            subject.readingIncorrect,
          ) / Math.pow(streak, 1.5);
        return score >= leechThreshold
          ? [{ id: subject.id, label: subject.label, score: round(score, 2) }]
          : [];
      })
      .sort((left, right) => right.score - left.score || left.id - right.id),
  };
}

export async function loadAnalyticsSnapshot(
  db: Database,
  now: Date,
  leechThreshold = 1,
): Promise<AnalyticsSnapshot> {
  const [assignments, progress, levelProgressions, subjectRows] =
    await Promise.all([
      db.all<AnalyticsAssignmentInput>(
        `SELECT a.available_at AS availableAt,
                a.hidden AS assignmentHidden,
                (s.hidden_at IS NOT NULL) AS subjectHidden
         FROM assignments a
         JOIN subjects s ON s.id = a.subject_id
         WHERE a.srs_stage BETWEEN 1 AND 8
           AND a.available_at IS NOT NULL
           AND ${SUBJECT_WITHIN_GRANTED_LEVEL}`,
      ),
      db.all<AnalyticsProgressInput>(
        `SELECT sp.srs_stage AS srsStage,
                COALESCE(a.hidden, 0) AS assignmentHidden,
                (s.hidden_at IS NOT NULL) AS subjectHidden
         FROM subject_progress sp
         JOIN subjects s ON s.id = sp.subject_id
         LEFT JOIN assignments a ON a.subject_id = sp.subject_id
         WHERE ${SUBJECT_WITHIN_GRANTED_LEVEL}`,
      ),
      db.all<AnalyticsLevelInput>(
        `SELECT level,
                started_at AS startedAt,
                passed_at AS passedAt,
                abandoned_at AS abandonedAt
         FROM level_progressions`,
      ),
      db.all<SubjectRow>(
        `SELECT s.id,
                s.resource_json AS resourceJson,
                (s.hidden_at IS NOT NULL) AS subjectHidden,
                rs.hidden AS statisticHidden,
                rs.meaning_correct AS meaningCorrect,
                rs.meaning_incorrect AS meaningIncorrect,
                rs.meaning_current_streak AS meaningCurrentStreak,
                rs.reading_correct AS readingCorrect,
                rs.reading_incorrect AS readingIncorrect,
                rs.reading_current_streak AS readingCurrentStreak,
                COALESCE(a.hidden, 0) AS assignmentHidden,
                a.passed_at AS assignmentPassedAt,
                a.burned_at AS assignmentBurnedAt
         FROM review_statistics rs
         JOIN subjects s ON s.id = rs.subject_id
         LEFT JOIN assignments a ON a.subject_id = s.id
         WHERE ${SUBJECT_WITHIN_GRANTED_LEVEL}`,
      ),
    ]);
  return calculateAnalytics(
    {
      assignments,
      progress,
      levelProgressions,
      subjects: subjectRows.map(({ resourceJson, ...subject }) => ({
        ...subject,
        label: subjectLabel(resourceJson),
      })),
    },
    now,
    leechThreshold,
  );
}

function srsCategory(stage: number): string | null {
  if (stage >= 1 && stage <= 4) return 'Apprentice';
  if (stage <= 6) return 'Guru';
  if (stage === 7) return 'Master';
  if (stage === 8) return 'Enlightened';
  if (stage >= 9) return 'Burned';
  return null;
}

function rankSubject(subject: AnalyticsSubjectInput): RankedSubject | null {
  const correct = subject.meaningCorrect + subject.readingCorrect;
  const total =
    correct + subject.meaningIncorrect + subject.readingIncorrect;
  return total === 0
    ? null
    : {
        id: subject.id,
        label: subject.label,
        percentage: round((correct / total) * 100, 1),
        totalAnswers: total,
      };
}

function subjectLabel(resourceJson: string): string {
  try {
    const parsed: unknown = JSON.parse(resourceJson);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'data' in parsed &&
      typeof parsed.data === 'object' &&
      parsed.data !== null &&
      'meanings' in parsed.data &&
      Array.isArray(parsed.data.meanings)
    ) {
      const primary = parsed.data.meanings.find(
        (meaning) =>
          typeof meaning === 'object' &&
          meaning !== null &&
          'primary' in meaning &&
          meaning.primary === true &&
          'meaning' in meaning &&
          typeof meaning.meaning === 'string',
      );
      if (
        typeof primary === 'object' &&
        primary !== null &&
        'meaning' in primary &&
        typeof primary.meaning === 'string'
      ) {
        return primary.meaning;
      }
    }
  } catch {
    //
  }
  return 'Unknown subject';
}

function round(value: number, places: number): number {
  const factor = Math.pow(10, places);
  return Math.round(value * factor) / factor;
}
