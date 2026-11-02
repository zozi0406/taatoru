# Local mutation E2E verification

1 November 2026. Taatoru baseline `f8fe7d0`, branch `codex/local-mutation-e2e`.

## Delivered scope

A loopback HTTP API, deterministic original curriculum/account factory, isolated seeded Android build and Maestro runner exercise real UI → SQLite → owned paced HTTP delivery. Scenarios include ordinary daily/backlog queues, optional 200-lesson/1,000-review extremes, prerequisites, current level, subscription limits and 90% first-pass kanji progression. Login, initial-sync parity, exact SRS intervals, media and iOS are outside this harness.

See [setup and usage](../../e2e/README.md), [implementation plan](../superpowers/plans/2026-11-01-local-mutation-e2e.md) and [application findings](local-e2e-app-findings.md).

## Code and build checks

- `npm run verify` on Node 22.23.2: passed lint, TypeScript, **457 tests in 79 suites**, release-configuration tests and the Metro tooling test.
- Expo Doctor 1.20.1: **20/20 checks passed**.
- Isolated Android prebuild and `app:assembleDebug`: passed; dedicated APK package `app.taatoru.e2e`.
- Normal production configuration prebuild in a disposable copy: passed, preserving the active isolated APK.
- `git diff --check`: passed.

Whole-change independent review led to focused corrections for installed-package identity checks, streamed SQLite capture, coherent prerequisite history, exact future-review counts and stricter native assertions. No production grading, mutation settlement, scheduler or schema behavior was changed.

## Native evidence

A fresh temporary Android emulator (`emulator-5580`, API 36.1), Maestro 2.12.0 and the actual isolated debug APK were used. No WaniKani account or live API was used. Request pacing/backoff remained enabled. Evidence is retained under ignored `.expo/e2e/<run>/` with generated commands, server journals and SQLite snapshots.

| Suite | Result | Evidence run |
| --- | --- | --- |
| Explicit-refresh progression | Passed; threshold review, Level 4 and exact newly available IDs persisted | `2026-11-01T16-27-19-540Z` |
| Resume | Passed; force-stop between meaning/reading, complete saved second half | `2026-11-01T16-35-21-398Z` |
| Receipt recovery | Passed; accepted write/unreadable receipt, no repeated review POST | `2026-11-01T16-57-28-381Z` |
| Materials | Passed; held create receipt, newer note/synonym edit, one create then update, positive remote ID | `2026-11-01T16-58-40-075Z` |
| Extreme bounds | Passed; 200 lessons/1,000 reviews, distant lesson 30014 completed and persisted | `2026-11-01T17-02-43-017Z` |
| HTTP 500 before acceptance | Passed; automatic retry preserves completion timestamp | `2026-11-01T17-05-14-630Z` |
| HTTP 429 | Passed; paced recovery preserves completion timestamp | `2026-11-01T17-06-28-833Z` |
| HTTP 422 | Passed; visible attention and saved-changes controls, rejected row retained, no accepted server mutation | `2026-11-01T17-22-52-588Z` |
| Smoke | Passed; mixed reviews, selected and ordinary automatic-start lessons, selected-item cancellation | `2026-11-01T17-13-38-359Z` |
| Mutations | Passed; real incorrect-answer retry, explicit override, selected lesson, select/cancel without mutation | `2026-11-01T17-08-40-701Z` |

The bounds run used the same farthest subject before/after increasing traversal allowance from 30 to 180 seconds. It did not reduce the list or weaken the completion/persistence assertions. Selected-item cancellation was subsequently verified by mutations.

## Original application failures retained

The harness is **not an all-green claim about the app**. APP-001 records stale local level after automatic write delivery in earlier captures. Upward UI gestures were found to trigger manual pull-to-refresh; automatic-only verification now avoids those gestures and asserts persisted level directly. APP-002 records an Android POST replay after abrupt connection loss, without a duplicate accepted server effect. Dedicated `level-up-auto` and raw-connection `recovery` probes preserve their expectations. Explicit-refresh progression and malformed-receipt recovery are separate checks, not replacements.

Failure capture was exercised during these runs: server acceptance and local user rows can be compared directly, along with screenshots and logs. See the findings document for observed behavior, evidence and reproduction commands. Fixing these app issues is separate work.

The earlier run named `recovery` at `2026-11-01T16-34-09-486Z` used an unreadable receipt and is superseded by the explicitly named `receipt-recovery` case. It must not be cited as passing abrupt-connection recovery.

Abrupt-connection recovery reproduced APP-002 in `2026-11-01T17-20-23-696Z`: strict repeated-POST assertion failed, with one accepted effect. Header-locator runs `2026-11-01T17-19-01-743Z` and `2026-11-01T17-21-32-712Z` are excluded from automatic-only freshness claims because their upward gestures triggered full refresh.

Final automatic-only probe `2026-11-01T17-24-22-442Z` reproduced APP-001: server Level 4, persisted local Level 3 after synchronization completion, with no upward gesture or post-write full refresh. It correctly fails `Automatic account level was not persisted`.

Standalone `mock:api` CLI: daily bootstrap returned exactly 20 lesson IDs and 80 due-review IDs; graceful interrupt shutdown passed. Native `sandbox` opened the daily account and its interrupt cleanup passed. Owned services/reverse mappings were removed and the temporary emulator was stopped. Generated native directories remain the isolated E2E build; regenerate without the flag before building the ordinary app. At the implementation handoff, changes were uncommitted; publication was handled separately.

Follow-up: the two recorded failures are fixed in the local implementation. Their original evidence and unchanged expectations remain above; see [fix verification](mutation-sync-fixes.md) for rebuilt-APK acceptance results.
