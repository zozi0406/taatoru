# Post-Merge Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve every actionable review thread on PR #1 without sacrificing Taatoru's local-first behavior or durable WaniKani progress.

**Architecture:** Authentication will distinguish a cached returning session from a first-time online bootstrap. Full refreshes will fetch a complete generation before replacing SQLite data in one transaction. Reviews will use a pure reducer plus a SQLite-backed active-session repository, while lesson and review completion will commit their pending write and next session snapshot in the same transaction.

**Tech Stack:** Expo Router, React Native, TypeScript, SQLite through the repository `Database` interface, Jest, React Native Testing Library, Node 26.5.0 for local verification.

## Global Constraints

- Apply the work directly to the clean `main` branch, as explicitly requested.
- Keep the WaniKani API token in SecureStore and never place it in SQLite, fixtures, logs, or commits.
- Preserve usable cached data when startup or a full refresh loses connectivity.
- Queue exactly one durable WaniKani progress write per completed assignment.
- Write and run each regression test before its production change.
- Do not reply to or resolve GitHub review threads without separate authorization.

---

### Task 1: Preserve cached startup and gate first authentication

**Files:**
- Modify: `src/features/auth/AuthProvider.tsx`
- Test: `src/features/auth/__tests__/login.test.tsx`

**Interfaces:**
- Produces: `InitialSyncError`, cached `AuthManager.resume()`, and first-login cache validation.
- Consumes: `SyncResult`, `TokenStore`, and the cached `user.resource_json` row.

- [ ] **Step 1: Write failing authentication regression tests**

```ts
test('resumes from the cached user while startup synchronization is offline', async () => {
  await new ResourceRepository(harness.db).replaceUser(userFixture);
  harness.synchronize.mockResolvedValueOnce({ status: 'skipped', reason: 'offline' });
  await expect(harness.manager.resume('stored-token')).resolves.toEqual(userFixture);
});

test('does not authenticate or persist a token when the required initial sync fails', async () => {
  harness.synchronize.mockResolvedValueOnce({ status: 'failed', error: safeNetworkError });
  await expect(harness.manager.login('new-token')).rejects.toBeInstanceOf(InitialSyncError);
  expect(harness.tokenStore.set).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run RED**

Run: `npm test -- --runInBand src/features/auth/__tests__/login.test.tsx`

Expected: the cached resume still calls online validation, and failed `SyncResult` values currently resolve login.

- [ ] **Step 3: Implement the minimal authentication split**

```ts
async resume(token: string): Promise<Resource<UserData, 'user'>> {
  const cached = await this.cachedUser();
  if (cached === null) return this.login(token);
  void this.options.syncFactory(this.options.apiFactory(token)).synchronize('quick');
  return cached;
}
```

`login()` and `changeAccount()` will require `status === 'completed'` plus a cached user matching the validated account before persisting a first token. Same-account reauthentication may retain access from its existing cache if the opportunistic refresh fails.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- --runInBand src/features/auth/__tests__/login.test.tsx`

Expected: all authentication tests pass.

---

### Task 2: Commit a full refresh as one cache generation

**Files:**
- Modify: `src/features/sync/SyncEngine.ts`
- Modify: `src/features/sync/SyncRepository.ts`
- Test: `src/features/sync/__tests__/engine.test.ts`
- Test: `src/features/sync/__tests__/fullRefresh.test.ts`

**Interfaces:**
- Produces: `FullRefreshResources` and `SyncDataRepository.replaceFullRefresh(resources, now)`.
- Consumes: complete subject, assignment, study-material, user, level-progression, voice-actor, and review-statistic responses.

- [ ] **Step 1: Write failing fetch-before-replace and rollback tests**

```ts
test('a failed full-refresh fetch never replaces the cached generation', async () => {
  api.getAssignments.mockRejectedValueOnce(new NetworkError('offline'));
  await expect(engine.synchronize('full')).resolves.toMatchObject({ status: 'failed' });
  expect(repository.replaceFullRefresh).not.toHaveBeenCalled();
});

test('a failed full-refresh commit leaves every previous cache row and cursor intact', async () => {
  const repository = new SyncRepository(new FailBeforeCommitDatabase(db));
  await expect(repository.replaceFullRefresh(fullRefreshFixture(), NOW)).rejects.toThrow();
  await expect(previousCacheSnapshot(db)).resolves.toEqual(before);
});
```

