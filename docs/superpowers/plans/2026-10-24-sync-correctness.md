# Synchronization Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task after the design and plan are approved. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every 24 October sync-audit failure and demonstrate that Taatoru preserves the useful reliability protections of both reference clients without inheriting their known shared failure handling.

**Architecture:** Keep current SQLite/resource/session boundaries. Add a runtime coordinator backed by database ownership and account fencing, durable operation states, and effective local overlays. All network entry points share pacing, preflight, and reconciliation rules; existing transactional completion and full refresh remain.

**Tech Stack:** Existing TypeScript, Expo SDK 57, React Native, expo-sqlite, Zustand, Jest, better-sqlite3; Node 22.13 or newer within Node 22. No new production framework or dependency is assumed.

**Spec:** [2026-10-24-sync-correctness-design.md](../specs/2026-10-24-sync-correctness-design.md). Read the concurrent [study-UX design](../specs/2026-10-24-study-ux-design.md) and [plan](2026-10-24-study-ux.md) before touching their files.

## Global Constraints

- Only Taatoru changes. Tsurukame and Smouldering Durtles remain read-only.
- Preserve all existing visual and study-UX changes.
- Keep existing cache tables and pending tables. Add schema version 2 through ordered migrations; do not rewrite version 1 or clear a user's database.
- Store no credential or token fingerprint in SQLite.
- Do not hold a database transaction open over a network request.
- Do not query review history: that API is deprecated and returns no reviews.
- No raw answer, note, synonym, account payload, or token enters diagnostics.
- Do not ship a partial milestone as fully hardened.
- This document authorizes planning only; no product implementation, dependency installation, schema change, or real-account write has been performed.

## Review Focus

- A response arriving after logout, token rotation, or ownership expiry cannot modify the new account; cover in Tasks 3, 6, and 10.
- Legacy pending rows with deleted assignments preserve their content and reconcile without invented provenance; cover in Tasks 2 and 7.
- A remote reset followed by re-leveling is detected even if user level is unchanged; cover in Task 6.
- Server-accepted writes with lost responses or crash before acknowledgement do not become later review attempts; cover in Tasks 7 and 11.
- Local/remote edits while subject data changes preserve effective synonyms, FTS search, and answer acceptance; cover in Tasks 4, 8, and 10.

## Work boundaries and interfaces

Paths below are relative to `taatoru/`. Re-read the current files when each task starts: study-UX work is active, so line numbers and behavior can move. Integrate existing fixes rather than overwriting them.

New production files have these responsibilities:

| File | Responsibility |
|---|---|
| `src/db/migrations/002_sync_control.ts` | Additive migration and legacy backfill, including control/outcome metadata |
| `src/features/sync/SyncControlRepository.ts` | Account transitions, ownership fences/leases, persistent scheduling metadata |
| `src/features/sync/FencedDatabase.ts` | Enforce owner/account validity inside synchronization write transactions |
| `src/features/sync/PendingStateRepository.ts` | Apply effective projections/materials/FTS consistently in one transaction |
| `src/api/RequestScheduler.ts` | Request deadlines, serial pacing, budget enforcement and server delay persistence |
| `src/features/sync/WriteReconciler.ts` | Reconcile uncertain progress, reset conflicts, and material identity/conflicts |
| `src/features/sync/SyncCoordinator.ts` | Wakeup coalescing, foreground draining, background slices, shared store |

Use `src/features/sync/types.ts` for the shared types below; API receipt/resource types live in `src/api/types.ts` and `WaniKaniApi.ts`. Exact interfaces are proposed here to keep tasks compatible; change them coherently if implementation evidence warrants it.

```ts
type AccountContext = Readonly<{
  userId: string;
  accountEpoch: number;
  credentialRevision: number;
}>;
type SyncLease = Readonly<{
  context: AccountContext;
  ownerFence: number;
  expiresAtMs: number;
}>;
type SyncTrigger =
  | 'enqueue' | 'startup' | 'foreground' | 'reconnect'
  | 'manual' | 'credential-repair' | 'background';
type PendingDeliveryState = 'queued' | 'in_flight' | 'uncertain' | 'rejected';
type OperationKey = string; // persisted `${accountEpoch}:${sequence}`
type QueueSummary = Readonly<{
  pending: number; uncertain: number; rejected: number;
  nextAttemptAt: string | null;
}>;
```

