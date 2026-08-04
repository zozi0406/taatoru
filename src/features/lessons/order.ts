// Copyright 2026 David Sansome
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
//
// Modified by Taatoru from Tsurukame's ReviewItem.swift at revision
// 8e18ddf7f12c44e91cb0ad63bab31af7440648ea.

import type { LessonCandidate, LessonSubjectType } from './types';

export interface AutomaticLessonOptions {
  readonly apprenticeCount: number;
  readonly apprenticeLimit: number;
  readonly batchSize: number;
  readonly currentLevel: number;
  readonly prioritizeCurrentLevel: boolean;
  readonly showKanaVocabulary: boolean;
  readonly subjectOrder: readonly LessonSubjectType[];
}

export function buildAutomaticLessonQueue(
  candidates: readonly LessonCandidate[],
  options: AutomaticLessonOptions,
): readonly LessonCandidate[] {
  const capacity = remainingCapacity(options);
  if (capacity === 0) {
    return [];
  }
  return candidates
    .filter(
      (candidate) =>
        candidate.available &&
        !candidate.excluded &&
        (options.showKanaVocabulary ||
          candidate.subjectType !== 'kana_vocabulary'),
    )
    .sort((left, right) => compareLessons(left, right, options))
    .slice(0, capacity);
}

function compareLessons(
  left: LessonCandidate,
  right: LessonCandidate,
  options: AutomaticLessonOptions,
): number {
  const levelDifference = compareLevels(left.level, right.level, options);
  if (levelDifference !== 0) {
    return levelDifference;
  }
  const typeDifference =
    subjectTypeIndex(left.subjectType, options.subjectOrder) -
    subjectTypeIndex(right.subjectType, options.subjectOrder);
  if (typeDifference !== 0) {
    return typeDifference;
  }
  return (
    left.lessonPosition - right.lessonPosition ||
    left.subjectId - right.subjectId ||
    left.assignmentId - right.assignmentId
  );
}

function compareLevels(
  left: number,
  right: number,
  options: AutomaticLessonOptions,
): number {
  if (!options.prioritizeCurrentLevel) {
    return left - right;
  }
  if (left === options.currentLevel && right !== options.currentLevel) {
    return -1;
  }
  if (right === options.currentLevel && left !== options.currentLevel) {
    return 1;
  }
  return right - left;
}

function subjectTypeIndex(
  subjectType: LessonSubjectType,
  order: readonly LessonSubjectType[],
): number {
  const exactIndex = order.indexOf(subjectType);
  if (exactIndex >= 0) {
    return exactIndex;
  }
  if (subjectType === 'kana_vocabulary') {
    const vocabularyIndex = order.indexOf('vocabulary');
    if (vocabularyIndex >= 0) {
      return vocabularyIndex;
    }
  }
  return order.length;
}

function remainingCapacity(options: AutomaticLessonOptions): number {
  const batchSize = nonNegativeInteger(options.batchSize);
  const apprenticeSlots = Number.isFinite(options.apprenticeLimit)
    ? nonNegativeInteger(options.apprenticeLimit - options.apprenticeCount)
    : Number.POSITIVE_INFINITY;
  return Math.min(batchSize, apprenticeSlots);
}

function nonNegativeInteger(value: number): number {
  return Math.max(0, Math.floor(value));
}
