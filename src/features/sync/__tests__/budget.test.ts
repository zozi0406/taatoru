import { selectPendingWrites } from '../budget';

test('reserves fetch capacity and prioritizes pending progress', () => {
  expect(
    selectPendingWrites({
      requestsRemaining: 20,
      assignmentUnits: 1,
      subjectUnits: 1,
      fixedUnits: 6,
      progressIds: [1, 2, 3, 4, 5, 6, 7, 8],
      studyMaterialIds: [9, 10, 11, 12, 13, 14],
    }),
  ).toEqual({
    progressIds: [1, 2, 3, 4, 5, 6, 7, 8],
    studyMaterialIds: [9, 10, 11, 12],
  });
});

test('selects no pending writes when reserved capacity consumes the quota', () => {
  expect(
    selectPendingWrites({
      requestsRemaining: 34,
      assignmentUnits: 8,
      subjectUnits: 20,
      fixedUnits: 6,
      progressIds: [1],
      studyMaterialIds: [2],
    }),
  ).toEqual({ progressIds: [], studyMaterialIds: [] });
});

test('treats negative remaining capacity as zero', () => {
  expect(
    selectPendingWrites({
      requestsRemaining: 3,
      assignmentUnits: 8,
      subjectUnits: 20,
      fixedUnits: 6,
      progressIds: [1],
      studyMaterialIds: [2],
    }),
  ).toEqual({ progressIds: [], studyMaterialIds: [] });
});

test('does not mutate the pending write order', () => {
  const progressIds = [3, 1, 2];
  const studyMaterialIds = [6, 4, 5];

  expect(
    selectPendingWrites({
      requestsRemaining: 38,
      assignmentUnits: 8,
      subjectUnits: 20,
      fixedUnits: 6,
      progressIds,
      studyMaterialIds,
    }),
  ).toEqual({ progressIds: [3, 1, 2], studyMaterialIds: [6] });
  expect(progressIds).toEqual([3, 1, 2]);
  expect(studyMaterialIds).toEqual([6, 4, 5]);
});
