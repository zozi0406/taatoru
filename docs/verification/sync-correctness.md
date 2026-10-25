# Sync correctness implementation and verification

25 October 2026. Implementation baseline: `e406d41`; branch: `codex/taatoru-sync-correctness`.
Only Taatoru changed. The Tsurukame and Smouldering Durtles reference checkouts remain read-only.

## Implemented direction

- Additive schema v2 preserves v1 cache, pending payloads and saved sessions. Legacy operations with insufficient provenance remain visible for attention rather than being submitted blindly.
- Local session completion, operation identity and projection commit atomically. Pending work overlays downloads and is excluded from lesson/review availability.
- Versioned encrypted credential slots, account epochs and database leases fence account replacement, old requests, acknowledgements and local screen callbacks. Local writes freeze during credential transitions so the pending-work check cannot race a newly queued edit.
- Every production HTTP request, including pagination, validation and reconciliation, uses a persisted scheduler: 1,100 ms spacing, a 30-second deadline, valid server quota budgets, and bounded backoff. Background runs have a 20-second slice.
- The foreground coordinator handles enqueue, startup, foreground, reconnect and manual requests. Initial setup retains its existing retry owner. Queue summaries include deferred, rejected, uncertain and unresolved material-history work.
- Progress retries retain one completion timestamp and original assignment opportunity. Typed receipts settle atomically. Remote counters plus an advanced due/burned state can supersede an old cycle; a due-time shift alone cannot prove acceptance. Resets invalidate an old cached opportunity even when the user finished offline after the remote reset occurred.
- Material receipts and subject lookup establish server identity. Older dispatched revisions retain immutable evidence; newer edits survive an old acknowledgement. The original implementation merges compatible field changes and exposes observed same-field conflicts for a decision. A later user request to change that material policy is deliberately a separate follow-up, after this implementation is wrapped up.
- Study screens serialize answer and navigation commits, preserve mistake counts, and advance only after durable success. Saved-change controls provide guarded retry, conflict resolution, explicit discard and recovery of a preserved newer material version.

## Permanent regression coverage

The [reference matrix](sync-reference-matrix.md) maps the audit findings to tests. Important suites include:

| Area | Permanent tests |
|---|---|
| Atomic completion, rollback, stale saved-session callbacks | `reviewSessionRepository.test.ts`, `sessionRepository.test.ts` |
| Pending projections, effective notes/synonyms, full refresh | `pendingOverlay.test.ts`, `fullRefresh.test.ts` |
| Actual page continuation, 10,000 subjects, watermark and microsecond ordering | API pagination/client tests and resource repository tests |
| Credentials, teardown, ownership expiry, two connections | `credentialSlots.test.ts`, `syncControl.test.ts`, `ownership.test.ts` |
| Lost response, fixed timestamps, 422, reset, changed opportunity | `writeReconciliation.test.ts`, `pendingWrites.test.ts`, `preflight.test.ts` |
| Material create/ID recovery, edit before acknowledgement, conflicts and late old PUT | `materialReconciliation.test.ts`, `attention.test.ts` |
| Pacing, persisted quota/backoff, deadline, foreground drain and coalescing | `requestScheduler.test.ts`, `coordinator.test.ts` |
| Pending wrong answer followed by another submission, navigation, retry, synonyms, Finish | Existing review/lesson/session screen suites |
| File reopen and deterministic interrupted-refresh sequences | `faultSequences.test.ts` (fixed seeds 7, 31 and 129) |

Generated sequences exercise material durability. Dedicated API, session, account, ownership and coordinator scenarios cover the remaining invariants; this is not a general model checker of every possible mixed event ordering.

## Verification record

- Node 22: complete `npm run verify` passed after the device-discovered fixes: 68 Jest suites / 375 tests, plus 13 release-configuration tests; lint and TypeScript checks passed.
- `npx expo-doctor`: 21/21 checks passed.
- `npm run prebuild:check`: passed; generated native directories remain ignored.
- `npm run android -- --no-bundler --device Taatoru_Onboarding_API_36_1`: debug build/install passed (2m 24s).
- Android API 36.1 / arm64, isolated temporary emulator data disk: native fixtures passed simultaneous migration, foreground/background lease contention, accepted review with lost response, note draining, backwards-clock fencing, logout/new-account late-response rejection, and SQLite integrity.
- Device testing found a WAL/setup lock failure outside the original migration retry boundary. A failing permanent regression was added, the entire migration attempt was made retryable, and the native scenarios passed after the fix.
- Force-stop/restart: a durably queued offline completion survived termination and reopened through the production owned engine, drained to zero pending, and made one fixture review POST. Study UI: a 120-lesson list, selection limit, cancel with unchanged availability, selection restoration across rotation, automatic five-item lesson start, selected one-item lesson start, and review-screen handoff passed. Dark appearance and 1.3 font scale were inspected on the emulator. Sleep/wake returned to the fixture app; this does not establish OS-scheduled background execution. The development tools overlay sometimes intercepted taps, so checks used the actual screen tree and repeated affected taps.

The separate Metro fixture entry is `src/test/sync/androidFixtureEntry.tsx`; `scripts/sync-native/serve.mjs` serves its manifest on localhost. It is never imported by the production router. Fixture databases are separately named, fixture server state contains no account credentials, and the checks make no live WaniKani writes.

## Limits and release decision

This implementation does not claim server-supported exactly-once review delivery or conditional material writes. A remote change after preflight, or an expired owner's request still being processed by WaniKani, can race a later request. Preserved versions make that material ordering limit recoverable; they cannot prevent the server effect. Superseded progress is not proof that this client submitted the accepted review.

Local SRS stages remain approximate; pending work does not invent an authoritative next-review time. Background execution remains subject to OS scheduling and termination. Conditional reads and level-progression download efficiency remain follow-up work.

Physical-device Android testing, iOS execution and extended OS-scheduled background/sleep testing have not been performed. Emulator fixtures and passing unit tests do not establish those results. Final release readiness remains conditional on these limits and the independent correctness review; this document is not a zero-defect guarantee.
