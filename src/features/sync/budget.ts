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
// Modified by Taatoru from Tsurukame's LocalCachingClient.swift at revision
// 8e18ddf7f12c44e91cb0ad63bab31af7440648ea.

import type {
  PendingWriteBudget,
  SelectedPendingWrites,
} from './types';

export function selectPendingWrites({
  requestsRemaining,
  assignmentUnits,
  subjectUnits,
  fixedUnits,
  progressIds,
  studyMaterialIds,
}: PendingWriteBudget): SelectedPendingWrites {
  const writeCapacity = Math.max(
    0,
    Math.floor(requestsRemaining) -
      Math.ceil(assignmentUnits) -
      Math.ceil(subjectUnits) -
      Math.ceil(fixedUnits),
  );
  const selectedProgressIds = progressIds.slice(0, writeCapacity);
  const studyMaterialCapacity = writeCapacity - selectedProgressIds.length;

  return {
    progressIds: selectedProgressIds,
    studyMaterialIds: studyMaterialIds.slice(0, studyMaterialCapacity),
  };
}