`pending` is the total of all four delivery states; uncertain/rejected are subsets. Future retry times do not remove work from the total or permit a fully-synchronized status.

`PendingOperation` is a discriminated union containing the operation key/revision, context, state, source assignment or material baseline, immutable payload, projection, attempt count, and next-attempt metadata specified in the design. `ProgressReceipt` contains the returned assignment and optional review statistic; `MaterialReceipt` is the returned study-material resource. Define these fully in Tasks 2 and 5 rather than using `any` or placeholder IDs.

`CredentialReservation = Readonly<{ transitionId: number; credentialRevision: number; credentialKey: string; previousAccount: AccountContext | null }>` identifies an auth transition before the new identity has been validated. `RequestContext = SyncLease | CredentialReservation` permits only fenced sync dispatches or read-only credential validation. Do not require a fictitious account context for first login.

## Task 1: Capture regressions and the reference contract

**Files:** Create `docs/verification/sync-reference-matrix.md`; extend existing tests under `src/features/sync/__tests__/`, `src/api/__tests__/`, and `src/features/reviews/__tests__/`.

**Interfaces:** Consumes current public repositories/API/screens; produces permanent fixture cases, not production test switches.

- [ ] Record the current dirty-file baseline and the exact local reference revisions. Re-run the relevant suites under Node 22 and record current results; the earlier audit baseline was 23 suites/151 tests, not a guaranteed current count.
- [ ] Port the temporary audit reproductions into regression tests: completed SRS 2→3 remains 3 and unavailable after stale import; local note remains effective; logout leaves all old-account rows absent after late response; two engine instances cause only one dispatch; 10,000 dense IDs with 500-per-page responses yield 10,000 unique records; an early-page edit appears in the next incremental run.
- [ ] Add each regression with its expected correct assertion alongside the task that fixes it; run its focused Jest path and confirm the intended failure before implementing that task. Do not commit a permanently red default suite merely to warehouse all failures in advance.
- [ ] Build the matrix for durable completion, immediate upload, serialization, pacing, patch reconciliation, pending preservation, resets, and rejected writes. Each row names the local reference mechanism, its limitation, Taatoru's intended behavior, and a test/evidence path.

## Task 2: Add durable account, ownership, and operation metadata

**Files:** Modify `src/db/schema.ts`, `src/db/migrate.ts`, `src/features/sync/types.ts`, `src/features/sync/PendingWriteRepository.ts`; create `src/db/migrations/002_sync_control.ts`, `src/features/sync/SyncControlRepository.ts`, `src/db/__tests__/migrationV2.test.ts`, `src/features/sync/__tests__/syncControl.test.ts`.

**Interfaces:** Produce `getAccountContext(): Promise<AccountContext | null>`, `assertAccount(tx, context): Promise<void>`, `acquire(context, now): Promise<SyncLease | null>`, `renew(lease, now): Promise<SyncLease>`, `release(lease): Promise<void>`, and `allocateOperationKey(tx, accountEpoch): Promise<OperationKey>`. Persist the auth/lease/sequence/reset/rate metadata, immutable `sync_dispatches` revisions, and bounded redacted outcomes in schema v2. All arguments use the existing `DatabaseTransaction` type and injected clocks.

- [ ] Write failing tests for 0→2 and populated 1→2 migration, unchanged queue payloads/settings/sessions, missing assignment provenance, transaction rollback, reopen/idempotence, and two connections racing to migrate. Assert both schema version stores become 2 only on commit.
- [ ] Write failing ownership tests: one successful acquire across two connections, renew by current fence only, expiry increments the fence, logout never resets counters, and dead-owner in-flight operations become uncertain. Assert a new pending material revision cannot erase the old dispatched baseline/payload/state.
- [ ] Implement ordered migrations with a version recheck under the write lock; handle SQLite contention with bounded retry. Extend enqueue atomically with account identity, operation sequence/revision, baseline/projection, and delivery state. Unknown legacy baselines remain explicitly unknown and require reconciliation.
- [ ] Run `npm test -- --runInBand src/db src/features/sync/__tests__/syncControl.test.ts src/features/sync/__tests__/pendingWrites.test.ts`; require all pass. Review and commit only this task's files.

