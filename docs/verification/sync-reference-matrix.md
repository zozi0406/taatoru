# Synchronization reference and regression matrix

Implementation verified 25 October 2026 from Taatoru e406d41. Baseline: 57 suites / 305 tests. Closing gate: 68 suites / 375 tests plus 13 release-configuration tests passed under Node 22; native evidence and limits are in [sync-correctness.md](sync-correctness.md). Reference source trees stay read-only.

| Behavior | Reference protection / limitation | Taatoru release requirement | Evidence |
|---|---|---|---|
| Durable completion | Tsurukame atomically queues; Durtles has an observed completion-to-enqueue crash window | Keep session snapshot and immutable operation in one transaction | `reviewSessionRepository.test.ts`, `sessionRepository.test.ts`, `migrationV2.test.ts`, `faultSequences.test.ts`; native force-stop recovery |
| Online delivery | Tsurukame sends immediately; Durtles schedules durable tasks | Enqueue, resume and reconnect drive eventual draining | `coordinator.test.ts`, `homeRoute.test.tsx`, connectivity retry suites |
| Shared ownership | Durtles uses a shared task monitor; Tsurukame guard excludes direct sends | Independent connections cannot dispatch/commit as competing owners | `syncControl.test.ts`, `ownership.test.ts`; Android two-connection contention |
| Refresh and pending work | References upload first; quota/parallel paths have limits | Quick/full refresh retains pending projection and effective notes | `pendingOverlay.test.ts`, `fullRefresh.test.ts`, `projection.test.ts` |
| Pagination | Tsurukame uses moving watermark; Durtles replays an hour | Follow actual pages, conservative watermark, replay and version checks | `client.test.ts` (10,000 subjects), `pagination.test.ts` (first watermark, duplicates/loops), `date.test.ts`, `resources.test.ts` (version ordering) |
| Pacing | Durtles averages one request per 1.1 seconds | Pace all HTTP traffic and persist quota deadlines | `requestScheduler.test.ts`, `coordinator.test.ts` (persisted waits/restart) |
| Reset/hidden transitions | Durtles fetches assignment transitions; Tsurukame filters can miss removals | Preflight resets and preserve hidden/locked updates | `preflight.test.ts`, `writeReconciliation.test.ts`, availability and subscription-resume suites |
| Ambiguous/rejected progress | Both references discard every 422 | Reconcile opportunity, preserve unresolved work and isolate poison items | `writeReconciliation.test.ts`, `pendingWrites.test.ts`; native lost-response check |
| Material creation | Tsurukame looks up remote ID; status handling is weak | Receipt/lookup IDs, immutable old dispatch, newer edits preserved | `materialReconciliation.test.ts`, `attention.test.ts`, `faultSequences.test.ts` |
| Answer persistence | Current study-UX supplies synchronous submit guards | Preserve mistake counts, cancellation and offline Finish | `reviewSession.test.tsx` (held wrong-answer commit), `lessonSession.test.tsx`, picker/session suites |
| Account lifecycle | Reference account handling has known gaps | Versioned credentials and fenced teardown prevent old callbacks committing | `credentialSlots.test.ts`, `attention.test.ts`, `ownership.test.ts`; native late old-account response |

API constraints: review history is unavailable; no documented review idempotency key or material compare-and-set; background scheduling is controlled by the OS. These limits cannot be replaced by claims of exactly-once delivery or globally conflict-free edits.

The original audit failures are covered by these rows: pending projection and refresh, online draining, concurrent ownership, pacing, reset/hidden state, ambiguous progress, and account teardown. The two pagination defects are covered separately by dense-page traversal and conservative-watermark tests. Pending note/synonym overlays and the answer-commit race have dedicated repository and screen regressions. All named suites ran in the closing gate.

Taatoru retains atomic completion and conditional acknowledgement, adds immediate delivery and shared pacing/ownership, and replaces the references' blanket 422 deletion with reconciliation or visible attention. The original material policy merges disjoint changes and preserves observed conflicts; the user's later request for API-authoritative material conflicts remains a separate follow-up.
