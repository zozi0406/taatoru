# Server Rate-Limit Budgeting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. The user explicitly prohibited subagents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Taatoru's existing synchronization write budget use WaniKani's valid `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` response headers while retaining safe local fallback behavior.

**Architecture:** Keep rate-limit state inside `RateLimitTracker`, where the current server-date fallback already lives. `HttpWaniKaniApi` passes all documented rate headers from every response into the tracker before status handling; `SynchronizationEngine` continues consuming `api.rateLimit.requestsRemaining` through its existing budget seam.

**Tech Stack:** TypeScript 6, Expo SDK 57 fetch/`Response`, Jest 29, existing `RateLimitTracker` and `SynchronizationEngine`.

## Global Constraints

- Do not use subagents.
- Do not add conditional requests, persistent HTTP validators, or a database migration.
- Do not add a global request queue, sleeping, request cancellation, or pagination changes.
- Valid server headers are authoritative; absent or invalid headers retain conservative local fallback behavior.
- Record headers from success and error responses, but never from network failures without a response.
- Preserve `Retry-After` precedence and the existing `RateLimit-Reset` fallback for `429.retryAt`.
- Use Node 22 for every project command.
- Preserve unrelated dirty-tree changes and stage only the files named by each task.

---

### Task 1: Server-authoritative rate-limit tracker

**Files:**
- Modify: `src/api/WaniKaniApi.ts:14-20`
- Modify: `src/api/rateLimit.ts:17-108`
- Test: `src/api/__tests__/rateLimit.test.ts`

**Interfaces:**
- Consumes: raw response-header strings and existing request timing.
- Produces: `RateLimitTracker.recordResponse(timing: ResponseTiming): void`, where `ResponseTiming` additionally accepts `rateLimitLimit`, `rateLimitRemaining`, and `rateLimitReset`, each `string | null`.
- Produces: `RateLimitSnapshot.limit: number`; the other snapshot fields remain unchanged.

- [ ] **Step 1: Add failing tests for a valid authoritative budget and expiry**

Add focused tests that pass literal header values into the real tracker:

```ts
test('uses a complete server rate-limit budget until its reset', () => {
  let now = 10_000;
  const tracker = new RateLimitTracker(() => now);

  tracker.recordResponse({
    serverDate: 'Thu, 01 Jan 1970 00:00:10 GMT',
    rateLimitLimit: '120',
    rateLimitRemaining: '17',
    rateLimitReset: '20',
    requestStartedAtMs: 9_900,
    responseReceivedAtMs: 10_000,
  });

  expect(tracker.snapshot).toEqual({
    limit: 120,
    requestsInServerMinute: 103,
    requestsRemaining: 17,
    resetAfterMs: 9_950,
    estimatedClockSkewMs: 50,
  });

  now = 20_000;
  expect(tracker.snapshot).toEqual({
    limit: 60,
    requestsInServerMinute: 0,
    requestsRemaining: 60,
    resetAfterMs: 0,
    estimatedClockSkewMs: 50,
  });
});
```

The `9_950` expectation is hand-derived: server `Date` is 10,000 ms, half the
100 ms round trip produces 50 ms of positive skew, and reset is 20,000 ms.

- [ ] **Step 2: Run the tracker suite and verify RED**

