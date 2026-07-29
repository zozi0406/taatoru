import { mergeRecentMistakes } from '../recentMistakes';

const NOW = new Date('2026-07-29T12:00:00.000Z');

test('prunes mistakes older than 24 hours', () => {
  expect(
    mergeRecentMistakes(
      [
        { subjectId: 1, mistakenAt: '2026-07-28T11:59:59.999Z' },
        { subjectId: 2, mistakenAt: '2026-07-28T12:00:00.000Z' },
      ],
      [],
      NOW,
    ),
  ).toEqual([
    { subjectId: 2, mistakenAt: '2026-07-28T12:00:00.000Z' },
  ]);
});

test('keeps the newest timestamp for each subject independent of input order', () => {
  const local = [
    { subjectId: 42, mistakenAt: '2026-07-29T02:00:00.000Z' },
    { subjectId: 44, mistakenAt: '2026-07-29T08:00:00.000Z' },
  ];
  const remote = [
    { subjectId: 42, mistakenAt: '2026-07-29T10:00:00.000Z' },
  ];
  const expected = [
    { subjectId: 42, mistakenAt: '2026-07-29T10:00:00.000Z' },
    { subjectId: 44, mistakenAt: '2026-07-29T08:00:00.000Z' },
  ];

  expect(mergeRecentMistakes(local, remote, NOW)).toEqual(expected);
  expect(mergeRecentMistakes(remote, local, NOW)).toEqual(expected);
});

test('returns deterministic subject order without mutating either input', () => {
  const local = [
    { subjectId: 9, mistakenAt: '2026-07-29T11:00:00.000Z' },
  ];
  const remote = [
    { subjectId: 3, mistakenAt: '2026-07-29T10:00:00.000Z' },
  ];

  expect(mergeRecentMistakes(local, remote, NOW)).toEqual([
    { subjectId: 3, mistakenAt: '2026-07-29T10:00:00.000Z' },
    { subjectId: 9, mistakenAt: '2026-07-29T11:00:00.000Z' },
  ]);
  expect(local).toEqual([
    { subjectId: 9, mistakenAt: '2026-07-29T11:00:00.000Z' },
  ]);
  expect(remote).toEqual([
    { subjectId: 3, mistakenAt: '2026-07-29T10:00:00.000Z' },
  ]);
});
