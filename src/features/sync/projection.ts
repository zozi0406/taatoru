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
// Modified by Taatoru from Tsurukame's LocalCachingClient.swift and
// WaniKaniAPI/ProtobufExtensions.swift at revision
// 8e18ddf7f12c44e91cb0ad63bab31af7440648ea.

import type { SrsProjection, SrsProjectionInput } from './types';

const MIN_STARTED_SRS_STAGE = 1;
const MAX_SRS_STAGE = 9;

export function projectSrsStage({
  kind,
  currentSrsStage,
  incorrectMeaningAnswers,
  incorrectReadingAnswers,
  now,
}: SrsProjectionInput): SrsProjection {
  assertIntegerInRange(
    currentSrsStage,
    0,
    MAX_SRS_STAGE,
    'currentSrsStage',
  );
  assertNonNegativeInteger(
    incorrectMeaningAnswers,
    'incorrectMeaningAnswers',
  );
  assertNonNegativeInteger(
    incorrectReadingAnswers,
    'incorrectReadingAnswers',
  );

  const hasMistake =
    kind === 'review' &&
    (incorrectMeaningAnswers > 0 || incorrectReadingAnswers > 0);
  const stageDelta = hasMistake ? -1 : 1;
  const srsStage = Math.min(
    MAX_SRS_STAGE,
    Math.max(MIN_STARTED_SRS_STAGE, currentSrsStage + stageDelta),
  );

  return {
    srsStage,
    lastMistakeAt: hasMistake ? now.toISOString() : null,
  };
}

function assertIntegerInRange(
  value: number,
  minimum: number,
  maximum: number,
  name: string,
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(
      `${name} must be an integer from ${minimum} through ${maximum}`,
    );
  }
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer`);
  }
}
