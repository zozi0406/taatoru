import { RateLimitTracker } from '../rateLimit';

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

test('uses the local clock when a server budget omits a valid Date', () => {
  const tracker = new RateLimitTracker(() => 10_000);
  tracker.recordResponse({
    serverDate: 'Thu, 01 Jan 1970 00:00:10 GMT',
    rateLimitLimit: null,
    rateLimitRemaining: null,
    rateLimitReset: null,
    requestStartedAtMs: 9_900,
    responseReceivedAtMs: 10_000,
  });
  tracker.recordResponse({
    serverDate: null,
    rateLimitLimit: '120',
    rateLimitRemaining: '17',
    rateLimitReset: '20',
    requestStartedAtMs: 10_000,
    responseReceivedAtMs: 10_000,
  });

  expect(tracker.snapshot).toMatchObject({
    limit: 120,
    requestsRemaining: 17,
    resetAfterMs: 10_000,
    estimatedClockSkewMs: 0,
  });
});

test('tracks the server minute, clock skew, and local reset time', () => {
  let now = 1_200;
  const tracker = new RateLimitTracker(() => now);

  tracker.recordResponse({
    serverDate: 'Thu, 01 Jan 1970 00:00:02 GMT',
    rateLimitLimit: null,
    rateLimitRemaining: null,
    rateLimitReset: null,
    requestStartedAtMs: 1_000,
    responseReceivedAtMs: now,
  });

  expect(tracker.snapshot).toEqual({
    limit: 60,
    requestsInServerMinute: 1,
    requestsRemaining: 59,
    resetAfterMs: 57_900,
    estimatedClockSkewMs: 900,
  });

  now = 1_400;
  tracker.recordResponse({
    serverDate: 'Thu, 01 Jan 1970 00:00:02 GMT',
    rateLimitLimit: null,
    rateLimitRemaining: null,
    rateLimitReset: null,
    requestStartedAtMs: 1_200,
    responseReceivedAtMs: now,
  });
  expect(tracker.snapshot.requestsInServerMinute).toBe(2);
});

test('resets the request count when the response enters a new server minute', () => {
  const tracker = new RateLimitTracker(() => 60_200);
  tracker.recordResponse({
    serverDate: 'Thu, 01 Jan 1970 00:00:59 GMT',
    rateLimitLimit: null,
    rateLimitRemaining: null,
    rateLimitReset: null,
    requestStartedAtMs: 59_800,
    responseReceivedAtMs: 60_000,
  });
  tracker.recordResponse({
    serverDate: 'Thu, 01 Jan 1970 00:01:00 GMT',
    rateLimitLimit: null,
    rateLimitRemaining: null,
    rateLimitReset: null,
    requestStartedAtMs: 60_000,
    responseReceivedAtMs: 60_200,
  });

  expect(tracker.snapshot.requestsInServerMinute).toBe(1);
  expect(tracker.snapshot.requestsRemaining).toBe(59);
});

test('ignores responses without a valid Date header', () => {
  const tracker = new RateLimitTracker(() => 1_000);

  tracker.recordResponse({
    serverDate: null,
    rateLimitLimit: null,
    rateLimitRemaining: null,
    rateLimitReset: null,
    requestStartedAtMs: 900,
    responseReceivedAtMs: 1_000,
  });
  tracker.recordResponse({
    serverDate: 'invalid',
    rateLimitLimit: null,
    rateLimitRemaining: null,
    rateLimitReset: null,
    requestStartedAtMs: 1_000,
    responseReceivedAtMs: 1_100,
  });

  expect(tracker.snapshot).toEqual({
    limit: 60,
    requestsInServerMinute: 0,
    requestsRemaining: 60,
    resetAfterMs: 0,
    estimatedClockSkewMs: 0,
  });
});
