import type { SubjectObject } from '@/api/types';
import {
  DEFAULT_STUDY_SETTINGS,
  type StudySettings,
} from '@/features/settings/studySettings';
import {
  advanceStudyQuestion,
  firstStudyPrompt,
} from '@/features/sessions/studyScheduler';
import type {
  LessonPrompt,
  LessonSessionItem,
  LessonSessionSnapshot,
} from '@/features/sessions/SessionRepository';

export type LessonEvent =
  | { readonly type: 'advance-presentation' }
  | { readonly type: 'previous-presentation' }
  | { readonly type: 'start-quiz' }
  | { readonly type: 'correct' }
  | { readonly type: 'incorrect' }
  | { readonly type: 'continue-incorrect' }
  | { readonly type: 'override-correct' }
  | { readonly type: 'skip' };

export interface LessonTransition {
  readonly completedItem: LessonSessionItem | null;
  readonly snapshot: LessonSessionSnapshot;
}

export function reduceLesson(
  snapshot: LessonSessionSnapshot,
  event: LessonEvent,
  subjectTypes: Readonly<Record<number, SubjectObject>>,
  options: StudySettings = DEFAULT_STUDY_SETTINGS,
): LessonTransition {
  if (
    event.type === 'previous-presentation' &&
    snapshot.phase === 'presentation'
  ) {
    return {
      completedItem: null,
      snapshot: {
        ...snapshot,
        queuePosition: Math.max(0, snapshot.queuePosition - 1),
      },
    };
  }
  if (
    (event.type === 'advance-presentation' || event.type === 'start-quiz') &&
    snapshot.phase === 'presentation'
  ) {
    if (
      event.type !== 'start-quiz' &&
      snapshot.queuePosition + 1 < snapshot.items.length
    ) {
      return {
        completedItem: null,
        snapshot: {
          ...snapshot,
          queuePosition: snapshot.queuePosition + 1,
        },
      };
    }
    const first = snapshot.items[0];
    return {
      completedItem: null,
      snapshot: {
        ...snapshot,
        phase: first === undefined ? 'complete' : 'quiz',
        queuePosition: 0,
        quizState: {
          ...snapshot.quizState,
          currentPrompt:
            first === undefined
              ? null
              : firstStudyPrompt(
                  subjectTypes[first.subjectId],
                  options.questionOrder,
                  first.subjectId,
                ),
          currentSubjectId: first?.subjectId ?? null,
          questionProgress: {},
        },
      },
    };
  }
  if (
    snapshot.phase !== 'quiz' ||
    snapshot.quizState.currentSubjectId === null ||
    snapshot.quizState.currentPrompt === null
  ) {
    return { completedItem: null, snapshot };
  }
  if (event.type === 'incorrect') {
    return {
      completedItem: null,
      snapshot: recordIncorrect(snapshot),
    };
  }
  if (
    !['correct', 'override-correct', 'continue-incorrect', 'skip'].includes(
      event.type,
    )
  )
    return { completedItem: null, snapshot };
  const currentSubjectId = snapshot.quizState.currentSubjectId;
  const key =
    snapshot.quizState.currentPrompt === 'meaning'
      ? 'incorrectMeaningBySubject'
      : 'incorrectReadingBySubject';
  const quizState =
    event.type === 'override-correct'
      ? {
          ...snapshot.quizState,
          [key]: {
            ...snapshot.quizState[key],
            [currentSubjectId]: Math.max(
              0,
              (snapshot.quizState[key][currentSubjectId] ?? 0) - 1,
            ),
          },
        }
      : snapshot.quizState;
  const progress =
    quizState.questionProgress ??
    (quizState.currentPrompt === 'reading'
      ? { answeredMeaningSubjectIds: [currentSubjectId] }
      : {});
  const next = advanceStudyQuestion({
    items: snapshot.items,
    position: snapshot.queuePosition,
    prompt: quizState.currentPrompt,
    progress,
    types: subjectTypes,
    options,
    event:
      event.type === 'continue-incorrect'
        ? 'retry'
        : event.type === 'skip'
          ? 'skip'
          : 'correct',
  });
  const completedItem =
    next.completedSubjectId === null
      ? null
      : (snapshot.items[snapshot.queuePosition] ?? null);
  const completedSubjectIds =
    completedItem === null
      ? quizState.completedSubjectIds
      : [...quizState.completedSubjectIds, currentSubjectId];
  return {
    completedItem,
    snapshot: {
      ...snapshot,
      items: next.items,
      phase: next.prompt === null ? 'complete' : 'quiz',
      queuePosition: next.position,
      quizState: {
        ...quizState,
        questionProgress: next.progress,
        completedSubjectIds,
        currentPrompt: next.prompt,
        currentSubjectId: next.items[next.position]?.subjectId ?? null,
      },
    },
  };
}

function recordIncorrect(
  snapshot: LessonSessionSnapshot,
): LessonSessionSnapshot {
  const subjectId = String(snapshot.quizState.currentSubjectId);
  const prompt = snapshot.quizState.currentPrompt as LessonPrompt;
  const key =
    prompt === 'meaning'
      ? 'incorrectMeaningBySubject'
      : 'incorrectReadingBySubject';
  const previous = snapshot.quizState[key];
  return {
    ...snapshot,
    quizState: {
      ...snapshot.quizState,
      [key]: {
        ...previous,
        [subjectId]: (previous[subjectId] ?? 0) + 1,
      },
    },
  };
}
