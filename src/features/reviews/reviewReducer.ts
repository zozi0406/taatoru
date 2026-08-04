import type { SubjectObject } from '@/api/types';
import type {
  CompletedReviewItem,
  ReviewSessionSnapshot,
} from './ReviewSessionRepository';

export type ReviewEvent =
  | { readonly type: 'correct' }
  | { readonly type: 'incorrect' };

export interface ReviewTransition {
  readonly completedItem: CompletedReviewItem | null;
  readonly snapshot: ReviewSessionSnapshot;
}

export function reduceReview(
  snapshot: ReviewSessionSnapshot,
  event: ReviewEvent,
  subjectTypes: Readonly<Record<number, SubjectObject>>,
): ReviewTransition {
  const item = snapshot.items[snapshot.queuePosition];
  if (
    snapshot.phase !== 'active' ||
    snapshot.currentPrompt === null ||
    item === undefined
  ) {
    return { completedItem: null, snapshot };
  }
  if (event.type === 'incorrect') {
    const key =
      snapshot.currentPrompt === 'meaning'
        ? 'incorrectMeaningBySubject'
        : 'incorrectReadingBySubject';
    return {
      completedItem: null,
      snapshot: {
        ...snapshot,
        [key]: {
          ...snapshot[key],
          [item.subjectId]: (snapshot[key][item.subjectId] ?? 0) + 1,
        },
      },
    };
  }
  if (
    snapshot.currentPrompt === 'meaning' &&
    requiresReading(subjectTypes[item.subjectId])
  ) {
    return {
      completedItem: null,
      snapshot: { ...snapshot, currentPrompt: 'reading' },
    };
  }

  const nextPosition = snapshot.queuePosition + 1;
  const complete = nextPosition >= snapshot.items.length;
  return {
    completedItem: {
      ...item,
      incorrectMeaningAnswers:
        snapshot.incorrectMeaningBySubject[item.subjectId] ?? 0,
      incorrectReadingAnswers:
        snapshot.incorrectReadingBySubject[item.subjectId] ?? 0,
    },
    snapshot: {
      ...snapshot,
      currentPrompt: complete ? null : 'meaning',
      phase: complete ? 'complete' : 'active',
      queuePosition: nextPosition,
    },
  };
}

function requiresReading(subjectType: SubjectObject | undefined): boolean {
  return subjectType === 'kanji' || subjectType === 'vocabulary';
}