## Task 3: Enforce ownership and make account changes safe

**Files:** Create `src/features/sync/FencedDatabase.ts`; modify `SyncControlRepository.ts`, `SyncEngine.ts`, `SyncRepository.ts`, `src/features/auth/{AuthProvider.tsx,tokenStore.ts}`, `src/app/AppProviders.tsx`, `src/features/notifications/backgroundTask.ts`; tests in `syncControl.test.ts`, `engine.test.ts`, `src/features/auth/__tests__/login.test.tsx`, and `src/app/__tests__/bootstrap.test.tsx`.

**Interfaces:** Produce `FencedDatabase(db: Database, lease: SyncLease, now: () => number) implements Database`; `beginCredentialTransition(): Promise<CredentialReservation>`; `activateCredentials(reservation: CredentialReservation, userId: string, replaceAccount: boolean): Promise<AccountContext>`; `invalidateAccount(context: AccountContext): Promise<void>`. Add `TokenStore.getCredential(key: string): Promise<string | null>`, `setCredential(key: string, token: string): Promise<void>`, and `removeCredential(key: string): Promise<void>`. Each synchronization engine requires its lease/context; local session writes assert their account context without acquiring the network lease.

- [ ] Fail the two-engine, foreground/background, late full-refresh, token-rotation, and account A→B callback tests first. Add interrupted SecureStore update/restart, offline cached access, SQLite lock-contention, and an old login whose SecureStore write completes after newer credentials activate.
- [ ] Route every sync creation path through lease acquisition. Put account/fence checks inside resource/cursor/acknowledgement write transactions and immediately before dispatch; invalidate callbacks/store/finalizers when context changes.
- [ ] Implement the journal using unique `taatoru.credential.<revision>` slots and conditional SQLite pointer activation. Late old writes produce unreachable slots, never overwrite active credentials. Handle migration from the legacy token/pending-token keys, missing slots, stale reservations, and safe orphan cleanup. Preserve pending data on same-account credential repair; ensure logout/replacement invalidates owners before clearing. Add the pending-work upload/cancel/explicit-discard flow at the existing auth UI seam.
- [ ] Run `npm test -- --runInBand src/features/auth src/app src/features/sync`; require the late-callback/independent-connection assertions pass. Commit the isolated ownership change; final coordinator wiring follows in Task 9.

## Task 4: Make local pending state survive every refresh

**Files:** Create `src/features/sync/PendingStateRepository.ts`; modify `PendingWriteRepository.ts`, `SyncRepository.ts`, all relevant repositories under `src/db/repositories/`, `src/features/home/dashboard.ts`, `src/features/subjects/subjectDetails.ts`, `src/features/notifications/NotificationService.ts`, and session eligibility loaders. Tests: `pendingWrites.test.ts`, `fullRefresh.test.ts`, repository availability/resource tests, home/notification/session tests.

**Interfaces:** Produce `applyPendingState(tx: DatabaseTransaction, subjectIds?: readonly number[]): Promise<void>` and a shared `NO_ACTIVE_PENDING_PROGRESS` SQL predicate. Existing assignment scalar fields remain server truth; effective subject progress/material values are rebuilt through this seam. It must support an enclosing full-refresh transaction.