Run:

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm test -- --runInBand src/api/__tests__/rateLimit.test.ts
```

Expected: FAIL because `recordResponse()` does not accept or use the three
rate-limit header fields and the snapshot still reports the local limit of 60.

- [ ] **Step 3: Generalize the public snapshot limit type**

Change only the literal type in `src/api/WaniKaniApi.ts`:

```ts
export interface RateLimitSnapshot {
  readonly limit: number;
  readonly requestsInServerMinute: number;
  readonly requestsRemaining: number;
  readonly resetAfterMs: number;
  readonly estimatedClockSkewMs: number;
}
```

- [ ] **Step 4: Implement strict header parsing and active server state**

Extend `ResponseTiming` and add one internal state object:

```ts
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
```

Add a parser that accepts only base-10 integer strings and validates the whole
set together:

```ts
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
  if (value === null || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
```

Refactor `recordResponse()` so valid `Date` values still update local minute
accounting, but invalid dates no longer return before rate headers are parsed.
For this first green cycle, a complete valid budget replaces an absent or
expired server budget and becomes the preferred snapshot. With no valid budget,
retain the existing local tracker result. The out-of-order and invalid-set
branches are added only after their failing tests in Steps 6 and 7.

In `snapshot`, prefer an unexpired server budget:

```ts
return {
  limit: budget.limit,
  requestsInServerMinute: budget.limit - budget.remaining,
  requestsRemaining: budget.remaining,
  resetAfterMs: Math.max(0, budget.resetAtMs - estimatedServerNow),
  estimatedClockSkewMs: this.clockSkewMs,
};
```

When its reset has passed, clear the server budget and return a fresh local
limit of 60 with zero used requests for that snapshot. Later responses can
re-establish either local counting or another authoritative server budget.

- [ ] **Step 5: Run the tracker suite and verify GREEN**

Run the Task 1 command again. Expected: all tracker tests pass.

- [ ] **Step 6: Add failing edge-case tests**

Add separate tests with literal expectations for:

```ts
test('does not let an out-of-order response restore remaining capacity', () => {
  const tracker = new RateLimitTracker(() => 10_000);
  tracker.recordResponse({
    serverDate: 'Thu, 01 Jan 1970 00:00:10 GMT',
    rateLimitLimit: '120',
    rateLimitRemaining: '16',
    rateLimitReset: '20',
    requestStartedAtMs: 9_900,
    responseReceivedAtMs: 10_000,
  });
  tracker.recordResponse({
    serverDate: 'Thu, 01 Jan 1970 00:00:10 GMT',
    rateLimitLimit: '120',
    rateLimitRemaining: '17',
    rateLimitReset: '20',
    requestStartedAtMs: 9_900,
    responseReceivedAtMs: 10_000,
  });

  expect(tracker.snapshot.requestsRemaining).toBe(16);
});

test.each([
  ['missing', null, '10', '20'],
  ['partial', '120', null, '20'],
  ['decimal', '120.5', '10', '20'],
  ['negative', '120', '-1', '20'],
  ['over limit', '120', '121', '20'],
] as const)(
  'uses local fallback for a %s server budget',
  (_name, limit, remaining, reset) => {
    const tracker = new RateLimitTracker(() => 10_000);
    tracker.recordResponse({
      serverDate: 'Thu, 01 Jan 1970 00:00:10 GMT',
      rateLimitLimit: limit,
      rateLimitRemaining: remaining,
      rateLimitReset: reset,
      requestStartedAtMs: 9_900,
      responseReceivedAtMs: 10_000,
    });

    expect(tracker.snapshot).toEqual({
      limit: 60,
      requestsInServerMinute: 1,
      requestsRemaining: 59,
      resetAfterMs: 49_950,
      estimatedClockSkewMs: 50,
    });
  },
);

test('an invalid header set conservatively consumes an active server budget', () => {
  const tracker = new RateLimitTracker(() => 10_000);
  tracker.recordResponse({
    serverDate: 'Thu, 01 Jan 1970 00:00:10 GMT',
    rateLimitLimit: '120',
    rateLimitRemaining: '17',
    rateLimitReset: '20',
    requestStartedAtMs: 9_900,
    responseReceivedAtMs: 10_000,
  });
  tracker.recordResponse({
    serverDate: 'Thu, 01 Jan 1970 00:00:10 GMT',
    rateLimitLimit: null,
    rateLimitRemaining: null,
    rateLimitReset: null,
    requestStartedAtMs: 9_900,
    responseReceivedAtMs: 10_000,
  });

  expect(tracker.snapshot.requestsRemaining).toBe(16);
});
```

- [ ] **Step 7: Run the edge-case tests and verify RED, then implement GREEN**

Run the Task 1 command. Expected initial failures: remaining capacity increases
on the out-of-order case and invalid sets do not conservatively consume the
active server budget. Implement these exact branches:

```ts
if (reportedBudget !== null) {
  if (
    activeBudget === null ||
    reportedBudget.resetAtMs > activeBudget.resetAtMs ||
    (reportedBudget.resetAtMs === activeBudget.resetAtMs &&
      reportedBudget.limit !== activeBudget.limit)
  ) {
    this.serverBudget = reportedBudget;
  } else if (reportedBudget.resetAtMs === activeBudget.resetAtMs) {
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
```

An earlier-reset report makes no change because it describes an older server
window. Rerun until the entire tracker suite passes.

- [ ] **Step 8: Commit Task 1**

```bash
git add src/api/WaniKaniApi.ts src/api/rateLimit.ts src/api/__tests__/rateLimit.test.ts
git commit -m "feat: track server rate-limit budgets"
```

---

### Task 2: HTTP response-header propagation

**Files:**
- Modify: `src/api/HttpWaniKaniApi.ts:350-365`
- Test: `src/api/__tests__/client.test.ts`

**Interfaces:**
- Consumes: the expanded `RateLimitTracker.recordResponse()` input from Task 1.
- Produces: `HttpWaniKaniApi.rateLimit` populated from real response headers on
  both success and HTTP error responses.

- [ ] **Step 1: Add a failing client test for successful responses**

Use the real client with a controlled `Response`:

```ts
test('updates its public budget from server rate-limit headers', async () => {
  const fetch = jest.fn().mockResolvedValue(
    jsonResponse(userFixture, {
      headers: {
        Date: 'Thu, 01 Jan 1970 00:00:10 GMT',
        'RateLimit-Limit': '120',
        'RateLimit-Remaining': '17',
        'RateLimit-Reset': '20',
      },
    }),
  );
  const api = new HttpWaniKaniApi({
    token: 'secret',
    fetch,
    now: () => 10_000,
  });

  await api.getUser();

  expect(api.rateLimit).toMatchObject({
    limit: 120,
    requestsInServerMinute: 103,
    requestsRemaining: 17,
  });
});
```

Also extend the existing `429` test's headers with a complete server budget
and assert after catching the `ApiError`:

```ts
expect(api.rateLimit).toMatchObject({
  limit: 60,
  requestsRemaining: 0,
});
```

Keep the existing assertion that `Retry-After: 30` produces `retryAt` at
31,000 ms even though `RateLimit-Reset` is also present.

- [ ] **Step 2: Run the client suite and verify RED**

Run:

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm test -- --runInBand src/api/__tests__/client.test.ts
```

Expected: both new assertions FAIL because `HttpWaniKaniApi.request()`
currently forwards only the `Date` header to the tracker.

- [ ] **Step 3: Forward the documented headers before status handling**

Extend the existing call without changing request order or error decoding:

```ts
this.rateLimitTracker.recordResponse({
  serverDate: response.headers.get('Date'),
  rateLimitLimit: response.headers.get('RateLimit-Limit'),
  rateLimitRemaining: response.headers.get('RateLimit-Remaining'),
  rateLimitReset: response.headers.get('RateLimit-Reset'),
  requestStartedAtMs,
  responseReceivedAtMs,
});
```

- [ ] **Step 4: Run the client suite and verify GREEN**

Run the Task 2 command again. Expected: all client tests pass.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/api/HttpWaniKaniApi.ts src/api/__tests__/client.test.ts
git commit -m "feat: consume WaniKani rate-limit headers"
```

---

### Task 3: API status and complete verification

**Files:**
- Modify: `docs/wanikani-api.md:60-110`

**Interfaces:**
- Consumes: verified behavior from Tasks 1 and 2.
- Produces: an accurate release-facing API status that distinguishes completed
  server budgeting from the excluded global scheduling and pagination work.

- [ ] **Step 1: Update the rate-limit status**

Keep the area status `Partial` and replace its evidence with the implemented
boundary:

```md
| Rate-limit handling | Partial | Taatoru reads valid `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` values from every response and uses the server's remaining count to budget pending writes, with local minute accounting as a safe fallback. A `429` prefers `Retry-After` and falls back to `RateLimit-Reset`. Global request scheduling and pagination pacing are not implemented. |
```

Remove the completed “read limit and remaining” item from required follow-up.
Do not remove the separately documented pagination-burst limitation. Update the
Jest count only after the full run reports the exact total.

- [ ] **Step 2: Run focused verification**

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm test -- --runInBand src/api/__tests__/rateLimit.test.ts src/api/__tests__/client.test.ts src/features/sync/__tests__/budget.test.ts src/features/sync/__tests__/engine.test.ts
```

Expected: all selected suites and tests pass with no warnings.

- [ ] **Step 3: Run static and secret checks**

```bash
git diff --check
! git grep -nE 'TAATORU_LIVE_TOKEN|Authorization: Bearer [[:alnum:]-]{20,}'
```

Expected: both commands exit 0 with no matching credential output.

- [ ] **Step 4: Run the complete project gate**

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run verify
```

Expected: lint, TypeScript, every Jest suite, and all release-configuration
tests pass. Record the exact Jest suite/test totals in `docs/wanikani-api.md`,
then run `git diff --check` and the complete `npm run verify` command again so
the final documentation edit is included in fresh verification evidence.

- [ ] **Step 5: Review the final scoped diff**

```bash
git status --short
git diff -- src/api/WaniKaniApi.ts src/api/rateLimit.ts src/api/HttpWaniKaniApi.ts src/api/__tests__/rateLimit.test.ts src/api/__tests__/client.test.ts docs/wanikani-api.md
```

Confirm the implementation contains no conditional cache, database migration,
request scheduler, pagination edit, hidden-resource edit, or unrelated
formatting churn.

- [ ] **Step 6: Commit Task 3**

```bash
git add docs/wanikani-api.md
git commit -m "docs: update WaniKani rate-limit status"
```
