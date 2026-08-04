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
// Modified by Taatoru from Tsurukame's WaniKaniAPI/APIClient.swift at revision
// 8e18ddf7f12c44e91cb0ad63bab31af7440648ea.

import type { RateLimitSnapshot } from './WaniKaniApi';

const RATE_LIMIT = 60 as const;
const MINUTE_MS = 60_000;

interface ResponseTiming {
  readonly serverDate: string | null;
  readonly requestStartedAtMs: number;
  readonly responseReceivedAtMs: number;
}

export class RateLimitTracker {
  private readonly now: () => number;
  private lastServerMinute: number | null = null;
  private requestCount = 0;
  private clockSkewMs = 0;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  recordResponse({
    serverDate,
    requestStartedAtMs,
    responseReceivedAtMs,
  }: ResponseTiming): void {
    if (serverDate === null) {
      return;
    }

    const serverDateMs = Date.parse(serverDate);
    if (!Number.isFinite(serverDateMs)) {
      return;
    }

    const roundTripMs = Math.max(
      0,
      responseReceivedAtMs - requestStartedAtMs,
    );
    this.clockSkewMs =
      serverDateMs + roundTripMs / 2 - responseReceivedAtMs;

    const serverMinute = Math.floor(serverDateMs / MINUTE_MS);
    if (serverMinute !== this.lastServerMinute) {
      this.lastServerMinute = serverMinute;
      this.requestCount = 0;
    }
    this.requestCount += 1;
  }

  get snapshot(): RateLimitSnapshot {
    if (this.lastServerMinute === null) {
      return {
        limit: RATE_LIMIT,
        requestsInServerMinute: 0,
        requestsRemaining: RATE_LIMIT,
        resetAfterMs: 0,
        estimatedClockSkewMs: 0,
      };
    }

    const estimatedServerNow = this.now() + this.clockSkewMs;
    const currentServerMinute = Math.floor(estimatedServerNow / MINUTE_MS);
    if (currentServerMinute > this.lastServerMinute) {
      return {
        limit: RATE_LIMIT,
        requestsInServerMinute: 0,
        requestsRemaining: RATE_LIMIT,
        resetAfterMs: 0,
        estimatedClockSkewMs: this.clockSkewMs,
      };
    }

    const resetAfterMs =
      currentServerMinute < this.lastServerMinute
        ? MINUTE_MS
        : Math.max(
            0,
            (this.lastServerMinute + 1) * MINUTE_MS - estimatedServerNow,
          );

    return {
      limit: RATE_LIMIT,
      requestsInServerMinute: this.requestCount,
      requestsRemaining: Math.max(0, RATE_LIMIT - this.requestCount),
      resetAfterMs,
      estimatedClockSkewMs: this.clockSkewMs,
    };
  }
}
