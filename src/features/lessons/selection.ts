// Copyright 2025 David Sansome
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
// Modified by Taatoru from Tsurukame's LessonPickerViewController.swift at
// revision 8e18ddf7f12c44e91cb0ad63bab31af7440648ea.

import type {
  LessonCandidate,
  LessonLevelGroup,
  LessonSubjectType,
  LessonTypeGroup,
} from './types';

const SUBJECT_TYPE_ORDER: readonly LessonSubjectType[] = [
  'radical',
  'kanji',
  'vocabulary',
  'kana_vocabulary',
];

export function groupLessonCandidates(
  candidates: readonly LessonCandidate[],
): readonly LessonLevelGroup[] {
  const levels = new Map<number, Map<LessonSubjectType, LessonCandidate[]>>();
  for (const candidate of availableCandidates(candidates)) {
    let sections = levels.get(candidate.level);
    if (sections === undefined) {
      sections = new Map();
      levels.set(candidate.level, sections);
    }
    const items = sections.get(candidate.subjectType) ?? [];
    items.push(candidate);
    sections.set(candidate.subjectType, items);
  }
  return [...levels]
    .sort(([left], [right]) => left - right)
    .map(([level, sections]) => ({
      level,
      sections: SUBJECT_TYPE_ORDER.flatMap((subjectType) => {
        const items = sections.get(subjectType);
        return items === undefined
          ? []
          : [
              {
                subjectType,
                items: [...items].sort(compareDisplayOrder),
              } satisfies LessonTypeGroup,
            ];
      }),
    }));
}

export class LessonSelection {
  private candidates: readonly LessonCandidate[] = [];
  private availableIds = new Set<number>();
  private readonly selected = new Set<number>();

  constructor(
    candidates: readonly LessonCandidate[],
    restoredIds: readonly number[] = [],
    private readonly maximum = Number.POSITIVE_INFINITY,
  ) {
    this.revalidate(candidates);
    for (const subjectId of restoredIds) {
      if (this.availableIds.has(subjectId) && !this.atLimit) {
        this.selected.add(subjectId);
      }
    }
  }

  get canBegin(): boolean {
    return this.selected.size > 0;
  }

  get selectedCount(): number {
    return this.selected.size;
  }

  get atLimit(): boolean {
    return this.selected.size >= this.maximum;
  }

  get selectedIds(): readonly number[] {
    return this.candidates
      .filter(({ subjectId }) => this.selected.has(subjectId))
      .map(({ subjectId }) => subjectId);
  }

  get selectedCandidates(): readonly LessonCandidate[] {
    return this.candidates.filter(({ subjectId }) =>
      this.selected.has(subjectId),
    );
  }

  isSelected(subjectId: number): boolean {
    return this.selected.has(subjectId);
  }

  toggle(subjectId: number): void {
    if (!this.availableIds.has(subjectId)) {
      return;
    }
    if (this.selected.has(subjectId)) {
      this.selected.delete(subjectId);
    } else if (!this.atLimit) {
      this.selected.add(subjectId);
    }
  }

  select(subjectIds: readonly number[]): void {
    const requestedIds = new Set(subjectIds);
    for (const { subjectId } of this.candidates) {
      if (this.atLimit) break;
      if (requestedIds.has(subjectId)) this.selected.add(subjectId);
    }
  }

  deselect(subjectIds: readonly number[]): void {
    for (const subjectId of subjectIds) this.selected.delete(subjectId);
  }

  revalidate(candidates: readonly LessonCandidate[]): void {
    this.candidates = groupLessonCandidates(candidates).flatMap(
      ({ sections }) => sections.flatMap(({ items }) => items),
    );
    this.availableIds = new Set(
      this.candidates.map(({ subjectId }) => subjectId),
    );
    for (const subjectId of this.selected) {
      if (!this.availableIds.has(subjectId)) {
        this.selected.delete(subjectId);
      }
    }
  }
}

function availableCandidates(
  candidates: readonly LessonCandidate[],
): readonly LessonCandidate[] {
  return candidates.filter(
    (candidate) => candidate.available && !candidate.excluded,
  );
}

function compareDisplayOrder(
  left: LessonCandidate,
  right: LessonCandidate,
): number {
  return (
    left.lessonPosition - right.lessonPosition ||
    left.subjectId - right.subjectId ||
    left.assignmentId - right.assignmentId
  );
}
