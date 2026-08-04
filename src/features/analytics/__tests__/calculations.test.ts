import {
  calculateAnalytics,
  type AnalyticsInput,
} from '../calculations';

const NOW = new Date('2026-07-29T12:00:00.000Z');

test('calculates exact local analytics while excluding hidden and reset data', () => {
  expect(calculateAnalytics(fixture(), NOW, 1)).toEqual({
    upcoming: [
      { label: 'Now', value: 1 },
      { label: '2h', value: 1 },
    ],
    srs: [
      { label: 'Apprentice', value: 1 },
      { label: 'Guru', value: 1 },
      { label: 'Master', value: 1 },
      { label: 'Burned', value: 1 },
    ],
    levelTimings: [
      { level: 1, hours: 48 },
      { level: 2, hours: 72 },
    ],
    accuracy: { correct: 23, total: 30, percentage: 76.7 },
    strongest: [
      { id: 1, label: 'One', percentage: 90, totalAnswers: 20 },
      { id: 2, label: 'Two', percentage: 50, totalAnswers: 10 },
    ],
    weakest: [
      { id: 2, label: 'Two', percentage: 50, totalAnswers: 10 },
      { id: 1, label: 'One', percentage: 90, totalAnswers: 20 },
    ],
    leeches: [
      { id: 2, label: 'Two', score: 3 },
    ],
  });
});

test('returns stable empty analytics without NaN values', () => {
  expect(
    calculateAnalytics(
      {
        assignments: [],
        levelProgressions: [],
        progress: [],
        subjects: [],
      },
      NOW,
      1,
    ),
  ).toEqual({
    upcoming: [],
    srs: [],
    levelTimings: [],
    accuracy: null,
    strongest: [],
    weakest: [],
    leeches: [],
  });
});

function fixture(): AnalyticsInput {
  return {
    assignments: [
      {
        availableAt: '2026-07-29T11:00:00.000Z',
        assignmentHidden: false,
        subjectHidden: false,
      },
      {
        availableAt: '2026-07-29T13:30:00.000Z',
        assignmentHidden: false,
        subjectHidden: false,
      },
      {
        availableAt: '2026-07-30T13:00:00.000Z',
        assignmentHidden: false,
        subjectHidden: false,
      },
      {
        availableAt: '2026-07-29T14:00:00.000Z',
        assignmentHidden: true,
        subjectHidden: false,
      },
    ],
    progress: [
      { assignmentHidden: false, srsStage: 1, subjectHidden: false },
      { assignmentHidden: false, srsStage: 5, subjectHidden: false },
      { assignmentHidden: false, srsStage: 7, subjectHidden: false },
      { assignmentHidden: false, srsStage: 9, subjectHidden: false },
      { assignmentHidden: false, srsStage: 8, subjectHidden: true },
    ],
    levelProgressions: [
      {
        abandonedAt: null,
        level: 1,
        passedAt: '2026-07-03T00:00:00.000Z',
        startedAt: '2026-07-01T00:00:00.000Z',
      },
      {
        abandonedAt: '2026-07-02T00:00:00.000Z',
        level: 1,
        passedAt: null,
        startedAt: '2026-06-30T00:00:00.000Z',
      },
      {
        abandonedAt: null,
        level: 2,
        passedAt: '2026-07-06T00:00:00.000Z',
        startedAt: '2026-07-03T00:00:00.000Z',
      },
    ],
    subjects: [
      {
        assignmentBurnedAt: null,
        assignmentHidden: false,
        assignmentPassedAt: '2026-07-01T00:00:00.000Z',
        id: 1,
        label: 'One',
        meaningCorrect: 9,
        meaningCurrentStreak: 5,
        meaningIncorrect: 1,
        readingCorrect: 9,
        readingCurrentStreak: 4,
        readingIncorrect: 1,
        statisticHidden: false,
        subjectHidden: false,
      },
      {
        assignmentBurnedAt: null,
        assignmentHidden: false,
        assignmentPassedAt: '2026-07-01T00:00:00.000Z',
        id: 2,
        label: 'Two',
        meaningCorrect: 2,
        meaningCurrentStreak: 1,
        meaningIncorrect: 3,
        readingCorrect: 3,
        readingCurrentStreak: 2,
        readingIncorrect: 2,
        statisticHidden: false,
        subjectHidden: false,
      },
      {
        assignmentBurnedAt: null,
        assignmentHidden: false,
        assignmentPassedAt: '2026-07-01T00:00:00.000Z',
        id: 3,
        label: 'Hidden',
        meaningCorrect: 0,
        meaningCurrentStreak: 1,
        meaningIncorrect: 100,
        readingCorrect: 0,
        readingCurrentStreak: 1,
        readingIncorrect: 100,
        statisticHidden: false,
        subjectHidden: true,
      },
    ],
  };
}