- [ ] Write failing tests for completion after the sync snapshot, unselected quota-limited writes, quick/full refresh with real pending subjects, notes/synonyms during a download, and subject-only updates preserving search synonyms.
- [ ] Stop deleting assignments at completion. Exclude active pending progress from launch/availability queries; import server rows without replacing pending effective projections. Reapply overlays inside full-refresh transactions and rebuild FTS from effective materials.
- [ ] Test all consumers: lessons/reviews unavailable while pending; SRS counts/mistakes stable; details/answer synonyms/search show newest local values; notifications and forecasts never resurrect stale due work. Acknowledgement/supersession removes only the matching overlay.
- [ ] Run `npm test -- --runInBand src/db/repositories src/features/sync src/features/home src/features/sessions src/features/notifications src/features/subjects`; require all pass and commit.

## Task 5: Fix pagination and expose authoritative API outcomes

**Files:** Modify `src/api/{types,WaniKaniApi,HttpWaniKaniApi,pagination,date}.ts`, API tests, `src/features/sync/SyncRepository.ts`, resource importers, and affected API fixtures.

**Interfaces:** Produce `getAssignment(id: number, signal?: AbortSignal): Promise<IdentifiedResource<AssignmentData, 'assignment'>>`, `getResets(updatedAfter: string | null, signal?: AbortSignal): Promise<CollectionPage<ResetData, 'reset'>>`, `findStudyMaterial(subjectId: number, signal?: AbortSignal): Promise<MaterialReceipt | null>`, and `findReviewStatistic(subjectId: number, signal?: AbortSignal): Promise<IdentifiedResource<ReviewStatisticData, 'review_statistic'> | null>`. Change `startAssignment`/`createReview` to `Promise<ProgressReceipt>` and `upsertStudyMaterial` to `Promise<MaterialReceipt>`. Preserve input cancellation support.

- [ ] Fail tests for dense/sparse IDs, actual 500/1,000 page limits, empty pages, duplicates, repeated URLs, mid-stream failure, and an already-read row changing between pages. Preserve six-digit timestamps and compare server versions without truncating through JavaScript `Date`.
- [ ] Remove speculative pagination from production collection paths. Follow actual continuation URLs, keep the first response watermark, and replay a one-second overlap on subsequent incremental reads. Keep the previous cursor for empty results and reject older row versions. Targeted receipts never advance collection cursors.
- [ ] Fail and implement typed decoding of assignment-start, review `resources_updated`, material-create/update, reset, and subject-filtered material lookup responses, including validation of identity/stage/time/counter fields used by reconciliation. A malformed successful write is distinguishable from a definite rejection. Review receipt `id: 0` is not an operation identifier. Do not add review-history reads.
- [ ] Run `npm test -- --runInBand src/api src/features/sync src/db/repositories`; require all pass and commit. Account for changed mock return types across the complete test suite.

## Task 6: Revalidate resets, hidden subjects, and multi-device state

**Files:** Modify `SyncEngine.ts`, `SyncRepository.ts`, `SyncControlRepository.ts`, `HttpWaniKaniApi.ts`, assignment/subject eligibility queries, `ReviewSessionRepository.ts`, `SessionRepository.ts`; extend sync, availability, subscription, and session tests.

**Interfaces:** Produce `preflight(lease: SyncLease, signal: AbortSignal): Promise<void>` in `SyncEngine.ts`, using the Task 5 reset/assignment reads. Successful preflight persists the checked reset baseline under the lease. Progress delivery consumes this validated batch context; it cannot bypass preflight.

- [ ] Fail tests for visible→hidden, unlocked→locked, level 8→1 with level-60 grant, same-level reset, reset then re-level to the original level, a pending completion spanning reset, and a resumed session with replaced assignment IDs.
- [ ] Remove synchronization scope filters that conceal hidden/locked transitions. Cache transitions and apply consistent user-facing filtering. Fetch user/reset state before progress writes and revalidate relevant assignments; a failed preflight retains the queue and prevents unsafe writes.
- [ ] Rebuild affected progress caches on a newly confirmed reset and classify old operations for reconciliation; preserve material edits/settings. Revalidate/prune sessions through the study-UX seam rather than replacing its resume behavior. Cover a reset occurring after preflight with a rejected-write reconciliation test.
- [ ] Run `npm test -- --runInBand src/features/sync src/db/repositories src/features/sessions src/features/reviews/__tests__/reviewSessionRepository.test.ts src/features/lessons`; require all pass and commit.

