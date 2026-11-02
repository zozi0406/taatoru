# Mutation synchronization fixes implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax. The user approved implementation; completion evidence is in `docs/verification/mutation-sync-fixes.md`.

**Goal:** Automatically persist the new account level after review delivery, and prevent Android from retransmitting an API mutation before the durable queue can reconcile an uncertain result.

**Architecture:** Keep the existing ownership, outbox, reconciliation and request scheduler. Refresh the user after a quick-sync progress batch. For Android, use the shared Expo/React Native HTTP-client factory hook to mark API mutation bodies as one-shot before OkHttp's internal retry layer. Deliver the two fixes independently.

**Tech stack:** Existing TypeScript/Jest/SQLite, Expo config plugins, the generated Kotlin Android application, OkHttp and Maestro. No new production networking library or database migration.

**Baseline:** `f8fe7d0` plus the current uncommitted local E2E harness on `codex/local-mutation-e2e`. Preserve that work. Keep fix changes distinguishable from the harness baseline; do not stage all existing changes into a fix commit.

## Evidence and decisions

- APP-001: `.expo/e2e/2026-11-01T17-24-22-442Z` shows server Level 4 and persisted local Level 3 after automatic synchronization completion. The probe performs no upward gesture/pull-to-refresh. `SynchronizationEngine.runSynchronization()` reads user before sending progress and never refreshes it afterward. Full sync already fetches user after delivery.
- APP-002: `.expo/e2e/2026-11-01T17-20-23-696Z` reproduces an accepted review, abrupt response loss and an immediate second POST before reconciliation reads. No duplicate accepted effect was observed. Native transport replay is the leading explanation; verify it with native tests before calling that mechanism proven.
- Existing `PendingWriteSender` already records uncertain dispatches and `WriteReconciler` reads assignment/statistic evidence before deciding whether to resend. Preserve those policies, including unresolved-422 attention.
- The installed React Native networking source exposes `NetworkingModule.setCustomClientBuilder()`. Its OkHttp client uses repeatable bodies by default. OkHttp's `RequestBody.isOneShot()` is designed to prevent retransmission after sending starts, including relevant follow-up paths. Verify the **resolved** Gradle version; React Native's version catalog alone is not proof of the final dependency version.

### Approaches considered

1. **Recommended:** one bounded post-progress user read, plus scoped one-shot Android mutation bodies. This addresses the stale snapshot and native replay at their respective sources, preserving ordinary GET recovery and durable retries.
2. Schedule another entire quick sync after every write. Reuses existing entry points but repeats collection reads and does not prevent native POST replay.
3. Disable automatic retries for all Android networking. Smaller native change, but affects unrelated reads/media and is broader than the recorded problem. A JavaScript retry wrapper also cannot prevent retransmission inside one native fetch call.

No synthetic idempotency header, local prediction of account level, deletion of uncertain work, or relaxation of the failing probes. The transport policy is production behavior and must apply equally to normal and E2E Android builds. A rebuilt native binary is required; a JavaScript-only update cannot ship the transport fix.

## Review focus

1. Post-write user read fails after the review was accepted: retain settlement, report failure, retry metadata automatically without another review POST.
2. Credentials/lease change during the extra read: stale account data must not commit.
3. Server accepted a write but response vanished: one native transmission, then authoritative reads and settlement.
4. Server did not accept a write: a later queue-owned retry remains possible with the original durable timestamp.
5. Clean Expo prebuild: the transport policy survives regeneration in both packages and is installed exactly once before networking starts.

## Task 1 — Refresh account metadata after progress delivery (APP-001)

**Modify:** `src/features/sync/SyncEngine.ts`.
**Tests:** `src/features/sync/__tests__/engine.test.ts`, `src/features/sync/__tests__/ownership.test.ts`, `e2e/__tests__/delivery.test.ts`.

**Interface:** retain `PendingWriteDelivery.sendSelectedPendingWrites(...): Promise<void>` and public `SyncResult`. No sender-result redesign is required. Use `selectedWrites.progressIds.length > 0` as a conservative bounded trigger, covering both lesson starts and reviews, including reconciliation-only settlement.

