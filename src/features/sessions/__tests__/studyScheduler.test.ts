import { advanceStudyQuestion, firstStudyPrompt } from '../studyScheduler';
import { DEFAULT_STUDY_SETTINGS } from '@/features/settings/studySettings';

const items = [
  { assignmentId: 1, subjectId: 10 },
  { assignmentId: 2, subjectId: 20 },
];
test('reading-first asks both halves before completing a kanji', () => {
  const options = {
    ...DEFAULT_STUDY_SETTINGS,
    questionOrder: 'reading-first' as const,
  };
  expect(firstStudyPrompt('kanji', options.questionOrder)).toBe('reading');
  const first = advanceStudyQuestion({
    items,
    position: 0,
    prompt: 'reading',
    progress: {},
    types: { 10: 'kanji', 20: 'radical' },
    options,
    event: 'correct',
  });
  expect(first.prompt).toBe('meaning');
  expect(first.position).toBe(0);
  const next = advanceStudyQuestion({
    ...first,
    types: { 10: 'kanji', 20: 'radical' },
    options,
    event: 'correct',
  });
  expect(next.position).toBe(1);
  expect(next.completedSubjectId).toBe(10);
  expect(next.prompt).toBe('meaning');
});
test('wrong answers move behind other subjects without losing completed halves', () => {
  const next = advanceStudyQuestion({
    items,
    position: 0,
    prompt: 'reading',
    progress: { answeredMeaningSubjectIds: [10] },
    types: { 10: 'kanji', 20: 'radical' },
    options: DEFAULT_STUDY_SETTINGS,
    event: 'retry',
  });
  expect(next.items.map(({ subjectId }) => subjectId)).toEqual([20, 10]);
  expect(next.progress.answeredMeaningSubjectIds).toEqual([10]);
  expect(next.completedSubjectId).toBeNull();
});
test('mixed questions retain both halves when the active pool rotates', () => {
  const options = {
    ...DEFAULT_STUDY_SETTINGS,
    questionOrder: 'mixed' as const,
  };
  const first = advanceStudyQuestion({
    items,
    position: 0,
    prompt: 'meaning',
    progress: {},
    types: { 10: 'kanji', 20: 'kanji' },
    options,
    event: 'correct',
  });
  expect(first.items.map(({ subjectId }) => subjectId)).toEqual([20, 10]);
  const second = advanceStudyQuestion({
    ...first,
    types: { 10: 'kanji', 20: 'kanji' },
    options,
    event: 'correct',
  });
  expect(second.items[second.position]?.subjectId).toBe(10);
  expect(second.prompt).toBe('reading');
});
