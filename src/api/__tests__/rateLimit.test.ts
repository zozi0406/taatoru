import { RateLimitTracker } from '../rateLimit';

test('tracks the server minute, clock skew, and local reset time', () => {
  let now = 1_200;
  const tracker = new RateLimitTracker(() => now);

  tracker.recordResponse({
    serverDate: 'Thu, 01 Jan 1970 00:00:02 GMT',
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
    requestStartedAtMs: 1_200,
    responseReceivedAtMs: now,
  });
  expect(tracker.snapshot.requestsInServerMinute).toBe(2);
});

test('resets the request count when the response enters a new server minute', () => {
  const tracker = new RateLimitTracker(() => 60_200);
  tracker.recordResponse({
    serverDate: 'Thu, 01 Jan 1970 00:00:59 GMT',
    requestStartedAtMs: 59_800,
    responseReceivedAtMs: 60_000,
  });
  tracker.recordResponse({
    serverDate: 'Thu, 01 Jan 1970 00:01:00 GMT',
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
    requestStartedAtMs: 900,
    responseReceivedAtMs: 1_000,
  });
  tracker.recordResponse({
    serverDate: 'invalid',
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
