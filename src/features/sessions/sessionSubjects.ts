// Copyright 2026 Taatoru contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import type { SubjectResource } from '@/api/types';
import type { ReviewSessionSnapshot } from '@/features/reviews/ReviewSessionRepository';
import type { LessonSessionSnapshot } from './SessionRepository';

export function reconcileLessonSession(
  snapshot: LessonSessionSnapshot,
  subjects: readonly SubjectResource[],
): LessonSessionSnapshot | null {
  const accessibleIds = subjectIds(subjects);
  const items = snapshot.items.filter(({ subjectId }) =>
    accessibleIds.has(subjectId),
  );
  if (items.length === snapshot.items.length) {
    return snapshot;
  }
  if (items.length === 0) {
    return null;
  }

  const completedSubjectIds = snapshot.quizState.completedSubjectIds.filter(
    (subjectId) => accessibleIds.has(subjectId),
  );
  const quizState = {
    ...snapshot.quizState,
    completedSubjectIds,
    incorrectMeaningBySubject: filterCounts(
      snapshot.quizState.incorrectMeaningBySubject,
      accessibleIds,
    ),
    incorrectReadingBySubject: filterCounts(
      snapshot.quizState.incorrectReadingBySubject,
      accessibleIds,
    ),
  };
  if (snapshot.phase === 'complete') {
    return {
      ...snapshot,
      items,
      queuePosition: items.length,
      quizState: {
        ...quizState,
        currentPrompt: null,
        currentSubjectId: null,
      },
    };
  }
  if (snapshot.phase === 'presentation') {
    const nextOriginalIndex = snapshot.items.findIndex(
      ({ subjectId }, index) =>
        index >= snapshot.queuePosition && accessibleIds.has(subjectId),
    );
    if (nextOriginalIndex >= 0) {
      return {
        ...snapshot,
        items,
        queuePosition: countAccessibleBefore(
          snapshot,
          nextOriginalIndex,
          accessibleIds,
        ),
        quizState,
      };
    }
    return {
      ...snapshot,
      items,
      phase: 'quiz',
      queuePosition: 0,
      quizState: {
        ...quizState,
        currentPrompt: 'meaning',
        currentSubjectId: items[0]!.subjectId,
      },
    };
  }
  if (snapshot.phase === 'selection') {
    return { ...snapshot, items, queuePosition: 0, quizState };
  }

  const currentSubjectId = snapshot.quizState.currentSubjectId;
  const retainCurrent =
    currentSubjectId !== null &&
    accessibleIds.has(currentSubjectId) &&
    !completedSubjectIds.includes(currentSubjectId);
  const next = retainCurrent
    ? items.find(({ subjectId }) => subjectId === currentSubjectId)
    : items.find(
        ({ subjectId }) => !completedSubjectIds.includes(subjectId),
      );
  if (next === undefined) {
    return {
      ...snapshot,
      items,
      phase: 'complete',
      queuePosition: items.length,
      quizState: {
        ...quizState,
        currentPrompt: null,
        currentSubjectId: null,
      },
    };
  }
  return {
    ...snapshot,
    items,
    queuePosition: items.indexOf(next),
    quizState: {
      ...quizState,
      currentPrompt: retainCurrent
        ? (snapshot.quizState.currentPrompt ?? 'meaning')
        : 'meaning',
      currentSubjectId: next.subjectId,
    },
  };
}

export function reconcileReviewSession(
  snapshot: ReviewSessionSnapshot,
  subjects: readonly SubjectResource[],
): ReviewSessionSnapshot | null {
  const accessibleIds = subjectIds(subjects);
  const items = snapshot.items.filter(({ subjectId }) =>
    accessibleIds.has(subjectId),
  );
  if (items.length === snapshot.items.length) {
    return snapshot;
  }
  if (items.length === 0) {
    return null;
  }

  const current = snapshot.items[snapshot.queuePosition];
  const retainCurrent =
    current !== undefined && accessibleIds.has(current.subjectId);
  const queuePosition = snapshot.items
    .slice(0, snapshot.queuePosition)
    .filter(({ subjectId }) => accessibleIds.has(subjectId)).length;
  const complete =
    snapshot.phase === 'complete' || queuePosition >= items.length;
  return {
    ...snapshot,
    items,
    currentPrompt: complete
      ? null
      : retainCurrent
        ? (snapshot.currentPrompt ?? 'meaning')
        : 'meaning',
    incorrectMeaningBySubject: filterCounts(
      snapshot.incorrectMeaningBySubject,
      accessibleIds,
    ),
    incorrectReadingBySubject: filterCounts(
      snapshot.incorrectReadingBySubject,
      accessibleIds,
    ),
    phase: complete ? 'complete' : 'active',
    queuePosition: complete ? items.length : queuePosition,
  };
}

function subjectIds(subjects: readonly SubjectResource[]): Set<number> {
  return new Set(
    subjects.flatMap(({ id }) => (id === undefined ? [] : [id])),
  );
}

function filterCounts(
  counts: Readonly<Record<string, number>>,
  accessibleIds: ReadonlySet<number>,
): Readonly<Record<string, number>> {
  return Object.fromEntries(
    Object.entries(counts).filter(([subjectId]) =>
      accessibleIds.has(Number(subjectId)),
    ),
  );
}

function countAccessibleBefore(
  snapshot: LessonSessionSnapshot,
  index: number,
  accessibleIds: ReadonlySet<number>,
): number {
  return snapshot.items
    .slice(0, index)
    .filter(({ subjectId }) => accessibleIds.has(subjectId)).length;
}
