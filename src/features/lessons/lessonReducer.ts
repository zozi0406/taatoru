import type { SubjectObject } from '@/api/types';
import type {
  LessonPrompt,
  LessonSessionItem,
  LessonSessionSnapshot,
} from '@/features/sessions/SessionRepository';

export type LessonEvent =
  | { readonly type: 'advance-presentation' }
  | { readonly type: 'correct' }
  | { readonly type: 'incorrect' };

export interface LessonTransition {
  readonly completedItem: LessonSessionItem | null;
  readonly snapshot: LessonSessionSnapshot;
}

export function reduceLesson(
  snapshot: LessonSessionSnapshot,
  event: LessonEvent,
  subjectTypes: Readonly<Record<number, SubjectObject>>,
): LessonTransition {
  if (
    event.type === 'advance-presentation' &&
    snapshot.phase === 'presentation'
  ) {
    if (snapshot.queuePosition + 1 < snapshot.items.length) {
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
          currentPrompt: first === undefined ? null : 'meaning',
          currentSubjectId: first?.subjectId ?? null,
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
  if (event.type !== 'correct') {
    return { completedItem: null, snapshot };
  }

  const currentSubjectId = snapshot.quizState.currentSubjectId;
  const currentType = subjectTypes[currentSubjectId];
  if (
    snapshot.quizState.currentPrompt === 'meaning' &&
    requiresReading(currentType)
  ) {
    return {
      completedItem: null,
      snapshot: {
        ...snapshot,
        quizState: {
          ...snapshot.quizState,
          currentPrompt: 'reading',
        },
      },
    };
  }

  const completedItem =
    snapshot.items.find(({ subjectId }) => subjectId === currentSubjectId) ??
    null;
  const completedSubjectIds = [
    ...snapshot.quizState.completedSubjectIds,
    currentSubjectId,
  ];
  const nextIndex = snapshot.items.findIndex(
    ({ subjectId }) => !completedSubjectIds.includes(subjectId),
  );
  const next = nextIndex < 0 ? undefined : snapshot.items[nextIndex];
  return {
    completedItem,
    snapshot: {
      ...snapshot,
      phase: next === undefined ? 'complete' : 'quiz',
      queuePosition:
        next === undefined ? snapshot.items.length : nextIndex,
      quizState: {
        ...snapshot.quizState,
        completedSubjectIds,
        currentPrompt: next === undefined ? null : 'meaning',
        currentSubjectId: next?.subjectId ?? null,
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

function requiresReading(subjectType: SubjectObject | undefined): boolean {
  return subjectType === 'kanji' || subjectType === 'vocabulary';
}
