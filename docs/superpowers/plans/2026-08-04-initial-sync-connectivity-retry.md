# Initial Sync and Connectivity Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real-phase animated first-sync experience, recover interrupted setup through an explicit user choice, and retry durable uploads once when stable connectivity returns without request storms.

**Architecture:** A pure retry coordinator owns rising-edge detection, debounce, cooldown, single-flight, and server retry timing. Authentication distinguishes a pending setup credential from an active credential and reports synchronization phases to presentation. A lifecycle component adapts Expo Network events into the same coordinator and invokes the existing quick-sync boundary only when SQLite contains pending uploads.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript 6, Expo Network, Expo SecureStore, Expo SQLite, Reanimated 4, Zustand vanilla store, Jest 29, React Native Testing Library.

## Global Constraints

- Use the exact labels from the approved design, including `Connection issues`, `Setup was interrupted`, `Continue syncing`, and `Use another API key`.
- Automatic retry requires a real offline-to-online edge, two stable seconds, and sixty seconds since the previous automatic launch.
- Manual retry is single-flight and requires five seconds since the previous manual launch.
- A server `retryAt` blocks automatic and manual retry until that time.
- Never poll, recursively retry, or create one request per pending row.
- Never place an API token in navigation, logs, analytics, ordinary storage, or error text.
- Preserve settings while clearing incomplete account tables and synchronization cursors.
- Use Reanimated 4 with system reduced-motion behavior, not the legacy Animated API.
- Preserve the existing quick-sync request budget, ordering, and SQLite durability.

---

### Task 1: Deterministic retry coordinator

**Files:**
- Create: `src/features/connectivity/RetryCoordinator.ts`
- Create: `src/features/connectivity/__tests__/retryCoordinator.test.ts`

**Interfaces:**
- Consumes: an asynchronous attempt, eligibility predicate, clock, and timers.
- Produces: `RetryCoordinator` with connectivity, manual retry, retryAt, state, and disposal methods.

- [ ] **Step 1: Write the failing edge and single-flight tests**

Use Jest fake timers and this wished-for API:

```ts
const attempt = jest.fn(async () => undefined);
const coordinator = new RetryCoordinator({
  attempt,
  eligible: async () => true,
  now: () => Date.now(),
});
coordinator.updateConnectivity(false);
coordinator.updateConnectivity(true);
coordinator.updateConnectivity(true);
jest.advanceTimersByTime(1_999);
expect(attempt).not.toHaveBeenCalled();
await jest.advanceTimersByTimeAsync(1);
expect(attempt).toHaveBeenCalledTimes(1);
```

Also assert initial-online makes no attempt, in-flight work suppresses new launches, and disposal cancels scheduled work.

- [ ] **Step 2: Run RED**

Run `npm test -- src/features/connectivity/__tests__/retryCoordinator.test.ts --runInBand`.

Expected: FAIL because the coordinator does not exist.

- [ ] **Step 3: Implement the minimal public API**

```ts
export interface RetryCoordinatorState {
  readonly running: boolean;
  readonly retryBlockedUntil: number;
}

export interface RetryCoordinatorOptions {
  readonly attempt: () => Promise<void>;
  readonly eligible: () => Promise<boolean>;
  readonly now?: () => number;
  readonly stabilityMs?: number;
  readonly automaticCooldownMs?: number;
  readonly manualCooldownMs?: number;
  readonly onStateChange?: (state: RetryCoordinatorState) => void;
}

export class RetryCoordinator {
  updateConnectivity(reachable: boolean): void;
  retryNow(): Promise<boolean>;
  blockUntil(timestamp: string | null): void;
  getState(): RetryCoordinatorState;
  dispose(): void;
}
```

Use defaults `2_000`, `60_000`, and `5_000`. Only `false -> true` schedules automatic work. Coalesce timers, re-check eligibility immediately before launch, and never queue behind running work.

- [ ] **Step 4: Run GREEN**

Run the focused test and expect PASS.

- [ ] **Step 5: Add failing cooldown and retryAt tests**

