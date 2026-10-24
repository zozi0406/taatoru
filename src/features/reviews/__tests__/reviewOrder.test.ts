import { orderReviewItems } from '../reviewOrder';
const items = [
  {
    subjectId: 1,
    assignmentId: 1,
    level: 2,
    srsStage: 3,
    availableAt: '2026-01-01',
    subjectType: 'kanji',
  },
  {
    subjectId: 2,
    assignmentId: 2,
    level: 1,
    srsStage: 5,
    availableAt: '2026-01-02',
    subjectType: 'kanji',
  },
  {
    subjectId: 3,
    assignmentId: 3,
    level: 1,
    srsStage: 1,
    availableAt: '2026-01-03',
    subjectType: 'radical',
  },
];
test.each([
  ['oldest-first', [1, 2, 3]],
  ['newest-first', [3, 2, 1]],
  ['lowest-level', [2, 3, 1]],
  ['highest-level', [1, 2, 3]],
  ['srs-ascending', [3, 1, 2]],
  ['srs-descending', [2, 1, 3]],
] as const)(
  '%s orders the review queue without mutating input',
  (order, ids) => {
    expect(
      orderReviewItems(items, order).map((item) => item.subjectId),
    ).toEqual(ids);
    expect(items.map((item) => item.subjectId)).toEqual([1, 2, 3]);
  },
);
test('random shuffles before a session limit is applied', () => {
  expect(
    orderReviewItems(items, 'random', () => 0).map((item) => item.subjectId),
  ).toEqual([2, 3, 1]);
});
