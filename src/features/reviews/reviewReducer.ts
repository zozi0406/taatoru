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
  CompletedReviewItem,
  ReviewSessionSnapshot,
} from './ReviewSessionRepository';

export type ReviewEvent =
  | { readonly type: 'correct' }
  | { readonly type: 'incorrect' }
  | { readonly type: 'continue-incorrect' }
  | { readonly type: 'override-correct' }
  | { readonly type: 'skip' }
  | { readonly type: 'wrap-up' };

export interface ReviewTransition {
  readonly completedItem: CompletedReviewItem | null;
  readonly snapshot: ReviewSessionSnapshot;
}

export function reduceReview(
  snapshot: ReviewSessionSnapshot,
  event: ReviewEvent,
  subjectTypes: Readonly<Record<number, SubjectObject>>,
  options: StudySettings = DEFAULT_STUDY_SETTINGS,
): ReviewTransition {
  const item = snapshot.items[snapshot.queuePosition];
  if (
    snapshot.phase !== 'active' ||
    snapshot.currentPrompt === null ||
    item === undefined
  ) {
    return { completedItem: null, snapshot };
  }
  if (event.type === 'wrap-up') {
    return {
      completedItem: null,
      snapshot: wrapUpReviews(snapshot, subjectTypes, options),
    };
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
  const key =
    snapshot.currentPrompt === 'meaning'
      ? 'incorrectMeaningBySubject'
      : 'incorrectReadingBySubject';
  const counts =
    event.type === 'override-correct'
      ? {
          ...snapshot[key],
          [item.subjectId]: Math.max(
            0,
            (snapshot[key][item.subjectId] ?? 0) - 1,
          ),
        }
      : snapshot[key];
  const adjusted = { ...snapshot, [key]: counts };
  if (event.type === 'skip') {
    adjusted.incorrectMeaningBySubject = Object.fromEntries(
      Object.entries(adjusted.incorrectMeaningBySubject).filter(
        ([id]) => Number(id) !== item.subjectId,
      ),
    );
    adjusted.incorrectReadingBySubject = Object.fromEntries(
      Object.entries(adjusted.incorrectReadingBySubject).filter(
        ([id]) => Number(id) !== item.subjectId,
      ),
    );
  }
  // Older sessions always asked meaning first and stored no completed-half state.
  const progress =
    snapshot.questionProgress ??
    (snapshot.currentPrompt === 'reading'
      ? { answeredMeaningSubjectIds: [item.subjectId] }
      : {});
  const next = advanceStudyQuestion({
    items: snapshot.items,
    position: snapshot.queuePosition,
    prompt: snapshot.currentPrompt,
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
  const complete = next.position >= next.items.length;
  const updated: ReviewSessionSnapshot = {
    ...adjusted,
    items: next.items,
    questionProgress: next.progress,
    currentPrompt: next.prompt,
    phase: complete ? 'complete' : 'active',
    queuePosition: next.position,
  };
  return {
    completedItem:
      next.completedSubjectId === null
        ? null
        : {
            ...item,
            incorrectMeaningAnswers:
              adjusted.incorrectMeaningBySubject[item.subjectId] ?? 0,
            incorrectReadingAnswers:
              adjusted.incorrectReadingBySubject[item.subjectId] ?? 0,
          },
    snapshot:
      snapshot.wrappingUp && event.type === 'skip'
        ? wrapUpReviews(updated, subjectTypes, options)
        : updated,
  };
}

/** Keep only subjects with persisted attempts; simply viewing a prompt is not an attempt. */
function wrapUpReviews(
  snapshot: ReviewSessionSnapshot,
  types: Readonly<Record<number, SubjectObject>>,
  options: StudySettings,
): ReviewSessionSnapshot {
  const current = snapshot.items[snapshot.queuePosition];
  const progress = snapshot.questionProgress ?? {
    answeredMeaningSubjectIds:
      snapshot.currentPrompt === 'reading' && current !== undefined
        ? [current.subjectId] : [],
  };
  const meanings = new Set(progress.answeredMeaningSubjectIds ?? []);
  const readings = new Set(progress.answeredReadingSubjectIds ?? []);
  const remaining = snapshot.items.slice(snapshot.queuePosition).filter(
    ({ subjectId }) =>
      meanings.has(subjectId) || readings.has(subjectId) ||
      (snapshot.incorrectMeaningBySubject[subjectId] ?? 0) > 0 ||
      (snapshot.incorrectReadingBySubject[subjectId] ?? 0) > 0,
  );
  const next = remaining[0];
  return {
    ...snapshot,
    wrappingUp: true,
    questionProgress: progress,
    items: [...snapshot.items.slice(0, snapshot.queuePosition), ...remaining],
    phase: next === undefined ? 'complete' : 'active',
    currentPrompt:
      next === undefined ? null
        : meanings.has(next.subjectId) ? 'reading'
          : readings.has(next.subjectId) ? 'meaning'
            : firstStudyPrompt(
                types[next.subjectId], options.questionOrder, next.subjectId,
              ),
  };
}
