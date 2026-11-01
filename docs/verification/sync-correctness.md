# Sync correctness implementation and verification

Implementation/device evidence: 25 October 2026. Final review fixes verified: 1 November 2026. Implementation baseline: `e406d41`; branch: `codex/taatoru-sync-correctness`.
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

- Node 22: complete `npm run verify` passed after the device-discovered fixes: 69 Jest suites / 393 tests, plus 13 release-configuration tests; lint and TypeScript checks passed.
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

Physical-device Android testing, iOS execution, actual OS-worker interruption and extended OS-scheduled background/sleep testing have not been performed. The backwards-clock check uses an injected clock against actual native SQLite; it does not change the emulator system clock. Emulator fixtures and passing unit tests do not establish those results. The original implementation is complete with all identified Important review findings fixed and the complete gate passing. Physical-device/iOS/background limits remain; this document is not a zero-defect guarantee. The later requested material-conflict policy is a separate follow-up before publishing the final requested behavior.

## Migration and rollback

The version-2 migration adds control/operation metadata without rewriting version 1 or clearing cached account data. Tests cover populated migration, missing provenance, transactional rollback, reopen/idempotence and two connections. Legacy work without a provable baseline remains saved for attention. SQLite setup and the migration transaction both retry bounded contention.

This is an additive forward migration, with no destructive downgrade. An older binary is not a supported rollback path for a database already using the new pending-operation semantics; preserve the database and repair forward. Fixture testing uses named temporary databases rather than clearing production data.

## Independent review closure — 1 November 2026

A fresh reviewer examined the complete original branch through `9d65896`, using source inspection and controlled SQLite probes. The reviewer found five Important issues and no Critical or Minor issues. All five were reproduced with permanent failing tests and fixed in one author pass:

| Finding | Fix and regression |
|---|---|
| Interrupted token repair could clear the outbox | Continue/cancel candidate credentials without clearing account data; protect an activation racing cancellation. `credentialSlots.test.ts` |
| Missing/inconsistent statistics could discard or resubmit progress | Require matching statistic identity and individual nondecreasing counters; supersession needs chronological due advancement or burning. `writeReconciliation.test.ts` |
| Session wall time could misattribute pre-reset answers | Invalidate affected saved sessions on first reset discovery regardless of creation time. `preflight.test.ts` |
| Retained study screens used stale synonyms | Refresh materials on focus and committed-data invalidation without recreating question/input state. `materialRefreshRoutes.test.tsx` |
| Notifications could outlive sync ownership | Carry the lease guard into each notification side effect, including after permission lookup. `ownership.test.ts` |

The legitimate first-review case remains deliverable when both statistic observations are absent at the initial stage and the assignment opportunity is unchanged. The [official API reference](https://docs.api.wanikani.com/20170710/#review-statistics) says statistics are created after the first review. Missing established evidence remains saved for attention.

The final gate passed lint, TypeScript, 69 suites / 393 Jest tests and 13 release-configuration tests. Original Expo Doctor, prebuild, Android build and device checks were performed on 25 October; the final TypeScript review fixes were verified by the complete gate and focused SQLite/route tests on 1 November. Android device checks were not repeated after those fixes. The reviewer did not rerun the full suite or device gate, and did not review the subsequent fix diff a second time.

Review exclusions were explicitly accepted: the later material-policy change, remote ordering/idempotency guarantees the API cannot provide, and exact OS-background/iOS parity. See the [implementation decisions](sync-implementation-decisions.md) for the complete record and costs.