- [x] Add failing engine tests: pre-delivery user is Level 3; selected progress changes remote user to Level 4; quick sync persists Level 4 before final invalidation, notification rebuilding and successful completion. Preserve the existing pre-write user/grant read.
- [x] Add tests that an empty progress selection or materials-only batch adds no user request, and that full-sync ordering remains unchanged.
- [x] Add a post-delivery grant-increase case: `replaceUser()` clears the subject cursor, and the subsequent refreshed state causes the subject fetch to use `null`. Do not move the new read after subject import.
- [x] Add failed post-delivery read and mismatched-user-ID cases. Failure must not mark quick sync completed or overwrite the account with another identity. Accepted work stays settled; a later successful run refreshes metadata without another accepted review.
- [x] Run the focused tests and confirm the new cases fail for the intended stale-user behavior.
- [x] In quick sync, retain the pre-write user resource, send the selected batch, then conditionally fetch user again. Verify its account ID equals the pre-write ID, using the existing 401/account-change error convention. Persist through `repository.replaceUser()` before reading refreshed state and fetching subjects. Count the user once in `updatedResources`, preserving its existing public meaning.
- [x] Extend the owned-engine fencing test: block the post-write user response, invalidate/rotate the account, release the response, and assert no stale user or notifications commit.
- [x] Add a real loopback/SQLite regression using the `level-up` scenario: enqueue the threshold review with zero errors, run one owned quick sync, assert server/local Level 4, exact newly available lessons, empty outbox/dispatches and exactly one accepted review.
- [x] Run `npm test -- --runInBand src/features/sync/__tests__/engine.test.ts src/features/sync/__tests__/ownership.test.ts e2e/__tests__/delivery.test.ts` and confirm all pass. Review this fix separately before proceeding.

## Task 2 — Prevent native API mutation replay (APP-002)

**Create:**
- `plugins/with-non-replaying-api-writes.cjs`: reproducible Expo Android integration.
- `plugins/android/NonReplayingApiWrites.kt`: native policy template, package `app.taatoru.network` independent of application ID.
- `plugins/android/NonReplayingApiWritesTest.kt`: JVM/MockWebServer tests copied into generated Android test sources.
- `scripts/e2e/network-plugin.test.cjs`: plugin transformation/regeneration tests, included by the existing tooling-test glob.

**Modify:** `app.config.ts` to register the plugin for ordinary and E2E builds. Generated `android/` remains ignored; no edits to `node_modules` or committed generated application files.

**Native interfaces (corrected by device evidence):** `NonReplayingApiWrites.install(context: Context): Unit` registers a scoped factory through `OkHttpClientProvider.setOkHttpClientFactory`. `internal fun installFactory(factory: OkHttpClientFactory): Unit` wraps a supplied base client; `configure(builder: OkHttpClient.Builder): Unit` installs the one-shot interceptor. Native JVM tests obtain protected clients through the real provider factory; rebuilt native E2E verifies Expo integration. `install(this)` is called in generated `MainApplication.onCreate()` before `loadReactNative(this)`. Install one application interceptor through the shared provider factory, using `createClientBuilder(applicationContext)` defaults; preserve the existing client configuration. The interceptor wraps matching request bodies and returns `isOneShot() == true`, delegating content type, length and bytes. Install as an **application** interceptor, before OkHttp's retry interceptor, not a network interceptor added after it.

**Scope:** requests with the existing `Wanikani-Revision` header and supported mutation method/path: POST `/v2/reviews`, POST `/v2/study_materials`, PUT `/v2/study_materials/:id`, PUT `/v2/assignments/:id/start`. This covers the production origin and local mock without an E2E exception. GETs and unrelated requests remain unchanged. No new wire headers or token inspection/logging.

- [x] Inspect `:app:dependencyInsight --dependency okhttp --configuration debugRuntimeClasspath` and the resolved version's retry source. Use that version for test-only MockWebServer; do not force a production dependency upgrade.
- [x] Write failing native MockWebServer tests against the actual client customization: a server reads the complete review body then disconnects; assert one received POST and a surfaced failure, not an internal replay. Include a reused-connection fixture/control to establish the failure mode rather than relying on a body-flag assertion alone. If the native mechanism differs from the hypothesis, revise this task from evidence before implementing another transport.
- [x] Cover both review and material-create bodies, plus lesson/material PUT matching. Verify UTF-8 bytes/content metadata survive unchanged, and GET/unrelated POST behavior and existing interceptors remain intact.
- [x] Cover body-retransmitting follow-ups supported by the resolved version, particularly 408, 503 with `Retry-After: 0`, and 307/308. Require no repeated mutation body; preserve normal error/status handling. No claim of universal exactly-once server effects.
- [x] Implement the native policy and plugin. Generate main/test sources and test-only JUnit/MockWebServer dependencies through config mods; register before React Native startup. Preserve manifest identity, application lifecycle calls, cookies, TLS, scheduling and cancellation.
- [x] Make plugin application idempotent. Fail clearly if the expected application template cannot be safely patched. Test normal/E2E package variants, repeated application, source copying and native initialization order.
- [x] Run `npm run test:e2e:tooling`; clean-prebuild both configurations in disposable copies and run `./gradlew :app:testDebugUnitTest --tests 'app.taatoru.network.NonReplayingApiWritesTest'`. Confirm policy generation and native tests pass, not just TypeScript tests.
- [x] Rebuild the isolated APK. Run the unchanged `recovery` suite: accepted review with dropped connection must produce exactly one POST, then assignment/statistic reconciliation reads, settled SQLite work and no attention caused by replay.
- [x] Verify pre-acceptance loss separately: add a `connection-before` runner suite in `e2e/runner/flows.ts` and `scripts/e2e/android.cjs`, arming existing `drop-before`. Assert at least one failed attempt, later queue-owned resend, exactly one accepted review and stable `created_at`; require authoritative reconciliation reads between POST attempts. Add suite/default tests in `e2e/__tests__/runner.test.ts`. Do not treat a legitimate later retry as forbidden native replay.
- [x] Exercise abrupt-loss material create as well: extend `e2e/__tests__/delivery.test.ts` and add a native `material-recovery` suite using the existing materials UI. One create accepted, later authoritative material lookup, positive identity and no second POST; do not reclassify lost create as a new material. Retain the newer-edit/held-receipt suite unchanged.