- [ ] **Step 2: Run RED**

Run: `npm test -- --runInBand src/features/sync/__tests__/engine.test.ts src/features/sync/__tests__/fullRefresh.test.ts`

Expected: the engine clears through `prepareFullRefresh()` before its network requests and has no atomic replacement API.

- [ ] **Step 3: Stage network responses and replace inside one transaction**

```ts
export interface FullRefreshResources {
  readonly subjects: CollectionPage<SubjectData, SubjectObject>;
  readonly assignments: CollectionPage<AssignmentData, 'assignment'>;
  readonly studyMaterials: CollectionPage<StudyMaterialData, 'study_material'>;
  readonly user: Resource<UserData, 'user'>;
  readonly levelProgressions: readonly IdentifiedResource<LevelProgressionData, 'level_progression'>[];
  readonly voiceActors: CollectionPage<VoiceActorData, 'voice_actor'>;
  readonly reviewStatistics: CollectionPage<ReviewStatisticData, 'review_statistic'>;
}
```

The engine will fetch with null cursors and call `replaceFullRefresh()` only after every required response succeeds. The repository will snapshot recent mistakes, clear server-derived tables, use transaction-scoped repository writers, restore recent mistakes, and update all cursors inside the outer transaction. Any thrown write rolls the whole generation back.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- --runInBand src/features/sync/__tests__/engine.test.ts src/features/sync/__tests__/fullRefresh.test.ts`

Expected: full-refresh failures preserve the prior cache and successful refreshes replace it completely.

---

### Task 3: Add and wire durable review sessions

**Files:**
- Create: `src/features/reviews/reviewReducer.ts`
- Create: `src/features/reviews/reviewLauncher.ts`
- Create: `src/features/reviews/ReviewSessionRepository.ts`
- Create: `src/features/reviews/ReviewPrompt.tsx`
- Create: `src/features/reviews/ReviewSessionScreen.tsx`
- Create: `src/features/reviews/__tests__/reviewReducer.test.ts`
- Create: `src/features/reviews/__tests__/reviewSessionRepository.test.ts`
- Create: `src/features/reviews/__tests__/reviewSession.test.tsx`
- Create: `app/reviews/session.tsx`
- Modify: `app/(tabs)/index.tsx`
- Modify: `app/_layout.tsx`
- Test: `src/app/__tests__/layout.test.tsx`

**Interfaces:**
- Produces: `ReviewSessionSnapshot`, `reduceReview()`, `startReviewSession()`, and the `/reviews/session` route.
- Consumes: `DerivedRepository.getAvailableReviews()`, `checkAnswer()`, subjects reloaded by stable ID, and `PendingWriteRepository.completeReviewInTransaction()` from Task 4.

- [ ] **Step 1: Write failing reducer and durable-session tests**

```ts
test('completes meaning and reading once with separate error totals', () => {
  const afterMeaningError = reduceReview(snapshot, { type: 'incorrect' }, types);
  const afterMeaning = reduceReview(afterMeaningError.snapshot, { type: 'correct' }, types);
  const afterReading = reduceReview(afterMeaning.snapshot, { type: 'correct' }, types);
  expect(afterReading.completedItem).toMatchObject({
    incorrectMeaningAnswers: 1,
    incorrectReadingAnswers: 0,
  });
});