## Task 7: Reconcile progress instead of blindly retrying or dropping it

**Files:** Create `src/features/sync/WriteReconciler.ts`; modify `PendingWriteSender.ts`, `PendingWriteRepository.ts`, `SyncRepository.ts`, sync types; create `src/features/sync/__tests__/writeReconciliation.test.ts` and extend pending-write tests.

**Interfaces:** Produce `reconcileProgress(operation: PendingOperation, lease: SyncLease, signal: AbortSignal): Promise<OperationResolution>`. Define `OperationResolution` as acknowledged receipt, superseded authoritative state/reason, retry-at, or attention-required reason. Produce `settleProgress(operation, resolution, lease): Promise<void>` in `SyncRepository`, atomically importing authoritative state, conditionally acknowledging operation revision, recording redacted outcome, and reapplying any newer overlay.

- [ ] Fail tests for server acceptance followed by lost response, crash before/after response/ack, expired owner with a request outstanding, already-reviewed elsewhere, metadata-only assignment update, due-time change without counter changes, 422 with unchanged valid assignment, malformed payload, 401/403/429/5xx, unknown legacy baseline, and clock skew of ±10 minutes.
- [ ] Persist `in_flight` before sending and freeze a validated wire completion timestamp. Reuse identical timestamp/counts on retry, including recent reviews; never move an old review into a later due cycle. Send no mutation solely because an expired lease became available.
- [ ] Consume typed success receipts and settle transactionally. On ambiguous/422 outcomes fetch current assignment/reset/statistic state and implement the design's explicit opportunity rules: metadata-only changes remain retryable; consumed cycles require counters plus changed due/burned state; vacation/scheduling changes are not proof of completion; unknown provenance remains actionable. Do not claim own-review acceptance merely from advanced remote stage.
- [ ] Ensure one rejected item does not block unrelated uploads or resource downloads. Run `npm test -- --runInBand src/features/sync`; require all reconciliation fault cases pass and commit.

## Task 8: Repair study-material identity and edit conflicts

**Files:** Extend `WriteReconciler.ts`, `PendingWriteSender.ts`, `PendingWriteRepository.ts`, `PendingStateRepository.ts`, `StudyMaterialRepository.ts`, subject edit/detail flows; extend `pendingWrites.test.ts`, `writeReconciliation.test.ts`, and details tests.

**Interfaces:** Produce `reconcileMaterial(operation: PendingOperation, lease: SyncLease, signal: AbortSignal): Promise<OperationResolution>`; use Task 5 lookup/receipt APIs and exact pending revisions. Include original server field baselines in material operations; do not overwrite the current pending content when rebinding a server ID.

- [ ] Fail tests for create success then edit-before-ack, lost create response, duplicate-create response, stale-ID update 404, failed lookup, newer pending edit after acknowledgement, and server/local disjoint versus same-field edits. Kill/reopen after sending revision 1 and queueing revision 2; matching remote revision-1 values must rebase revision 2 rather than become a false external conflict.
- [ ] Atomically import returned material IDs and update surviving newer revisions. Reconcile immutable older dispatches before the subject's newer revision; matching remote dispatched values satisfy/rebase that older revision without replacing newer desired content. On ambiguous create or missing target, look up by subject; only a successful empty lookup permits creation. Merge disjoint field edits; retain original/dispatched/local/remote values and surface same-field conflict for explicit resolution. Treat the synonym array as one editable field.
- [ ] Confirm pending notes/synonyms survive each error/full refresh, no second POST occurs after creation is established, and malformed/rejected edits cannot starve other work. Add a late-old-PUT/newer-revision race fixture: assert preserved local revision evidence and classify the unpreventable remote ordering limit honestly rather than asserting server CAS. Run `npm test -- --runInBand src/features/sync src/features/subjects`; require all pass and commit.

## Task 9: Drive delivery through one paced, persistent coordinator