## Task 3 — End-to-end verification and handoff

**Update:** `docs/verification/local-e2e-app-findings.md`, `docs/verification/local-mutation-e2e.md`, `e2e/README.md` with actual results and the native rebuild requirement.

- [x] Run `npm run verify`, Expo Doctor and normal/E2E prebuild validation under Node 22. Record native unit-test/build commands and results separately.
- [x] Run `level-up-auto` without upward scrolling, Quick sync, pull-to-refresh or direct SQL repair. Require persisted Level 4 and settled queues in the final snapshot. Also rerun explicit `progression` for the unchanged refresh path.
- [x] Run `recovery`, `connection-before`, `material-recovery`, `receipt-recovery`, `preacceptance`, `quota`, `rejected`, `materials`, `resume`, `mutations` and `smoke` on the rebuilt isolated APK with real pacing. No live account/API. Extreme-list traversal need not repeat unless UI/list code changes.
- [x] For recovery, compare attempted and accepted server journal entries, request ordering, durable timestamps, SQLite queues/dispatch evidence and final account level. Inspect failure artifacts rather than adding permissive assertions.
- [x] Update each finding to resolved only when its original expectation passes; preserve the pre-fix evidence and record the exact new run. Keep unresolved observations open, including any newly exposed failure.
- [x] Review the complete fix diff and separate APP-001 and APP-002 into independently reviewable changes. Leave unrelated harness changes intact. No push, PR or deployment is part of this request.

## Acceptance criteria

1. A threshold review advances persisted account level and available lesson state through automatic delivery alone.
2. After an accepted review/material create loses its response, Android does not immediately replay the mutation; the existing durable reconciler settles it from remote evidence.
3. A genuinely unaccepted operation can still retry safely through the queue with its original timestamp; unresolved validation rejection remains visible.
4. Transport protection exists in regenerated production and test Android builds, and unrelated networking retains its current configuration.
5. Both original failing probes pass without weakening expectations or changing the mock to accommodate an application defect.

## Primary references checked

- Installed React Native source: `ReactAndroid/src/main/java/com/facebook/react/modules/network/{NetworkingModule,OkHttpClientProvider,ProgressRequestBody}.kt`.
- [OkHttp one-shot request-body contract](https://github.com/square/okhttp/blob/parent-4.9.2/okhttp/src/main/kotlin/okhttp3/RequestBody.kt).
- [OkHttp retry/follow-up implementation](https://github.com/square/okhttp/blob/parent-4.9.2/okhttp/src/main/kotlin/okhttp3/internal/http/RetryAndFollowUpInterceptor.kt). These references match React Native's declared baseline; Task 2 must check the final resolved dependency.

## Execution ruling

Device testing exposed that Expo 57 replaces global fetch with Expo Fetch and bypasses `NetworkingModule.setCustomClientBuilder`. The first hook therefore passed isolated native policy tests but left the unchanged raw-connection E2E probe failing. The implementation now registers at `OkHttpClientProvider.setOkHttpClientFactory`, used by Expo and RN, and tests exercise the actual provider. This is a correction to the proposed installation seam, not a relaxation of the recovery contract.

Completion: 468 Jest tests / 79 suites, release/tooling checks, 5 native JVM tests, normal/E2E prebuild, rebuilt isolated APK and all 13 Android suites passed. Independent review found no blocking defects. Original app findings retain their evidence and are marked locally resolved. No commit or push performed.
