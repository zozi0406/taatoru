import type { Database } from '@/db/Database';
import {
  type LessonSessionSnapshot,
  SessionRepository,
} from '@/features/sessions/SessionRepository';
import {
  loadLessonPickerItems,
} from './LessonPickerScreen';
import {
  buildAutomaticLessonQueue,
  type AutomaticLessonOptions,
} from './order';
import type { LessonSubjectType } from './types';

interface UserRow {
  readonly level: number;
  readonly resourceJson: string;
}

interface CountRow {
  readonly count: number;
}

interface SettingRow {
  readonly key: string;
  readonly value: string;
}

export async function startAutomaticLessons(
  db: Database,
  now = new Date(),
): Promise<LessonSessionSnapshot | null> {
  const [candidates, options] = await Promise.all([
    loadLessonPickerItems(db),
    loadAutomaticLessonOptions(db),
  ]);
  const queue = buildAutomaticLessonQueue(candidates, options);
  return queue.length === 0
    ? null
    : new SessionRepository(db).startLessonSession(queue, now);
}

async function loadAutomaticLessonOptions(
  db: Database,
): Promise<AutomaticLessonOptions> {
  const [user, apprentice, settings] = await Promise.all([
    db.first<UserRow>(
      `SELECT level, resource_json AS resourceJson FROM user LIMIT 1`,
    ),
    db.first<CountRow>(
      `SELECT COUNT(*) AS count
       FROM subject_progress
       WHERE srs_stage BETWEEN 1 AND 4`,
    ),
    db.all<SettingRow>(
      `SELECT key, value FROM settings
       WHERE key IN (
         'lessons.apprenticeLimit',
         'lessons.prioritizeCurrentLevel',
         'lessons.showKanaVocabulary',
         'lessons.subjectOrder'
       )`,
    ),
  ]);
  if (user === null) {
    throw new Error('Automatic lessons require a cached user');
  }
  const values = new Map(settings.map(({ key, value }) => [key, value]));
  return {
    apprenticeCount: apprentice?.count ?? 0,
    apprenticeLimit: settingNumber(
      values.get('lessons.apprenticeLimit'),
      Number.POSITIVE_INFINITY,
    ),
    batchSize: userBatchSize(user.resourceJson),
    currentLevel: user.level,
    prioritizeCurrentLevel: settingBoolean(
      values.get('lessons.prioritizeCurrentLevel'),
      false,
    ),
    showKanaVocabulary: settingBoolean(
      values.get('lessons.showKanaVocabulary'),
      true,
    ),
    subjectOrder: settingSubjectOrder(
      values.get('lessons.subjectOrder'),
    ),
  };
}

function userBatchSize(resourceJson: string): number {
  try {
    const user = JSON.parse(resourceJson) as {
      readonly data?: {
        readonly preferences?: { readonly lessons_batch_size?: number };
      };
    };
    return user.data?.preferences?.lessons_batch_size ?? 5;
  } catch {
    return 5;
  }
}

function settingBoolean(
  value: string | undefined,
  fallback: boolean,
): boolean {
  return value === undefined
    ? fallback
    : value === 'true' || value === '1';
}

function settingNumber(
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function settingSubjectOrder(
  value: string | undefined,
): readonly LessonSubjectType[] {
  if (value !== undefined) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (
        Array.isArray(parsed) &&
        parsed.every((item) =>
          [
            'radical',
            'kanji',
            'vocabulary',
            'kana_vocabulary',
          ].includes(item),
        )
      ) {
        return parsed as LessonSubjectType[];
      }
    } catch {
      //
    }
  }
  return ['radical', 'kanji', 'vocabulary'];
}
