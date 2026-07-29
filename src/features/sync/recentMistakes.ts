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
// Modified by Taatoru from Tsurukame's RecentMistakeHandler.swift at revision
// 8e18ddf7f12c44e91cb0ad63bab31af7440648ea.

import type { RecentMistake } from './types';

const RECENT_MISTAKE_WINDOW_MS = 24 * 60 * 60 * 1_000;

export function mergeRecentMistakes(
  original: readonly RecentMistake[],
  other: readonly RecentMistake[],
  now: Date,
): readonly RecentMistake[] {
  const cutoff = now.getTime() - RECENT_MISTAKE_WINDOW_MS;
  const newestBySubject = new Map<number, RecentMistake>();

  for (const mistake of [...original, ...other]) {
    const timestamp = Date.parse(mistake.mistakenAt);
    if (!Number.isFinite(timestamp) || timestamp < cutoff) {
      continue;
    }

    const existing = newestBySubject.get(mistake.subjectId);
    if (
      existing === undefined ||
      timestamp > Date.parse(existing.mistakenAt)
    ) {
      newestBySubject.set(mistake.subjectId, mistake);
    }
  }

  return [...newestBySubject.values()].sort(
    (left, right) => left.subjectId - right.subjectId,
  );
}
