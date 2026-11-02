# Mutation synchronization fixes — verification

1 November 2026. Baseline `f8fe7d0` plus the existing local mutation harness. Implementation branch: `codex/local-mutation-e2e`.

## Changes

- Quick sync keeps its pre-delivery user/grant read, then refreshes the user after a selected progress batch and before subject import/completion. The second identity must match. No-progress and material-only batches add no user read; full-sync ordering is unchanged.
- Android marks the existing API mutation bodies one-shot, so native recovery cannot retransmit a possibly accepted body before the durable queue reconciles it. GET retries remain unchanged. The policy covers reviews, material creates/updates and lesson starts, without changing wire payloads, scheduler pacing or database schemas.
- Expo prebuild installs the policy through the HTTP-client factory shared by Expo Fetch and React Native, in normal and isolated Android builds. A native rebuild is required.

## Investigation and regression evidence

The stale-level HTTP/SQLite test failed with server Level 4/local Level 3 before the fix, and passes after it. Failure/identity tests and a credential-rotation barrier protect the additional user read. A loopback test proves that failed metadata refresh retains an already accepted review settlement; a coordinator test proves automatic retry with an empty outbox.

Native MockWebServer tests first demonstrated the original retransmission with a default-client control. One-shot tests cover dropped accepted review/material bodies, retry/follow-up responses 408/503/307/308, UTF-8 payload metadata, scoped matching and unchanged GET recovery.

The first installation attempt used React Native's per-request customization hook. The real Android recovery probe still failed, revealing that Expo 57 replaces global fetch with Expo Fetch, which bypasses that hook. The corrected integration uses `OkHttpClientProvider.setOkHttpClientFactory`; native tests obtain protected clients through the actual provider. The original strict recovery assertion and mock fault were preserved. This unsuccessful intermediate attempt is not evidence of a resolved issue.

## Checks

- Node 22.23.2 `npm run verify`: **468 tests / 79 suites**, lint, TypeScript, release configuration and three tooling tests passed.
- Expo Doctor 1.20.1: **20/20** passed.
- Clean normal and isolated Android prebuilds: passed; both generated applications install the same policy before React Native startup.
- Resolved OkHttp dependency: **4.12.0**, verified with Gradle dependency insight. Five native policy tests passed with the default-client replay control.
- Independent review: no blocking findings; corrected shared-factory seam reviewed separately. Optional registration and configuration-preservation coverage added.

Device results are recorded below only after inspecting actual journals and SQLite snapshots. No live WaniKani API or account is used. Each run's evidence remains under ignored `.expo/e2e/<run>/`.

## Native acceptance results

All **13 suites passed** on the final rebuilt isolated APK using the temporary API 36.1 emulator and Maestro 2.12.0. Request pacing, backoff and ownership leases remained real.

| Suite | Result | Evidence run |
| --- | --- | --- |
| `recovery` | Passed | `2026-11-01T22-12-24-091Z` |
| `level-up-auto` | Passed | `2026-11-01T22-13-43-122Z` |
| `connection-before` | Passed | `2026-11-01T22-14-53-698Z` |
| `material-recovery` | Passed | `2026-11-01T22-16-10-643Z` |
| `progression` | Passed | `2026-11-01T22-17-10-477Z` |
| `receipt-recovery` | Passed | `2026-11-01T22-18-22-978Z` |
| `preacceptance` | Passed | `2026-11-01T22-19-36-918Z` |
| `quota` | Passed | `2026-11-01T22-20-49-298Z` |
| `rejected` | Passed | `2026-11-01T22-22-03-801Z` |
| `materials` | Passed | `2026-11-01T22-23-08-342Z` |
| `resume` | Passed | `2026-11-01T22-24-35-858Z` |
| `mutations` | Passed | `2026-11-01T22-27-32-452Z` |
| `smoke` | Passed | `2026-11-01T22-32-31-632Z` |

The automatic-only probe persisted Level 4 and exactly the server's 25 available lesson IDs, without a manual refresh. Abrupt accepted-review loss produced one POST, followed by assignment/statistic reads and settled durable state. The unaccepted-loss case retained its timestamp and read authoritative state before its later queue-owned resend. Lost material create reconciled one positive remote identity without another POST.

The remaining cases verified explicit refresh, unreadable receipts, 500/429 recovery, visible retained-422 attention, newer edits behind an older held receipt, half-question resume after a real lease wait, exact wrong-answer/override counters, both lesson-start routes and mutation-free selected-item cancellation. All successful final snapshots have empty pending/dispatch tables except the intentionally rejected-422 case, which retains its rejected row.

The default one-review native retry cases were also audited against the final per-assignment timestamp helper and exact reconciliation-read paths. The helper groups retries by assignment so custom multi-review scenarios do not incorrectly require unrelated completions to share a timestamp; its regression test was observed failing before implementation and passing afterward.

The unsuccessful intermediate `2026-11-01T22-06-33-973Z` recovery run used the insufficient RN-only hook and remains evidence for the shared-factory correction. Both original issue expectations and pre-fix evidence are retained in [application findings](local-e2e-app-findings.md). No application defect was accommodated by weakening a probe.

Extreme-list traversal was not repeated: these fixes change metadata ordering and native HTTP policy, not list rendering; its prior verification remains in the harness report. The normal configuration was prebuilt and checked, while the actual APK/device matrix used the isolated package. No production release deployment or remote CI result is claimed.

Publication check, 2 November: clean CI exposed a missing Metro ambient type on the E2E entry (`Require.context`), previously supplied by ignored generated Expo types locally. Reproduced with generated type files excluded, then fixed with an explicit Expo Metro type reference. Clean type checking and the full 468-test verification passed; runtime behavior and native acceptance expectations are unchanged.
