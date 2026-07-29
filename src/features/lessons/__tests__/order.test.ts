import {
  buildAutomaticLessonQueue,
  type AutomaticLessonOptions,
} from '../order';
import type { LessonCandidate } from '../types';

const DEFAULT_OPTIONS: AutomaticLessonOptions = {
  apprenticeCount: 10,
  apprenticeLimit: 100,
  batchSize: 5,
  currentLevel: 3,
  prioritizeCurrentLevel: false,
  showKanaVocabulary: true,
  subjectOrder: ['radical', 'kanji', 'vocabulary'],
};

test('orders by level, configured type, lesson position, and stable ID', () => {
  expect(
    buildAutomaticLessonQueue(
      [
        candidate(8, 'vocabulary', 1, 1),
        candidate(7, 'kanji', 1, 5),
        candidate(6, 'radical', 1, 10),
        candidate(5, 'kanji', 1, 2),
        candidate(4, 'kanji', 1, 2),
        candidate(3, 'radical', 2, 1),
      ],
      { ...DEFAULT_OPTIONS, batchSize: 10 },
    ).map(({ subjectId }) => subjectId),
  ).toEqual([6, 4, 5, 7, 8, 3]);
});

test('prioritizes the current level and respects a custom subject order', () => {
  expect(
    buildAutomaticLessonQueue(
      [
        candidate(1, 'radical', 1, 1),
        candidate(2, 'kanji', 2, 1),
        candidate(3, 'vocabulary', 3, 2),
        candidate(4, 'radical', 3, 1),
      ],
      {
        ...DEFAULT_OPTIONS,
        batchSize: 10,
        prioritizeCurrentLevel: true,
        subjectOrder: ['vocabulary', 'kanji', 'radical'],
      },
    ).map(({ subjectId }) => subjectId),
  ).toEqual([3, 4, 2, 1]);
});

test('treats kana vocabulary as vocabulary and can hide it', () => {
  const items = [
    candidate(1, 'kana_vocabulary', 1, 1),
    candidate(2, 'vocabulary', 1, 2),
  ];
  expect(
    buildAutomaticLessonQueue(items, {
      ...DEFAULT_OPTIONS,
      batchSize: 10,
    }).map(({ subjectId }) => subjectId),
  ).toEqual([1, 2]);
  expect(
    buildAutomaticLessonQueue(items, {
      ...DEFAULT_OPTIONS,
      batchSize: 10,
      showKanaVocabulary: false,
    }).map(({ subjectId }) => subjectId),
  ).toEqual([2]);
});

test('removes unavailable and excluded subjects before applying batch size', () => {
  expect(
    buildAutomaticLessonQueue(
      [
        candidate(1, 'radical', 1, 1, { available: false }),
        candidate(2, 'radical', 1, 2, { excluded: true }),
        candidate(3, 'radical', 1, 3),
        candidate(4, 'radical', 1, 4),
      ],
      { ...DEFAULT_OPTIONS, batchSize: 1 },
    ).map(({ subjectId }) => subjectId),
  ).toEqual([3]);
});

test('caps the batch at the remaining apprentice capacity', () => {
  const items = [
    candidate(1, 'radical', 1, 1),
    candidate(2, 'radical', 1, 2),
    candidate(3, 'radical', 1, 3),
  ];
  expect(
    buildAutomaticLessonQueue(items, {
      ...DEFAULT_OPTIONS,
      apprenticeCount: 98,
      apprenticeLimit: 100,
      batchSize: 5,
    }).map(({ subjectId }) => subjectId),
  ).toEqual([1, 2]);
  expect(
    buildAutomaticLessonQueue(items, {
      ...DEFAULT_OPTIONS,
      apprenticeCount: 100,
      apprenticeLimit: 100,
    }),
  ).toEqual([]);
});

function candidate(
  subjectId: number,
  subjectType: LessonCandidate['subjectType'],
  level: number,
  lessonPosition: number,
  overrides: Partial<LessonCandidate> = {},
): LessonCandidate {
  return {
    assignmentId: subjectId + 1_000,
    available: true,
    excluded: false,
    lessonPosition,
    level,
    subjectId,
    subjectType,
    ...overrides,
  };
}