Assert two reconnects inside sixty seconds launch once, two manual calls inside five seconds launch once, ineligible work makes no call, and `blockUntil('2026-08-04T12:01:00.000Z')` suppresses premature calls.

- [ ] **Step 6: Run RED, implement time gates, and run GREEN**

Track separate last-automatic and last-manual launch times and the maximum valid `retryAt`. Re-run the focused suite and expect PASS.

- [ ] **Step 7: Commit**

```sh
git add src/features/connectivity/RetryCoordinator.ts src/features/connectivity/__tests__/retryCoordinator.test.ts
git commit -m "feat: coordinate connectivity retries"
```

---

### Task 2: Pending credential, interrupted recovery, and real phases

**Files:**
- Modify: `src/features/auth/tokenStore.ts`
- Modify: `src/features/auth/AuthProvider.tsx`
- Modify: `src/features/auth/__tests__/login.test.tsx`
- Modify: `src/features/sync/SyncEngine.ts`
- Modify: `src/features/sync/syncStore.ts`
- Test: `src/features/sync/__tests__/fullRefresh.test.ts`

**Interfaces:**
- Consumes: `SyncEngine.store`, `SyncRepository.clearForLogout()`, and Task 1.
- Produces: pending-token storage, semantic `InitialSyncState`, interrupted recovery actions, and real phase reporting.

- [ ] **Step 1: Write failing pending-token lifecycle tests**

Extend mocked `TokenStore` with `getPending`, `setPending`, and `removePending`. Assert validation writes the normalized pending token before synchronization; failure retains it without writing active; success writes active then removes pending.

- [ ] **Step 2: Run RED**

Run `npm test -- src/features/auth/__tests__/login.test.tsx --runInBand`.

Expected: FAIL because pending-token methods do not exist.

- [ ] **Step 3: Implement pending SecureStore methods**

Extend `TokenStore` with:

```ts
getPending(): Promise<string | null>;
setPending(token: string): Promise<void>;
removePending(): Promise<void>;
```

Use key `wanikani-api-token-pending-setup` and `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Write pending after validation and before initial sync; on success write active then remove pending. Retain pending on failure.

- [ ] **Step 4: Run GREEN**

Run the auth suite and expect existing and new token tests PASS.

- [ ] **Step 5: Write failing interrupted-launch and cleanup tests**

With no active token and a pending token, render `AuthProvider` and assert `initialSync.status === 'interrupted'` without API calls. Assert Continue first clears account data/cursors and then starts a fresh validated sync. Assert Use another API key clears account data before removing pending and makes no API request. Seed a setting and verify cleanup preserves it.

- [ ] **Step 6: Run RED and implement interrupted recovery**

Add:

```ts
export type InitialSyncPhase =
  | 'account-connected'
  | 'subjects'
  | 'account-data'
  | 'offline-library';

