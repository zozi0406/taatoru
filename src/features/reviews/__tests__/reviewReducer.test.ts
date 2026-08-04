import type { SubjectObject } from '@/api/types';
import type { ReviewSessionSnapshot } from '../ReviewSessionRepository';
import { reduceReview } from '../reviewReducer';

const NOW = '2026-07-29T12:00:00.000Z';

test('completes both prompts once with separate incorrect totals', () => {
  const types: Readonly<Record<number, SubjectObject>> = { 201: 'kanji' };
  const afterMeaningError = reduceReview(
    snapshot(201),
    { type: 'incorrect' },
    types,
  );
  expect(afterMeaningError.completedItem).toBeNull();
  expect(afterMeaningError.snapshot.incorrectMeaningBySubject).toEqual({
    201: 1,
  });

  const afterMeaning = reduceReview(
    afterMeaningError.snapshot,
    { type: 'correct' },
    types,
  );
  expect(afterMeaning.snapshot.currentPrompt).toBe('reading');
  expect(afterMeaning.completedItem).toBeNull();

  const afterReadingError = reduceReview(
    afterMeaning.snapshot,
    { type: 'incorrect' },
    types,
  );
  const completed = reduceReview(
    afterReadingError.snapshot,
    { type: 'correct' },
    types,
  );

  expect(completed.completedItem).toEqual({
    assignmentId: 501,
    subjectId: 201,
    incorrectMeaningAnswers: 1,
    incorrectReadingAnswers: 1,
  });
  expect(completed.snapshot).toMatchObject({
    phase: 'complete',
    queuePosition: 1,
    currentPrompt: null,
  });
  expect(
    reduceReview(completed.snapshot, { type: 'correct' }, types)
      .completedItem,
  ).toBeNull();
});

test.each([
  ['radical', 101],
  ['kana_vocabulary', 401],
] as const)('%s completes after its meaning prompt', (subjectType, subjectId) => {
  const result = reduceReview(
    snapshot(subjectId),
    { type: 'correct' },
    { [subjectId]: subjectType },
  );

  expect(result.completedItem).toMatchObject({ subjectId });
  expect(result.snapshot.phase).toBe('complete');
});

test('advances to the next review without losing accumulated counts', () => {
  const first = snapshot(101, 102);
  const next = reduceReview(first, { type: 'correct' }, {
    101: 'radical',
    102: 'radical',
  });

  expect(next.completedItem).toMatchObject({ subjectId: 101 });
  expect(next.snapshot).toMatchObject({
    phase: 'active',
    queuePosition: 1,
    currentPrompt: 'meaning',
  });
});

function snapshot(...subjectIds: readonly number[]): ReviewSessionSnapshot {
  return {
    id: 'review',
    kind: 'review',
    phase: 'active',
    items: subjectIds.map((subjectId, index) => ({
      assignmentId: 501 + index,
      subjectId,
    })),
    queuePosition: 0,
    currentPrompt: 'meaning',
    incorrectMeaningBySubject: {},
    incorrectReadingBySubject: {},
    createdAt: NOW,
    updatedAt: NOW,
  };
}