test('restores an active review queue and its current prompt after process restart', async () => {
  const started = await repository.startReviewSession(items, NOW);
  await repository.saveReviewSnapshot(nextSnapshot, NOW);
  await expect(repository.loadReviewSession()).resolves.toEqual(nextSnapshot);
});
```

- [ ] **Step 2: Run reducer and repository tests RED**

Run: `npm test -- --runInBand src/features/reviews/__tests__/reviewReducer.test.ts src/features/reviews/__tests__/reviewSessionRepository.test.ts`

Expected: the reducer, repository, and review snapshot types do not yet exist.

- [ ] **Step 3: Implement pure review progression and persistence**

```ts
export interface ReviewSessionSnapshot {
  readonly id: 'review';
  readonly kind: 'review';
  readonly phase: 'active' | 'complete';
  readonly items: readonly ReviewSessionItem[];
  readonly queuePosition: number;
  readonly currentPrompt: ReviewPrompt | null;
  readonly incorrectMeaningBySubject: Readonly<Record<string, number>>;
  readonly incorrectReadingBySubject: Readonly<Record<string, number>>;
  readonly createdAt: string;
  readonly updatedAt: string;
}
```

`startReviewSession()` will preserve the authoritative available-review order, cap the initial queue at 50 items, and persist it before navigation. The reducer will treat retry feedback as no transition, count incorrect submissions by prompt, skip reading for radicals and kana vocabulary, and emit one completion only after the required prompts pass.

- [ ] **Step 4: Write the failing UI and route-registration tests**

```ts
test('submits a review and shows the durable completion summary', async () => {
  fireEvent.changeText(screen.getByLabelText('Meaning answer'), 'ground');
  fireEvent.press(screen.getByRole('button', { name: 'Submit answer' }));
  await waitFor(() => expect(onCommitTransition).toHaveBeenCalledTimes(1));
  expect(await screen.findByText('Reviews complete')).toBeVisible();
});
```

- [ ] **Step 5: Run UI RED, implement the route, and run GREEN**

Run: `npm test -- --runInBand src/features/reviews src/app/__tests__/layout.test.tsx`

Expected after implementation: Home passes `onStartReviews={() => router.push('/reviews/session')}`, the protected stack registers the route, and a review can be completed from cached data while offline.

---

### Task 4: Commit lesson completion with its next snapshot

**Files:**
- Modify: `src/features/sync/PendingWriteRepository.ts`
- Modify: `src/features/sessions/SessionRepository.ts`
- Modify: `src/features/lessons/LessonSessionScreen.tsx`
- Modify: `app/lessons/session.tsx`
- Test: `src/features/sessions/__tests__/sessionRepository.test.ts`
- Test: `src/features/lessons/__tests__/lessonSession.test.tsx`

**Interfaces:**
- Produces: `PendingWriteRepository.completeLessonInTransaction()`, `completeReviewInTransaction()`, and `SessionRepository.commitLessonTransition()`.
- Consumes: `LessonTransition` from the pure lesson reducer.

- [ ] **Step 1: Write a failing atomic rollback test**

```ts
test('rolls back lesson completion when saving the next session snapshot fails', async () => {
  await expect(repository.commitLessonTransition(completedItem, nextSnapshot, NOW))
    .rejects.toThrow('injected snapshot failure');
  expect(await pendingProgressCount(db)).toBe(0);
  expect(await assignmentCount(db)).toBe(1);
  await expect(repository.loadLessonSession()).resolves.toEqual(previousSnapshot);
});
```

- [ ] **Step 2: Run RED**

Run: `npm test -- --runInBand src/features/sessions/__tests__/sessionRepository.test.ts src/features/lessons/__tests__/lessonSession.test.tsx`

Expected: completion and snapshot persistence are two callbacks and two transactions.

- [ ] **Step 3: Implement one transition callback and transaction**

```ts
commitLessonTransition(
  completedItem: LessonSessionItem | null,
  snapshot: LessonSessionSnapshot,
  now = new Date(),
): Promise<LessonSessionSnapshot>;
```

The screen will call a single `onCommitTransition(result)` callback. The repository transaction will queue the lesson start when `completedItem` is present, update the active-session JSON, and only then let the UI adopt the next snapshot.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- --runInBand src/features/sessions/__tests__/sessionRepository.test.ts src/features/lessons/__tests__/lessonSession.test.tsx`

Expected: both focused suites pass and a simulated snapshot failure leaves the assignment and prior session untouched.

---

### Task 5: Verify, review, commit, and publish main

**Files:**
- Modify: only files named by Tasks 1-4 plus this plan.

**Interfaces:**
- Consumes: all completed review fixes.
- Produces: a verified `main` commit pushed to `origin/main`.

- [ ] **Step 1: Run the complete verification gate**

Run: `npm run verify`

Expected: lint, TypeScript, every Jest suite, and every test pass on Node 26.5.0.

- [ ] **Step 2: Review the exact change boundary**

Run: `git status --short`, `git diff --check`, and `git diff --stat`

Expected: no unrelated files, whitespace errors, secrets, emulator artifacts, or generated native directories.

- [ ] **Step 3: Commit and push main**

```bash
git add app src docs/superpowers/plans/2026-08-04-post-merge-review-fixes.md
git commit -m "fix: address first-release review feedback"
git push origin main
```

- [ ] **Step 4: Verify the published ref**

Run: `git rev-parse HEAD origin/main` and `git status --short --branch`

Expected: both revisions match and `main` is clean while tracking `origin/main`.
