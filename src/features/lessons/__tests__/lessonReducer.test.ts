import type { LessonSessionSnapshot } from '@/features/sessions/SessionRepository';
import { reduceLesson } from '../lessonReducer';

const TYPES = { 1: 'radical', 2: 'kanji' } as const;

test('moves from presentation into meaning-first quiz prompts', () => {
  let state = snapshot();
  state = reduceLesson(state, { type: 'advance-presentation' }, TYPES).snapshot;
  expect(state).toMatchObject({ phase: 'presentation', queuePosition: 1 });

  state = reduceLesson(state, { type: 'advance-presentation' }, TYPES).snapshot;
  expect(state).toMatchObject({
    phase: 'quiz',
    queuePosition: 0,
    quizState: { currentPrompt: 'meaning', currentSubjectId: 1 },
  });
});

test('incorrect answers increment only the active prompt and do not advance', () => {
  const result = reduceLesson(quizSnapshot(), { type: 'incorrect' }, TYPES);
  expect(result.completedItem).toBeNull();
  expect(result.snapshot).toMatchObject({
    queuePosition: 0,
    quizState: {
      currentPrompt: 'meaning',
      currentSubjectId: 1,
      incorrectMeaningBySubject: { 1: 1 },
      incorrectReadingBySubject: {},
    },
  });
});

test('completes radicals after meaning and kanji after meaning and reading', () => {
  let result = reduceLesson(quizSnapshot(), { type: 'correct' }, TYPES);
  expect(result.completedItem).toEqual({
    assignmentId: 101,
    subjectId: 1,
  });
  expect(result.snapshot.quizState).toMatchObject({
    currentPrompt: 'meaning',
    currentSubjectId: 2,
  });

  result = reduceLesson(result.snapshot, { type: 'correct' }, TYPES);
  expect(result.completedItem).toBeNull();
  expect(result.snapshot.quizState.currentPrompt).toBe('reading');

  result = reduceLesson(result.snapshot, { type: 'correct' }, TYPES);
  expect(result.completedItem).toEqual({
    assignmentId: 102,
    subjectId: 2,
  });
  expect(result.snapshot.phase).toBe('complete');
  expect(result.snapshot.quizState.completedSubjectIds).toEqual([1, 2]);
});

function snapshot(): LessonSessionSnapshot {
  return {
    id: 'lesson',
    kind: 'lesson',
    phase: 'presentation',
    items: [
      { assignmentId: 101, subjectId: 1 },
      { assignmentId: 102, subjectId: 2 },
    ],
    queuePosition: 0,
    quizState: {
      completedSubjectIds: [],
      currentPrompt: null,
      currentSubjectId: null,
      incorrectMeaningBySubject: {},
      incorrectReadingBySubject: {},
    },
    createdAt: '2026-07-29T12:00:00.000Z',
    updatedAt: '2026-07-29T12:00:00.000Z',
  };
}

function quizSnapshot(): LessonSessionSnapshot {
  return {
    ...snapshot(),
    phase: 'quiz',
    quizState: {
      ...snapshot().quizState,
      currentPrompt: 'meaning',
      currentSubjectId: 1,
    },
  };
}