**Files:** Create `src/api/RequestScheduler.ts`, `src/features/sync/SyncCoordinator.ts`; modify `SyncEngine.ts`, `budget.ts`, `SyncControlRepository.ts`, `AppProviders.tsx`, `AuthProvider.tsx`, connectivity retry adapters, `backgroundTask.ts`, lesson/review routes, and material enqueue callers. Create scheduler/coordinator/background tests.

**Interfaces:** Produce `RequestScheduler.run<T>(operation: (signal: AbortSignal) => Promise<T>, context: RequestContext, signal?: AbortSignal): Promise<T>`; `SyncCoordinator.request(trigger: SyncTrigger, mode?: 'quick' | 'full'): Promise<SyncResult>`; `notifyPendingWrites(): void`; `setForeground(active: boolean): void`; `dispose(): void`; and `store: SyncStore`. Use injected clock, timer, and randomness. Extend `SyncResult` with queue summary and complete/partial/attention state, retaining explicit offline/ownership-busy results.

- [ ] Fail fake-timer tests for immediate online enqueue, initially-online startup, foreground resume, reconnect stability, repeated 429, server delay beyond local backoff, 100 queued writes crossing quota windows, enqueue during sync, full-refresh promotion, and restart during a persisted wait.
- [ ] Implement one-in-flight, 1,100-ms minimum spacing, 30-second deadline, valid server budgets, durable 429/reset deadlines, and 2→60-second capped exponential retry with up to 20% jitter. Apply it to every actual HTTP request, not just selected uploads; delete obsolete estimated-budget assumptions after coverage replaces them.
- [ ] Wire auth/manual/connectivity/enqueue/foreground/background entry points to the coordinator. Notify only after local commit succeeds; enqueue-triggered network delivery must not delay the next study prompt. Recheck the queue after every batch and wait to the next eligible time while foregrounded. Background gets a 20-second slice, persists continuation, and yields instead of waiting through long quota blocks. Do not duplicate existing initial-login retry timers.
- [ ] Run `npm test -- --runInBand src/api src/features/sync src/features/connectivity src/features/auth src/app src/features/notifications`; require all pass. Confirm auth and background no longer construct uncoordinated engines; commit.

## Task 10: Serialize study transitions and report actual sync state

**Files:** Integrate existing study-UX work in `ReviewSessionScreen.tsx`, `ReviewPrompt.tsx`, `LessonSessionScreen.tsx`, `LessonQuizStage.tsx`, `LessonSubjectStage.tsx`, session repositories/loaders and routes; modify `syncStore.ts`, home/dashboard, `SyncStatus.tsx`, subject details, auth notices. Tests: existing screen/session/home/detail suites and coordinator lifecycle tests.

**Interfaces:** Shared screen props expose busy/disabled behavior where needed; repositories consume `AccountContext` for durable transitions. Use coordinator store/queue summary from Task 9 and effective material synonyms from Task 4, not another synchronization service.

- [ ] Reproduce the exact pending-wrong-answer/correct-answer race: hold commit unresolved, submit again, and assert only one transition accepted; after settlement the next completion includes the original mistake. Test lesson navigation, Continue/override, double Finish, Exit, failed commit/retry, unmount, logout, and restored session. Picker cancellation creates no pending progress and makes no remote assignment mutation; the ordinary automatic lessons route remains supported.
- [ ] Apply a synchronous guard before reducer evaluation and disable conflicting actions until commit settles. Advance only on durable success; preserve retryable input on failure. Integrate the accepted-synonym data path in real sessions. If the study-UX task already implements these rules, retain it and add the missing audit regression rather than replacing it.
- [ ] Wire invalidation after local and server commits to account-scoped consumers. Assert 48 remaining queued writes are reported pending, a library refresh is not labeled fully uploaded, rejected/uncertain items are visible, and late old-account store/notification updates are ignored.
- [ ] Run `npm test -- --runInBand src/features/reviews src/features/lessons src/features/sessions src/features/home src/features/subjects src/features/notifications src/app`; require all pass and commit.

## Task 11: Exercise complete fault sequences on SQLite and Android

