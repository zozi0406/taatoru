# Local mutation E2E implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. The user requested this refresh followed immediately by implementation.

**Goal:** Run Taatoru's real lesson/review/material UI and durable HTTP delivery locally with original synthetic curriculum and coherent level progression.

**Architecture:** A deterministic content/account factory feeds a stateful loopback HTTP server and an isolated seeded app. Preserve the production coordinator, owned engine, reconciler and scheduler. A host runner drives Maestro and compares accepted mutations with SQLite snapshots.

**Tech stack:** Existing TypeScript/Jest/SQLite, Node 22 HTTP, Android development build and Maestro; no backend framework.

**Spec:** `docs/superpowers/specs/2026-10-25-local-mutation-e2e-design.md`, refreshed against `f8fe7d0` on 1 November 2026.

## Global constraints

- Daily study is primary; 200 available lessons and 1,000 due reviews are extreme bounds.
- Strictly original synthetic content; no imports from learning-content fixtures.
- Current level, subscription, prerequisites, first-pass history and 90% kanji threshold are separate rules.
- No production schema, reconciliation-policy or scheduler-speed changes.
- Dedicated `app.taatoru.e2e` package, database and secure-store sandbox; fail closed without local server.
- Conflicting remote material is now authoritative; retain a newer local revision only where current production settlement preserves it.
- Authentication/sync parity, exact SRS intervals, real media and iOS remain outside scope.

## Review focus

- Restart while lease or uncertain dispatch survives: retain evidence, allow real lease expiry, do not reseed.
- API receipts and filtered lookup identity: reject malformed or unrelated resources.
- Source snapshots and remote counter identity: accepted/lost response must settle without a duplicate mutation.
- Level-up must preserve lower-level backlog and never leak future/subscription-locked lessons.
- E2E configuration must never redirect a normal release or scheduled background task.

## Task 1: Original scenarios and progression

**Files:** `e2e/scenarios/{factory,world}.ts`, `e2e/__tests__/world.test.ts`.
**Interfaces:** `createScenario(name, seed, now): Scenario`; `MockWorld` owns resources and applies starts/reviews/material writes, publishes bootstrap resources and expected sets.

- [x] Write failing tests for deterministic factory, exact preset counts, accepted synthetic answers, prerequisite combinations, first-pass persistence, 90% rounding and cap/final-level boundaries.
- [x] Run `npm test -- --runInBand e2e/__tests__/world.test.ts`; confirm missing implementation failures.
- [x] Implement factory/catalog separately from account state; original labels/readings, stable IDs and component links. Implement deterministic server progression with explicit timestamp/counter updates.
- [x] Rerun focused tests; expect all pass.

## Task 2: HTTP contract and reconciliation

**Files:** `e2e/mock/server.ts`, `scripts/e2e/{register,serve}.cjs`, `e2e/__tests__/{http,delivery}.test.ts`.
**Interfaces:** `startMockServer(options)` returns `{ origin, world, close }`; control routes provide scenario/reset/state/journal/fault/release/make-due operations. Actual API client uses `${origin}/v2/`.

- [x] Write failing loopback tests for mutation receipts, filtered reads, resets, cursor pagination, invalid identities, pre-acceptance failure, accepted/lost review/material response, 422 attention, and held older material receipt.
- [x] Run focused Jest files and observe missing server failures.
- [x] Implement loopback-only server with bounded JSON input and response barriers; record attempted and accepted writes separately, no invented remote idempotency header.
- [x] Exercise real `HttpWaniKaniApi` and current ownership/reconciliation repositories against the server, including file reopen and queue summaries. Expect no duplicate accepted mutations on recovery.

## Task 3: Isolated app setup

**Files:** `src/test/e2e/{runtime,seed}.ts`, `app.config.ts`, `src/app/AppProviders.tsx`, `src/features/notifications/backgroundTask.ts`, focused setup/config tests.
**Interfaces:** runtime returns fixed local API URL/database only for explicit E2E package/config; `seedE2EAccount(db, tokenStore, bootstrap)` initializes real credential slots/resources once and verifies run identity on relaunch.

