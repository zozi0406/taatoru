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
  readonly rateLimitLimit: string | null;
  readonly rateLimitRemaining: string | null;
  readonly rateLimitReset: string | null;
  readonly requestStartedAtMs: number;
  readonly responseReceivedAtMs: number;
}

interface ServerBudget {
  readonly limit: number;
  readonly remaining: number;
  readonly resetAtMs: number;
}

export class RateLimitTracker {
  private readonly now: () => number;
  private lastServerMinute: number | null = null;
  private requestCount = 0;
  private clockSkewMs = 0;
  private serverBudget: ServerBudget | null = null;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  recordResponse(timing: ResponseTiming): void {
    const serverDateMs =
      timing.serverDate === null ? NaN : Date.parse(timing.serverDate);
    const hasValidServerDate = Number.isFinite(serverDateMs);
    if (hasValidServerDate) {
      const roundTripMs = Math.max(
        0,
        timing.responseReceivedAtMs - timing.requestStartedAtMs,
      );
      this.clockSkewMs =
        serverDateMs + roundTripMs / 2 - timing.responseReceivedAtMs;

      const serverMinute = Math.floor(serverDateMs / MINUTE_MS);
      if (serverMinute !== this.lastServerMinute) {
        this.lastServerMinute = serverMinute;
        this.requestCount = 0;
      }
      this.requestCount += 1;
    }

    const reportedBudget = parseServerBudget(timing);
    if (reportedBudget !== null && !hasValidServerDate) {
      this.clockSkewMs = 0;
    }
    const estimatedServerNow =
      timing.responseReceivedAtMs + this.clockSkewMs;
    const activeBudget =
      this.serverBudget !== null &&
      this.serverBudget.resetAtMs > estimatedServerNow
        ? this.serverBudget
        : null;
    if (reportedBudget !== null) {
      if (
        reportedBudget.resetAtMs <= estimatedServerNow ||
        (activeBudget !== null &&
          reportedBudget.resetAtMs < activeBudget.resetAtMs)
      ) {
        return;
      }
      if (
        activeBudget === null ||
        reportedBudget.resetAtMs > activeBudget.resetAtMs ||
        reportedBudget.limit !== activeBudget.limit
      ) {
        this.serverBudget = reportedBudget;
      } else {
        this.serverBudget = {
          ...activeBudget,
          remaining: Math.min(
            activeBudget.remaining,
            reportedBudget.remaining,
          ),
        };
      }
    } else if (activeBudget !== null) {
      this.serverBudget = {
        ...activeBudget,
        remaining: Math.max(0, activeBudget.remaining - 1),
      };
    }
  }

  get snapshot(): RateLimitSnapshot {
    const estimatedServerNow = this.now() + this.clockSkewMs;
    if (this.serverBudget !== null) {
      if (estimatedServerNow < this.serverBudget.resetAtMs) {
        return {
          limit: this.serverBudget.limit,
          requestsInServerMinute:
            this.serverBudget.limit - this.serverBudget.remaining,
          requestsRemaining: this.serverBudget.remaining,
          resetAfterMs: Math.max(
            0,
            this.serverBudget.resetAtMs - estimatedServerNow,
          ),
          estimatedClockSkewMs: this.clockSkewMs,
        };
      }
      this.serverBudget = null;
      this.lastServerMinute = null;
      this.requestCount = 0;
    }

    if (this.lastServerMinute === null) {
      return {
        limit: RATE_LIMIT,
        requestsInServerMinute: 0,
        requestsRemaining: RATE_LIMIT,
        resetAfterMs: 0,
        estimatedClockSkewMs: this.clockSkewMs,
      };
    }

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

function parseServerBudget({
  rateLimitLimit,
  rateLimitRemaining,
  rateLimitReset,
}: ResponseTiming): ServerBudget | null {
  const limit = parseNonNegativeInteger(rateLimitLimit);
  const remaining = parseNonNegativeInteger(rateLimitRemaining);
  const resetSeconds = parseNonNegativeInteger(rateLimitReset);
  if (
    limit === null ||
    limit === 0 ||
    remaining === null ||
    remaining > limit ||
    resetSeconds === null ||
    resetSeconds > Number.MAX_SAFE_INTEGER / 1000
  ) {
    return null;
  }
  return { limit, remaining, resetAtMs: resetSeconds * 1000 };
}

function parseNonNegativeInteger(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
