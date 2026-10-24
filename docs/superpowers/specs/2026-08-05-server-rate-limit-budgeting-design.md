# Server Rate-Limit Budgeting Design

## Goal

Make Taatoru's existing synchronization budget follow WaniKani's reported
request limit and remaining capacity instead of relying solely on a local
60-request-per-minute estimate.

## Scope

This change reads `RateLimit-Limit`, `RateLimit-Remaining`, and
`RateLimit-Reset` from every WaniKani response and exposes valid server values
through the existing `WaniKaniApi.rateLimit` snapshot. The synchronization
engine continues to use that snapshot to reserve capacity for its fixed reads
and choose a bounded set of pending writes.

The existing local minute tracker remains the fallback when the headers are
absent or malformed. Conditional requests, HTTP caching, a global request
queue, sleeping until reset, pagination changes, and hidden-resource handling
are out of scope.

## Transport and Tracker Design

`HttpWaniKaniApi` will pass the three rate-limit response headers to
`RateLimitTracker.recordResponse()` alongside the existing request timing and
server `Date` header. This happens before response-status handling, so success
and error responses both refresh the budget.

The tracker will accept a server budget only when:

- `RateLimit-Limit` is a positive finite integer;
- `RateLimit-Remaining` is a non-negative finite integer no greater than the
  limit; and
- `RateLimit-Reset` is a non-negative finite epoch timestamp in seconds.

When all three values are valid, they are authoritative. The snapshot reports
the server limit, remaining capacity, the derived number of requests used, and
the remaining milliseconds until reset. Reset timing uses the tracker’s
estimated server clock when a valid `Date` header is available and the local
clock otherwise. Responses can complete out of order, so reports for the same
limit window may only reduce the stored remaining count; an older response
cannot restore capacity consumed by a newer one.

Once the reported reset time has passed, the stale server budget is discarded
and the tracker reports a fresh full local budget until a later response
provides current headers. This prevents an old zero-remaining response from
blocking future synchronization indefinitely.

If any server budget header is missing or invalid and no unexpired server
budget exists, the tracker retains its existing `Date`-based local counting
behavior. If an unexpired authoritative budget does exist, the response
conservatively consumes one from its remaining count without replacing its
limit or reset time. A malformed response therefore cannot increase or erase a
previously reliable budget unexpectedly.

`RateLimitSnapshot.limit` will become a general number rather than the literal
type `60`, because WaniKani's response is authoritative even if the service
changes the limit without an API revision.

## Synchronization Behavior

No synchronization phase or request ordering changes. At the beginning of a
quick or full sync, `SynchronizationEngine` reads the latest rate-limit
snapshot. Its existing budget calculation reserves capacity for required
downloads and spends only the remainder on pending progress and study-material
writes.

Server headers received during a synchronization affect the next budgeting
decision. They do not cancel requests already in flight or serialize
pagination. A global scheduler would overlap with the separately accepted
pagination-burst gap and is intentionally excluded.

## Error Handling

- `429` responses continue to prefer `Retry-After` and fall back to the
  documented `RateLimit-Reset` epoch for `retryAt`.
- Rate-limit headers are recorded before an `ApiError` is raised, so the next
  attempt sees the depleted server budget.
- Missing, partial, non-numeric, negative, or internally inconsistent header
  sets fall back safely to local accounting.
- Network failures without a response cannot update the tracker.

## Testing

Test-first coverage will verify that:

- a complete valid header set overrides the default limit and remaining count;
- the reset epoch produces the expected `resetAfterMs` and expires cleanly;
- valid headers on an error response still update the public snapshot;
- missing, partial, malformed, negative, and remaining-above-limit sets retain
  local fallback behavior or conservatively reduce an active server budget;
- out-of-order responses in one server window cannot increase the remaining
  count;
- responses without valid rate-limit headers preserve the existing server-date
  minute accounting; and
- the synchronization budget consumes the server-derived remaining count
  through the existing `WaniKaniApi.rateLimit` boundary.

Focused API and synchronization tests will run during development, followed by
the complete project gate: lint, TypeScript checking, all Jest suites, and the
release-configuration tests. The API status document will record server-derived
budgeting as implemented while keeping global request scheduling and
pagination bursts outside this change.