- [x] Write failing tests for valid activation, interrupted seed, relaunch preservation, mismatched run and invalid/release configuration.
- [x] Implement explicit configuration with a build-only environment flag and package validation; forbid EAS release activation. Keep scheduler callbacks/signals and production route guards unchanged.
- [x] Initialize credential/account context through existing APIs, seed resources and deterministic study settings, preserve all dispatch/lease state on resume. Disable OS background work in E2E only.
- [x] Run setup/config and existing bootstrap/auth suites; expect pass.

## Task 4: Device runner and native flows

**Files:** `e2e/runner/`, `e2e/flows/`, `scripts/e2e/android.cjs`, necessary stable control IDs, `package.json`, `.gitignore`, `e2e/README.md`.
**Interfaces:** `npm run mock:api -- --scenario daily --seed 42`; `npm run e2e:android -- --suite smoke|mutations|progression|bounds --serial SERIAL`.

- [x] Add prerequisite/argument tests that reject ambiguous devices, unknown suites and normal app IDs before destructive reset commands.
- [x] Implement owned server/Metro lifecycle, explicit serial, adb reverse, reset-only-E2E app, flow execution and bounded server assertions. Preserve server/app state during resume steps.
- [x] Add native flows for review/lesson, wrong-answer override, cancel, restart, materials, progression, failure recovery and bounds. Generate answer-driven commands from the synthetic manifest, never bypass grading/session commits.
- [x] Stop app before copying SQLite plus WAL/SHM via run-as; query the copy, capture journal/state/logcat/screenshots on failure and clean only owned resources.
- [x] Run native suites on a clean emulator, including a deliberate failure to verify artifacts. If device/tool setup is blocked, record exact failure and complete all unaffected checks.

## Task 5: Verification and handoff

- [x] Run `npm run verify`, Expo Doctor, native prebuild for normal/E2E configs, server/manual CLI smoke and relevant native suites.
- [x] Review complete diff and request independent whole-change review; fix material findings with regressions.
- [x] Update verification record with commands actually run, native limits and reproducible usage. No live account/API is needed.

## Execution ledger

Base: `f8fe7d0`. Branch: `codex/local-mutation-e2e`.

Ruling: work in the otherwise-clean current checkout on a dedicated branch; retain the existing untracked design. No worktree is needed for concurrent implementation.
Ruling: implement inline as requested; perform one independent review at the end.
Pre-flight: factory/world → HTTP/bootstrap → real app runtime → native runner; shared wire resource shapes come from current `src/api/types.ts`, never existing content fixtures.

Ruling: verify the installed application ID with expo-application in addition to Metro metadata; either mismatch fails before opening SQLite or SecureStore. The dependency already existed transitively and is now explicit.
Ruling: SDK-localhost needs an IPv6-to-IPv4 bridge, an explicit ExpoRoot test entry using real routes, and exclusion of environment files from Metro inputs. These are tooling integration fixes; normal routing/business rules remain unchanged.
Ruling: retain separate Android probes for unreadable receipts and abruptly dropped connections. The dropped-connection probe preserves a strict no-replayed-POST expectation and records APP-002 when it fails; no exactly-once transport claim is made.
Task 1: complete — deterministic original curriculum; exact lesson/due/future counts; prerequisites, pass history, rounding, cap/final level and exact unlock-set tests pass.
Task 2: complete — real HTTP receipts, lookups, pagination/faults and ownership/reconciliation tests pass, including newer material revision and bounded partial drains.
Task 3: complete — active credential slots, marker preservation/reset failures and installed/manifest identity guards pass; isolated APK builds and opens.
Task 4: implemented — native suites and artifact capture exercised; results and application failures are listed in `docs/verification/local-mutation-e2e.md`.
Review: independent review identified native identity, snapshot buffering, unreachable fixture history, future counts and missing native assertions; each corrected with focused regression coverage.

User steering: record application issues rather than fitting tests to them. Dedicated `level-up-auto` and raw-connection `recovery` probes retain their assertions; APP-001/002 are recorded in `docs/verification/local-e2e-app-findings.md`. Explicit-refresh progression and `receipt-recovery` are distinct tests, not substitutes for those probes. No production sync/transport fix is in scope.

Task 5: implemented — independent review corrections, fresh verification and native evidence are documented in `docs/verification/local-mutation-e2e.md`. Known application probes remain failing; their expectations were preserved.