export interface InitialSyncState {
  readonly status: 'running' | 'connection-issues' | 'attention' | 'interrupted';
  readonly phase: InitialSyncPhase;
  readonly message: string | null;
  readonly retryAt: string | null;
}
```

Extend `AuthContextValue` with `initialSync`, `retryInitialSync`, `continueInterruptedSetup`, and `useAnotherApiKey`. Prefer a working active token on boot and clear stale pending after resume. Without active, expose interrupted state and make no request.

- [ ] **Step 7: Verify interrupted recovery GREEN**

Run auth and full-refresh tests and expect PASS.

- [ ] **Step 8: Write failing phase and failure-classification tests**

Expose optional `readonly store?: SyncStore` on `SyncEngine`. Drive `phase-one`, `phase-two`, and `finalizing` through a real `createSyncStore()` and assert semantic reports `subjects`, `account-data`, and `offline-library`. Assert offline/network becomes `connection-issues`; other failures become `attention`; retain safe `retryAt`.

- [ ] **Step 9: Run RED, implement subscription/classification, and run GREEN**

Subscribe before `synchronize('quick')`, map real phases, and unsubscribe in `finally`. Give `InitialSyncError` safe structured fields instead of parsing messages. Run auth plus engine tests and expect PASS.

- [ ] **Step 10: Write failing initial-reconnect and manual retry tests**

Mock Expo Network and put `AuthProvider` into `connection-issues`. Emit offline then online, advance two seconds, and assert exactly one retry from duplicate callbacks. Press Retry now repeatedly and assert the same coordinator permits one launch. Assert interrupted state ignores connectivity entirely and a failed result passes its `retryAt` into the gate.

- [ ] **Step 11: Implement guarded initial retry and verify GREEN**

Add `AuthManager.retryPendingSetup(reporter)` to read the pending SecureStore token and continue the incomplete generation without clearing it. In `AuthProvider`, create one `RetryCoordinator` while setup is in `connection-issues` or `attention`, subscribe it to Expo Network, and route `retryInitialSync()` through `retryNow()`. Dispose on state change/unmount. Run the focused auth suite and expect PASS.

- [ ] **Step 12: Commit**

```sh
git add src/features/auth/tokenStore.ts src/features/auth/AuthProvider.tsx src/features/auth/__tests__/login.test.tsx src/features/sync/SyncEngine.ts src/features/sync/syncStore.ts src/features/sync/__tests__/fullRefresh.test.ts
git commit -m "feat: recover interrupted initial sync"
```

---

### Task 3: Animated initial-sync screen and recovery dialog

**Files:**
- Create: `src/features/auth/InitialSyncScreen.tsx`
- Create: `src/features/auth/__tests__/initialSyncScreen.test.tsx`
- Modify: `app/(auth)/login.tsx`
- Modify: `src/ui/__tests__/theme.test.tsx`

**Interfaces:**
- Consumes: `InitialSyncState` and auth actions from Task 2.
- Produces: accessible real-phase tracker, failure actions, and interrupted dialog.

- [ ] **Step 1: Write failing phase/accessibility tests**

Render every semantic phase. Assert all four approved labels are present, earlier rows are complete, the active row has `accessibilityState={{ busy: true }}`, and summary text is a polite live region.

- [ ] **Step 2: Run RED**

Run `npm test -- src/features/auth/__tests__/initialSyncScreen.test.tsx --runInBand`.

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the tracker**

Use a root `ScrollView`, centered surface card, real phase constants, and exact titles. Use Reanimated `FadeInUp`, `FadeIn`, `LinearTransition`, and a sub-300ms pulse with `ReduceMotion.System`. Keep text and symbols sufficient without color or motion.

- [ ] **Step 4: Run GREEN**

Run the component suite and expect PASS without act warnings.

- [ ] **Step 5: Write failing action and dialog tests**

Assert `Connection issues` explains automatic continuation and exposes `Retry now` plus `Use a different token`. Assert attention shows the safe error. Assert interrupted state opens a dialog named `Setup was interrupted`; its buttons invoke only matching callbacks.

- [ ] **Step 6: Run RED, implement actions/dialog, and run GREEN**

Use React Native `Modal` with a dimmed backdrop, `animationType="fade"`, and `accessibilityViewIsModal`. Disable retry/choice controls while busy and make safe errors selectable.

- [ ] **Step 7: Wire the route**

In `app/(auth)/login.tsx`, render `InitialSyncScreen` when `auth.initialSync !== null`; otherwise preserve `LoginScreen`. Pass every action explicitly and let reset remount login with an empty field.

- [ ] **Step 8: Run focused integration tests**

```sh
npm test -- src/features/auth/__tests__/initialSyncScreen.test.tsx src/features/auth/__tests__/login.test.tsx src/ui/__tests__/theme.test.tsx src/app/__tests__/layout.test.tsx --runInBand
```

Expected: PASS in light and dark themes.

- [ ] **Step 9: Commit**

```sh
git add src/features/auth/InitialSyncScreen.tsx src/features/auth/__tests__/initialSyncScreen.test.tsx app/'(auth)'/login.tsx src/ui/__tests__/theme.test.tsx
git commit -m "feat: show initial sync progress"
```

---

### Task 4: Connectivity-triggered pending upload recovery

**Files:**
- Create: `src/features/sync/ConnectivityUploadRetry.tsx`
- Create: `src/features/sync/__tests__/connectivityUploadRetry.test.tsx`
- Modify: `src/app/AppProviders.tsx`

**Interfaces:**
- Consumes: authenticated state, Expo Network events, Task 1, shared `synchronize`, and pending tables.
- Produces: one guarded quick sync after stable reconnect when durable uploads exist.

- [ ] **Step 1: Write failing queue eligibility tests**

Mock `Network.addNetworkStateListener` and capture its callback. An empty database must make no sync call after offline then online and two seconds. A seeded `pending_progress` row must produce exactly `synchronize('quick')` once.

- [ ] **Step 2: Run RED**

Run `npm test -- src/features/sync/__tests__/connectivityUploadRetry.test.tsx --runInBand`.

Expected: FAIL because the lifecycle component does not exist.

- [ ] **Step 3: Implement the lifecycle adapter**

```ts
interface ConnectivityUploadRetryProps {
  readonly authenticated: boolean;
  readonly db: Database;
  readonly synchronize: (mode: 'quick') => Promise<SyncResult>;
}
```

Eligibility counts both pending tables in one SQL query. Subscribe once to Expo Network, map reachability from `isConnected` and `isInternetReachable`, dispose on unmount, and feed failed-result `retryAt` to the coordinator. Never create a new API client or sync engine.

- [ ] **Step 4: Run GREEN**

Run the focused suite and expect PASS.

- [ ] **Step 5: Add failing no-storm/durability tests**

Assert initial-online and duplicate-online callbacks do nothing, flapping inside cooldown does not launch twice, events during unresolved sync do not queue work, unauthenticated state does nothing, and failed sync leaves the row stored.

- [ ] **Step 6: Run RED, finish guards, and run GREEN**

Use one coordinator per mounted lifecycle and callback refs where needed to avoid resubscription. Re-run the focused suite and expect PASS.

- [ ] **Step 7: Mount beneath AuthProvider**

Render the lifecycle component inside the authentication context in `AppProviders`, passing the existing database and shared runtime synchronize callback. Read `useAuth().status` inside a small child boundary.

- [ ] **Step 8: Run focused integration and commit**

```sh
npm test -- src/features/sync/__tests__/connectivityUploadRetry.test.tsx src/features/sync/__tests__/engine.test.ts src/app/__tests__/layout.test.tsx --runInBand
git add src/features/sync/ConnectivityUploadRetry.tsx src/features/sync/__tests__/connectivityUploadRetry.test.tsx src/app/AppProviders.tsx
git commit -m "feat: retry uploads after reconnect"
```

---

### Task 5: Full and Android verification

Local verification for this implementation must run on Node.js 22, matching
`.nvmrc` and the repository's declared range (`>=22.13 <23`). This
implementation was verified on Node.js 22.23.2.

**Files:**
- Modify only if verification exposes a tested defect within this scope.

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: automated, bundle, and emulator evidence.

- [ ] **Step 1: Run `npm run verify`**

Expected: lint, TypeScript, and all Jest suites PASS without warnings.

- [ ] **Step 2: Export Android production bundle**

Run `npx expo export --platform android --output-dir /private/tmp/taatoru-initial-sync-export`.

Expected: Android bundle and assets emit successfully.

- [ ] **Step 3: Exercise initial setup on the dedicated Taatoru emulator**

Verify real phase transitions, `Connection issues`, one attempt from repeated Retry taps, one attempt after stable reconnect, dark theme, large text, TalkBack-readable status, and reduced motion where practical.

- [ ] **Step 4: Exercise killed-app recovery**

Terminate during initial sync, relaunch, and verify no API activity before the dialog choice. Continue must clear partial data/cursors and restart at the first phase. A second interruption followed by Use another API key must return to an empty token form.

- [ ] **Step 5: Exercise pending-upload reconnect**

Complete a controlled lesson/review offline, confirm one waiting change, restore connectivity, and verify one quick sync. Toggle connectivity again inside sixty seconds and verify no second automatic sync.

- [ ] **Step 6: Review final state**

Run `git diff --check`, `git status --short`, and `git log -6 --oneline`. Confirm only scoped changes and documented commits remain.