**Files:** Create `src/features/sync/__tests__/faultSequences.test.ts`, test-only fixture/replay helpers under `src/test/sync/`, and `docs/verification/sync-correctness.md`; extend actual Expo database tests/native test harness only as needed.

**Interfaces:** Test harness composes real repositories/coordinator with a controlled `WaniKaniApi` and request barriers. Use two independently opened connections to one temporary database file, and a fixture-backed Android app harness. Do not add a production switch that bypasses ownership/auth checks.

- [ ] Test complete sequences: offline finish→kill→reopen→reconnect→drain; upload accepted→connection lost→owner killed→reconcile; full-refresh failure after pending edits; overlapping foreground/background→logout→new account→late callback; quota exhaustion→restart→deadline→drain; reset→re-level→resume; material-create→new edit→lost response→lookup→PUT.
- [ ] Add deterministic generated event sequences using fixed seeds and injected barriers, asserting the ten design invariants after every step. Log only scenario/operation identifiers and counts.
- [ ] Verify contention/lease/migration behavior through the real Expo SQLite adapter on Android. An in-memory Node test alone cannot establish cross-runtime/device behavior. Test sleep/wake, force-stop/restart, interrupted background execution, and wall-clock changes.
- [ ] Run `npm run verify` under Node 22. Build with the existing Android build workflow (`npm run android`, without committing generated native directories), then run the fixture-backed scenarios and ordinary study/picker/cancel/rotation/dark/large-text/long-list checks. Record exact commands/results and unsupported checks; do not call a compiled test a device pass.

## Task 12: Close the reference matrix and release review

**Files:** Update `docs/verification/sync-reference-matrix.md`, `docs/verification/sync-correctness.md`, `docs/wanikani-api.md`, and release documentation only where behavior changed.

**Interfaces:** Consumes all task evidence; produces a reviewed release decision, not additional architecture.

- [ ] Map audit findings 1–7, the two pagination defects, the note-overlay defect, and the answer race to passing permanent tests. Record reference strengths preserved and shared reference shortcuts replaced. The matrix must have no unexplained regression or unresolved high-impact correctness failure.
- [ ] Review the complete diff, migration/rollback behavior, API contracts, request counts, and queue UX. Obtain an independent correctness review focused on ownership expiry, reset timing, ambiguous acknowledgement, and operation-version checks; resolve its findings with regression tests.
- [ ] Retain current approximate local SRS projection unless a separately justified exact-scheduling task is approved; display authoritative due times only. Document background timing and ambiguous-outcome limits. Conditional requests and level-progression download optimizations remain follow-on efficiency work unless correctness tests uncover a dependency.
- [ ] Re-run changed areas after review fixes; require the complete `npm run verify` gate and documented Android device gate before declaring release readiness. Report missing physical-device/iOS evidence honestly.

## Dependency order and checkpoints

Tasks 1–3 establish durable identity/ownership; Tasks 4–6 establish effective state and authoritative reads; Tasks 7–8 settle writes; Task 9 wires reliable delivery; Task 10 integrates UI; Tasks 11–12 gate release. Tasks may be independently reviewed, but intermediate commits are not release-ready. For overlapping study-UX files, coordinate sequencing at execution time and merge its current behavior before adding sync changes.

Each implementation task ends with focused passing tests, a scope/diff review, and a coherent commit containing only its own files. Prefer running the existing focused suites during development; broaden once at the release gate and again only when review changes require it.

## Explicit limits

No client can discover remote changes while fully offline, force the OS to run background tasks immediately, or prove every lost review response through a deprecated history endpoint. Material updates have no documented compare-and-set primitive, so a remote change after preflight or an older still-running PUT can race a newer local PUT. Fixed review timestamps constrain this client's attempts under the documented server validation; they do not make preflight atomic with remote resets/progress. The plan addresses those limits through persisted work, fixed retry identity, authoritative state reconciliation, observed-conflict handling, explicit unresolved outcomes, and testable release criteria. It does not promise undocumented server idempotency, globally conflict-free notes, or zero unknown bugs.
