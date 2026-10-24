import type { Database } from '@/db/Database';
import type { LessonSubjectType } from '@/features/lessons/types';

export type QuestionOrder = 'meaning-first' | 'reading-first' | 'mixed';
export type ReviewOrder =
  | 'random'
  | 'oldest-first'
  | 'newest-first'
  | 'lowest-level'
  | 'highest-level'
  | 'srs-ascending'
  | 'srs-descending';

export interface StudySettings {
  readonly exactMatch: boolean;
  readonly allowOverrides: boolean;
  readonly autoAdvance: boolean;
  readonly showFullAnswer: boolean;
  readonly readingInput: 'romaji' | 'kana';
  readonly questionOrder: QuestionOrder;
  readonly reviewBatchSize: number;
  readonly incorrectAnswerDelay: number;
  readonly reviewLimit: number | null;
  readonly reviewOrder: ReviewOrder;
  readonly lessonBatchSize: number;
  readonly lessonSubjectOrder: readonly LessonSubjectType[];
  readonly prioritizeCurrentLevel: boolean;
  readonly showKanaVocabulary: boolean;
  readonly apprenticeLimit: number | null;
  readonly autoplay: boolean;
}

export const DEFAULT_STUDY_SETTINGS: StudySettings = {
  exactMatch: false,
  allowOverrides: true,
  autoAdvance: true,
  showFullAnswer: false,
  readingInput: 'kana',
  questionOrder: 'meaning-first',
  reviewBatchSize: 5,
  incorrectAnswerDelay: 5,
  reviewLimit: null,
  reviewOrder: 'random',
  lessonBatchSize: 5,
  lessonSubjectOrder: ['radical', 'kanji', 'vocabulary'],
  prioritizeCurrentLevel: false,
  showKanaVocabulary: true,
  apprenticeLimit: null,
  autoplay: false,
};

const KEYS: Record<keyof StudySettings, string> = {
  exactMatch: 'reviews.exactMatch',
  allowOverrides: 'reviews.allowOverrides',
  autoAdvance: 'reviews.autoAdvance',
  showFullAnswer: 'reviews.showFullAnswer',
  readingInput: 'reviews.readingInput',
  questionOrder: 'reviews.questionOrder',
  reviewBatchSize: 'reviews.reviewBatchSize',
  incorrectAnswerDelay: 'reviews.incorrectAnswerDelay',
  reviewLimit: 'reviews.reviewLimit',
  reviewOrder: 'reviews.reviewOrder',
  lessonBatchSize: 'lessons.batchSize',
  lessonSubjectOrder: 'lessons.subjectOrder',
  prioritizeCurrentLevel: 'lessons.prioritizeCurrentLevel',
  showKanaVocabulary: 'lessons.showKanaVocabulary',
  apprenticeLimit: 'lessons.apprenticeLimit',
  autoplay: 'reviews.autoplay',
};

export async function loadStudySettings(db: Database): Promise<StudySettings> {
  const rows = await db.all<{ key: string; value: string }>(
    'SELECT key, value FROM settings',
  );
  const values = new Map(rows.map(({ key, value }) => [key, value]));
  const result = { ...DEFAULT_STUDY_SETTINGS };
  for (const field of Object.keys(KEYS) as (keyof StudySettings)[]) {
    const raw = values.get(KEYS[field]);
    if (raw === undefined) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }
    if (
      typeof DEFAULT_STUDY_SETTINGS[field] === 'boolean' &&
      (parsed === 0 || parsed === 1)
    )
      parsed = parsed === 1;
    if (validValue(field, parsed)) Object.assign(result, { [field]: parsed });
  }
  // Until explicitly customized, respect the account's WaniKani lesson batch.
  if (!values.has(KEYS.lessonBatchSize)) {
    const user = await db.first<{ resourceJson: string }>(
      'SELECT resource_json AS resourceJson FROM user LIMIT 1',
    );
    if (user !== null) {
      try {
        const batch: unknown = JSON.parse(user.resourceJson)?.data?.preferences
          ?.lessons_batch_size;
        if (validValue('lessonBatchSize', batch))
          result.lessonBatchSize = batch as number;
      } catch {
        /* A damaged optional preference must not prevent study. */
      }
    }
  }
  return result;
}

export function saveStudySettings(
  db: Database,
  settings: StudySettings,
): Promise<void> {
  return db.transaction(async (tx) => {
    for (const field of Object.keys(KEYS) as (keyof StudySettings)[]) {
      if (!validValue(field, settings[field]))
        throw new Error(`Invalid study setting: ${field}`);
      await tx.run(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [KEYS[field], JSON.stringify(settings[field])],
      );
    }
  });
}

function validValue(field: keyof StudySettings, value: unknown): boolean {
  switch (field) {
    case 'questionOrder':
      return ['meaning-first', 'reading-first', 'mixed'].includes(
        String(value),
      );
    case 'readingInput':
      return value === 'kana' || value === 'romaji';
    case 'reviewOrder':
      return [
        'random',
        'oldest-first',
        'newest-first',
        'lowest-level',
        'highest-level',
        'srs-ascending',
        'srs-descending',
      ].includes(String(value));
    case 'reviewLimit':
    case 'apprenticeLimit':
      return (
        value === null ||
        (typeof value === 'number' &&
          Number.isInteger(value) &&
          value > 0 &&
          value <= 1000)
      );
    case 'lessonBatchSize':
    case 'reviewBatchSize':
      return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= 1 &&
        value <= 10
      );
    case 'incorrectAnswerDelay':
      return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= 0 &&
        value <= 10
      );
    case 'lessonSubjectOrder':
      return (
        Array.isArray(value) &&
        value.length >= 3 &&
        value.length <= 4 &&
        new Set(value).size === value.length &&
        ['radical', 'kanji', 'vocabulary'].every((item) =>
          value.includes(item),
        ) &&
        value.every((item) =>
          ['radical', 'kanji', 'vocabulary', 'kana_vocabulary'].includes(item),
        )
      );
    default:
      return typeof value === 'boolean';
  }
}
