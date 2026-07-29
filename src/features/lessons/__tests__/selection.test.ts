import { LessonSelection, groupLessonCandidates } from '../selection';
import type { LessonCandidate } from '../types';

test('groups available subjects by ascending level and subject type', () => {
  expect(
    groupLessonCandidates([
      candidate(4, 'vocabulary', 2),
      candidate(1, 'kanji', 1),
      candidate(3, 'kana_vocabulary', 1),
      candidate(2, 'radical', 1),
      candidate(5, 'vocabulary', 1, { available: false }),
      candidate(6, 'kanji', 1, { excluded: true }),
    ]).map((group) => ({
      level: group.level,
      sections: group.sections.map((section) => ({
        subjectType: section.subjectType,
        ids: section.items.map(({ subjectId }) => subjectId),
      })),
    })),
  ).toEqual([
    {
      level: 1,
      sections: [
        { subjectType: 'radical', ids: [2] },
        { subjectType: 'kanji', ids: [1] },
        { subjectType: 'kana_vocabulary', ids: [3] },
      ],
    },
    {
      level: 2,
      sections: [{ subjectType: 'vocabulary', ids: [4] }],
    },
  ]);
});

test('toggles selection, exposes count, and disables Begin when empty', () => {
  const selection = new LessonSelection([
    candidate(1, 'radical', 1),
    candidate(2, 'kanji', 1),
  ]);
  expect(selection.selectedCount).toBe(0);
  expect(selection.canBegin).toBe(false);

  selection.toggle(2);
  expect(selection.selectedIds).toEqual([2]);
  expect(selection.selectedCount).toBe(1);
  expect(selection.canBegin).toBe(true);
  expect(selection.isSelected(2)).toBe(true);

  selection.toggle(2);
  expect(selection.selectedIds).toEqual([]);
  expect(selection.canBegin).toBe(false);
});

test('restores IDs in display order and removes stale or duplicate IDs', () => {
  const selection = new LessonSelection(
    [
      candidate(3, 'vocabulary', 2),
      candidate(1, 'radical', 1),
      candidate(2, 'kanji', 1),
    ],
    [3, 99, 1, 3],
  );
  expect(selection.selectedIds).toEqual([1, 3]);

  selection.revalidate([
    candidate(3, 'vocabulary', 2, { available: false }),
    candidate(1, 'radical', 1),
    candidate(2, 'kanji', 1),
  ]);
  expect(selection.selectedIds).toEqual([1]);
});

test('ignores attempts to select an unavailable subject', () => {
  const selection = new LessonSelection([
    candidate(1, 'radical', 1, { excluded: true }),
  ]);
  selection.toggle(1);
  selection.toggle(99);
  expect(selection.selectedIds).toEqual([]);
});

function candidate(
  subjectId: number,
  subjectType: LessonCandidate['subjectType'],
  level: number,
  overrides: Partial<LessonCandidate> = {},
): LessonCandidate {
  return {
    assignmentId: subjectId + 1_000,
    available: true,
    excluded: false,
    lessonPosition: subjectId,
    level,
    subjectId,
    subjectType,
    ...overrides,
  };
}
