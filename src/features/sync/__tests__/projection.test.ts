import { projectSrsStage } from '../projection';

const NOW = new Date('2026-07-29T12:00:00.000Z');

test('projects a completed lesson into apprentice one', () => {
  expect(
    projectSrsStage({
      kind: 'lesson_start',
      currentSrsStage: 0,
      incorrectMeaningAnswers: 0,
      incorrectReadingAnswers: 0,
      now: NOW,
    }),
  ).toEqual({ srsStage: 1, lastMistakeAt: null });
});

test('projects a correct review forward by one stage', () => {
  expect(
    projectSrsStage({
      kind: 'review',
      currentSrsStage: 4,
      incorrectMeaningAnswers: 0,
      incorrectReadingAnswers: 0,
      now: NOW,
    }),
  ).toEqual({ srsStage: 5, lastMistakeAt: null });
});

test('projects an incorrect review back by one stage and stamps the mistake', () => {
  expect(
    projectSrsStage({
      kind: 'review',
      currentSrsStage: 3,
      incorrectMeaningAnswers: 1,
      incorrectReadingAnswers: 0,
      now: NOW,
    }),
  ).toEqual({
    srsStage: 2,
    lastMistakeAt: '2026-07-29T12:00:00.000Z',
  });
});

test('bounds local projections to valid WaniKani SRS stages', () => {
  expect(
    projectSrsStage({
      kind: 'review',
      currentSrsStage: 9,
      incorrectMeaningAnswers: 0,
      incorrectReadingAnswers: 0,
      now: NOW,
    }).srsStage,
  ).toBe(9);
  expect(
    projectSrsStage({
      kind: 'review',
      currentSrsStage: 1,
      incorrectMeaningAnswers: 0,
      incorrectReadingAnswers: 2,
      now: NOW,
    }).srsStage,
  ).toBe(1);
});

test('rejects invalid completion inputs', () => {
  expect(() =>
    projectSrsStage({
      kind: 'review',
      currentSrsStage: 10,
      incorrectMeaningAnswers: 0,
      incorrectReadingAnswers: 0,
      now: NOW,
    }),
  ).toThrow('currentSrsStage');
  expect(() =>
    projectSrsStage({
      kind: 'review',
      currentSrsStage: 2,
      incorrectMeaningAnswers: -1,
      incorrectReadingAnswers: 0,
      now: NOW,
    }),
  ).toThrow('incorrectMeaningAnswers');
});

test.each([
  [8, 1, 0, 6],
  [6, 1, 2, 2],
  [4, 2, 1, 2],
  [5, 1, 1, 3],
  [1, 3, 3, 1],
])('demotes stage %i with %i meaning and %i reading mistakes to %i', (stage, meaning, reading, expected) => {
  expect(
    projectSrsStage({
      kind: 'review',
      currentSrsStage: stage,
      incorrectMeaningAnswers: meaning,
      incorrectReadingAnswers: reading,
      now: NOW,
    }),
  ).toEqual({ srsStage: expected, lastMistakeAt: NOW.toISOString() });
});
