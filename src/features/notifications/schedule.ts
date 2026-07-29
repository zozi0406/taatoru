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
// Modified by Taatoru from Tsurukame's AppDelegate.swift at revision
// 8e18ddf7f12c44e91cb0ad63bab31af7440648ea.

export interface ReviewNotificationInput {
  readonly alerts: boolean;
  readonly badges: boolean;
  readonly currentReviewCount: number;
  readonly hourlyNewCounts: readonly number[];
  readonly now: Date;
  readonly sound: boolean;
  readonly vacationActive: boolean;
}

export interface ScheduledReviewNotification {
  readonly badge: number | null;
  readonly body: string | null;
  readonly cumulativeCount: number;
  readonly id: string;
  readonly newCount: number;
  readonly sound: boolean;
  readonly triggerAt: string;
}

const MAX_NOTIFICATIONS = 64;

export function buildReviewNotificationSchedule(
  input: ReviewNotificationInput,
): readonly ScheduledReviewNotification[] {
  if (input.vacationActive || (!input.alerts && !input.badges)) {
    return [];
  }
  const firstHour = new Date(input.now);
  firstHour.setMinutes(0, 0, 0);
  firstHour.setHours(firstHour.getHours() + 1);
  let cumulativeCount = input.currentReviewCount;
  const schedule: ScheduledReviewNotification[] = [];
  for (
    let hour = 0;
    hour < input.hourlyNewCounts.length &&
    schedule.length < MAX_NOTIFICATIONS;
    hour += 1
  ) {
    const newCount = input.hourlyNewCounts[hour] ?? 0;
    if (newCount <= 0) {
      continue;
    }
    cumulativeCount += newCount;
    const trigger = new Date(firstHour.getTime() + hour * 3_600_000);
    schedule.push({
      id: `reviews-hour-${hour}`,
      triggerAt: trigger.toISOString(),
      newCount,
      cumulativeCount,
      body: input.alerts
        ? `${cumulativeCount} review${cumulativeCount === 1 ? '' : 's'} available (${newCount} new)`
        : null,
      badge: input.badges ? cumulativeCount : null,
      sound: input.sound,
    });
  }
  return schedule;
}
