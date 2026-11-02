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


test('wrap-up retains completed subjects, mixed halves and mistakes, excluding untouched subjects', () => {
  const initial = { ...snapshot(101, 201, 301, 401, 501), queuePosition: 1,
    questionProgress: { answeredReadingSubjectIds: [301] },
    incorrectMeaningBySubject: { 401: 2 } };
  const result = reduceReview(initial, { type: 'wrap-up' }, { 201: 'kanji', 301: 'kanji', 401: 'radical' });
  expect(result.completedItem).toBeNull();
  expect(result.snapshot.items.map((item) => item.subjectId)).toEqual([101, 301, 401]);
  expect(result.snapshot).toMatchObject({ wrappingUp: true, queuePosition: 1, currentPrompt: 'meaning' });
  const next = reduceReview(result.snapshot, { type: 'correct' }, { 301: 'kanji', 401: 'radical' });
  expect(next.completedItem?.subjectId).toBe(301);
  expect(next.snapshot.items.map((item) => item.subjectId)).toEqual([101, 301, 401]);
});

test('wrap-up without attempts completes without recording any review', () => {
  const result = reduceReview(snapshot(201, 301), { type: 'wrap-up' }, { 201: 'kanji', 301: 'kanji' });
  expect(result.completedItem).toBeNull();
  expect(result.snapshot).toMatchObject({ items: [], phase: 'complete', currentPrompt: null, queuePosition: 0, wrappingUp: true });
});

test('legacy reading prompt counts as an attempted meaning during wrap-up', () => {
  const result = reduceReview({ ...snapshot(201, 301), currentPrompt: 'reading' }, { type: 'wrap-up' }, {201: 'kanji'});
  expect(result.snapshot.items.map((item) => item.subjectId)).toEqual([201]);
  expect(result.snapshot.currentPrompt).toBe('reading');
});
