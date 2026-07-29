# Taatoru First Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Android-first Expo app with Tsurukame-compatible WaniKani
sync, lessons, reviews, search, analytics, and local review notifications.

**Architecture:** Expo SDK 57 and Expo Router provide the Android application
shell. SQLite is the durable source of truth behind repository interfaces,
while a tested sync engine coordinates a typed WaniKani API client, durable
pending writes, derived queries, and notifications. Lessons and reviews use
persisted session snapshots with pure selection, ordering, and answer-checking
logic so the risky behavior is testable outside React Native.

**Tech Stack:** Expo SDK 57.0.8, React Native 0.86, React 19.2.3, TypeScript,
Expo Router, expo-sqlite, expo-secure-store, expo-notifications,
expo-background-task, expo-audio, Zustand, Jest, React Native Testing Library,
better-sqlite3 for repository contract tests, and Maestro for Android flows.

## Global Constraints

- Working app name: Taatoru.
- Android application ID: `app.taatoru`.
- Initial platform: Android 7+ with compile and target SDK 36.
- Use Node.js 22.13.x or newer Node 22 LTS; do not use the currently active
  Node 25 runtime for dependency installation or release verification.
- Use Android Studio's bundled JDK 21 at
  `/Applications/Android Studio.app/Contents/jbr/Contents/Home`.
- Use a development build and Continuous Native Generation; generated
  `android/` and `ios/` directories stay untracked.
- TypeScript uses strict type checking and production code contains no `any`.
- SQLite runs in WAL mode with foreign keys enabled and bound parameters for
  user-controlled values.
- The WaniKani token is stored only in SecureStore and is never logged.
- Synchronization behavior is characterized against Tsurukame revision
  `8e18ddf7f12c44e91cb0ad63bab31af7440648ea`.
- Recent mistakes use Tsurukame's 24-hour rules but remain device-local.
- Visually similar kanji use only WaniKani
  `visually_similar_subject_ids`; do not bundle community datasets.
- The dashboard, navigation, analytics, search, and settings use Taatoru's
  original clean minimal visual system.
- Lessons and reviews preserve Tsurukame's immersive subject-colored
  composition and task hierarchy.
- Taatoru is Apache-2.0 and credits Tsurukame in `NOTICE.md`, the README, and
  the in-app open-source licenses screen.
- Automated tests use invented fixtures and never call or mutate a live
  WaniKani account.

---

## Milestone 1: Local-first foundation and sync parity

### Task 1: Scaffold the Expo development-build repository

**Files:**
- Create: `.nvmrc`
- Create: `.gitignore`
- Create: `package.json`
- Create: `package-lock.json`
- Create: `app.config.ts`
- Create: `tsconfig.json`
- Create: `eslint.config.js`
- Create: `jest.config.js`
- Create: `jest.setup.ts`
- Create: `app/_layout.tsx`
- Create: `app/index.tsx`
- Create: `src/test/render.tsx`
- Create: `src/app/__tests__/bootstrap.test.tsx`
- Create: `LICENSE`
- Create: `NOTICE.md`
- Create: `README.md`

**Interfaces:**
- Produces: Expo Router entry point and the `renderApp()` test helper.
- Produces: npm scripts `start`, `android`, `test`, `test:watch`, `lint`,
  `typecheck`, `verify`, and `prebuild:check`.

- [ ] **Step 1: Generate the SDK 57 template without touching the repository
  history**

  Use Node 22 LTS. Generate into a temporary directory because `taatoru/`
  already contains committed documentation:

  ```bash
  npx create-expo-app@4.0.0 /tmp/taatoru-expo-template \
    --template default@sdk-57 --yes --no-install --no-agents-md
  ```

  Copy only the generated application and configuration files into `taatoru/`;
  do not copy `.git`, generated native directories, example screens, or
  generated agent instructions. Preserve `docs/`.

- [ ] **Step 2: Write the failing bootstrap test**

  ```tsx
  // src/app/__tests__/bootstrap.test.tsx
  import { screen } from '@testing-library/react-native';
  import IndexScreen from '../../../app/index';
  import { renderApp } from '../../test/render';

  test('shows the Taatoru working title', () => {
    renderApp(<IndexScreen />);
    expect(screen.getByRole('header', { name: 'Taatoru' })).toBeOnTheScreen();
  });
  ```

- [ ] **Step 3: Run the test and verify RED**

  ```bash
  npm test -- --runInBand src/app/__tests__/bootstrap.test.tsx
  ```

  Expected: FAIL because `renderApp` and the Taatoru screen do not exist.

- [ ] **Step 4: Install compatible dependencies and configure tooling**

  Use `npx expo install` for native packages:

  ```bash
  npx expo install expo-dev-client expo-sqlite expo-secure-store \
    expo-notifications expo-background-task expo-task-manager expo-network \
    expo-audio expo-haptics react-native-safe-area-context react-native-screens \
    react-native-svg
  npm install zustand zod
  npm install --save-dev jest-expo@57.0.2 \
    @testing-library/react-native@14.0.1 @types/jest \
    better-sqlite3 @types/better-sqlite3
  ```

  Set `package.json` engines to `"node": ">=22.13 <23"` and add:

  ```json
  {
    "scripts": {
      "test": "jest",
      "test:watch": "jest --watch",
      "lint": "expo lint",
      "typecheck": "tsc --noEmit",
      "verify": "npm run lint && npm run typecheck && npm test -- --runInBand",
      "prebuild:check": "expo prebuild --clean --no-install"
    }
  }
  ```

- [ ] **Step 5: Implement the minimal app shell**

  `app.config.ts` must set:

  ```ts
  export default {
    expo: {
      name: 'Taatoru',
      slug: 'taatoru',
      version: '0.1.0',
      orientation: 'default',
      scheme: 'taatoru',
      userInterfaceStyle: 'automatic',
      newArchEnabled: true,
      android: {
        package: 'app.taatoru',
        versionCode: 1,
        adaptiveIcon: {
          foregroundImage: './assets/images/adaptive-icon.png',
          backgroundColor: '#F7F8FA',
        },
      },
      runtimeVersion: { policy: 'appVersion' },
      plugins: [
        'expo-router',
        'expo-secure-store',
        ['expo-sqlite', { enableFTS: true }],
        ['expo-notifications', { defaultChannel: 'reviews' }],
      ],
    },
  };
  ```

  `app/index.tsx` renders an accessible `Taatoru` header and a neutral loading
  state. `renderApp()` wraps content in `SafeAreaProvider`.

- [ ] **Step 6: Add license and attribution files**

  Copy the full Apache License 2.0 text into `LICENSE`. `NOTICE.md` must say:

  ```text
  Taatoru
  Copyright 2026 Taatoru contributors

  Taatoru incorporates and adapts portions of Tsurukame:
  https://github.com/davidsansome/tsurukame
  Copyright David Sansome and Tsurukame contributors.
  Tsurukame is licensed under the Apache License, Version 2.0.

  Taatoru's modifications are identified in derivative source files.
  WaniKani content is provided by the WaniKani API and remains subject to
  WaniKani's terms.
  ```

- [ ] **Step 7: Verify GREEN and the generated Android configuration**

  ```bash
  npm test -- --runInBand src/app/__tests__/bootstrap.test.tsx
  npm run lint
  npm run typecheck
  JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' \
    ANDROID_HOME="$HOME/Library/Android/sdk" npm run prebuild:check
  ```

  Expected: test, lint, and typecheck pass; prebuild produces package
  `app.taatoru` with compile/target SDK 36. Remove generated native directories
  after inspection because CNG owns them.

- [ ] **Step 8: Commit**

  ```bash
  git add .nvmrc .gitignore package.json package-lock.json app.config.ts \
    tsconfig.json eslint.config.js jest.config.js jest.setup.ts app src \
    assets LICENSE NOTICE.md README.md
  git commit -m "chore: scaffold Taatoru Expo app"
  ```

### Task 2: Define WaniKani resources and a typed API boundary

**Files:**
- Create: `src/api/types.ts`
- Create: `src/api/WaniKaniApi.ts`
- Create: `src/api/errors.ts`
- Create: `src/api/date.ts`
- Create: `src/api/__tests__/date.test.ts`
- Create: `src/fixtures/api.ts`

**Interfaces:**
- Produces: `WaniKaniApi`, `Resource<T>`, `CollectionPage<T>`, `UserData`,
  `SubjectData`, `AssignmentData`, `StudyMaterialData`,
  `LevelProgressionData`, `VoiceActorData`, and `ReviewStatisticData`.
- Produces: `ApiError`, `ApiDecodeError`, and `NetworkError`.

- [ ] **Step 1: Write failing timestamp and type tests**

  ```ts
  import { parseWaniKaniDate } from '../date';

  test.each([
    ['2026-07-29T12:34:56Z', '2026-07-29T12:34:56.000Z'],
    ['2026-07-29T12:34:56.123Z', '2026-07-29T12:34:56.123Z'],
    ['2026-07-29T12:34:56.123456Z', '2026-07-29T12:34:56.123Z'],
  ])('parses WaniKani timestamp %s', (value, expected) => {
    expect(parseWaniKaniDate(value).toISOString()).toBe(expected);
  });
  ```

- [ ] **Step 2: Run RED**

  ```bash
  npm test -- --runInBand src/api/__tests__/date.test.ts
  ```

  Expected: FAIL because the parser does not exist.

- [ ] **Step 3: Define the API interface**

  ```ts
  export interface WaniKaniApi {
    getUser(signal?: AbortSignal): Promise<Resource<UserData>>;
    getSubjects(
      updatedAfter: string | null,
      signal?: AbortSignal,
    ): Promise<CollectionPage<SubjectData>>;
    getAssignments(
      updatedAfter: string | null,
      signal?: AbortSignal,
    ): Promise<CollectionPage<AssignmentData>>;
    getStudyMaterials(
      updatedAfter: string | null,
      signal?: AbortSignal,
    ): Promise<CollectionPage<StudyMaterialData>>;
    getLevelProgressions(
      signal?: AbortSignal,
    ): Promise<CollectionPage<LevelProgressionData>>;
    getVoiceActors(
      updatedAfter: string | null,
      signal?: AbortSignal,
    ): Promise<CollectionPage<VoiceActorData>>;
    getReviewStatistics(
      updatedAfter: string | null,
      signal?: AbortSignal,
    ): Promise<CollectionPage<ReviewStatisticData>>;
    startAssignment(input: StartAssignmentInput): Promise<void>;
    createReview(input: CreateReviewInput): Promise<void>;
    upsertStudyMaterial(input: StudyMaterialInput): Promise<void>;
    readonly rateLimit: RateLimitSnapshot;
  }
  ```

  Model all four subject object types, auxiliary meaning types, accepted
  answers, context sentences, pronunciation audio, and
  `visually_similar_subject_ids`.

- [ ] **Step 4: Implement strict date and error helpers**

  `parseWaniKaniDate(value: string): Date` accepts the formats observed in
  Tsurukame and throws `ApiDecodeError` for invalid input. Error objects carry
  status, safe URL, retry time, and hibernation classification without carrying
  authorization headers or sensitive request bodies.

- [ ] **Step 5: Run GREEN and typecheck**

  ```bash
  npm test -- --runInBand src/api/__tests__/date.test.ts
  npm run typecheck
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add src/api src/fixtures/api.ts
  git commit -m "feat: define WaniKani API resources"
  ```

### Task 3: Implement pagination, request headers, and rate-limit tracking

**Files:**
- Create: `src/api/HttpWaniKaniApi.ts`
- Create: `src/api/pagination.ts`
- Create: `src/api/rateLimit.ts`
- Create: `src/api/__tests__/client.test.ts`
- Create: `src/api/__tests__/pagination.test.ts`
- Create: `src/api/__tests__/rateLimit.test.ts`

**Interfaces:**
- Consumes: `WaniKaniApi` and resource types from Task 2.
- Produces: `HttpWaniKaniApi`.
- Produces: `fetchAllPages<T>()` and
  `fetchSpeculativePages<T>({ windows: 9, perPage: 1000 })`.

- [ ] **Step 1: Write failing header and pagination tests**

  ```ts
  test('sends documented authentication and revision headers', async () => {
    const fetch = jest.fn().mockResolvedValue(jsonResponse(userFixture));
    const api = new HttpWaniKaniApi({ token: 'secret', fetch });

    await api.getUser();

    expect(fetch).toHaveBeenCalledWith(
      'https://api.wanikani.com/v2/user',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer secret',
          'Wanikani-Revision': '20170710',
        }),
      }),
    );
  });

  test('advances through every next_url before returning', async () => {
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce(page([subject(1)], '/subjects?page_after_id=1'))
      .mockResolvedValueOnce(page([subject(2)], null));

    const result = await fetchAllPages('/subjects', fetchPage);

    expect(result.data.map(({ id }) => id)).toEqual([1, 2]);
  });
  ```

- [ ] **Step 2: Run RED**

  ```bash
  npm test -- --runInBand src/api/__tests__/client.test.ts \
    src/api/__tests__/pagination.test.ts src/api/__tests__/rateLimit.test.ts
  ```

- [ ] **Step 3: Implement request and pagination behavior**

  The client must:

  - use `updated_after`, `unlocked=true`, and `hidden=false` exactly where
    Tsurukame uses them;
  - decode 200/201 and structured 4xx errors;
  - attach retry information for 429;
  - follow server-provided `next_url`;
  - deduplicate speculative subject and review-statistic pages by resource ID;
  - abort all sibling page requests when one page fails.

- [ ] **Step 4: Implement Tsurukame-compatible rate tracking**

  ```ts
  export interface RateLimitSnapshot {
    readonly limit: 60;
    readonly requestsInServerMinute: number;
    readonly requestsRemaining: number;
    readonly resetAfterMs: number;
    readonly estimatedClockSkewMs: number;
  }
  ```

  Update the snapshot using the response `Date` header and half the request
  round-trip time. Reset the count when the server minute changes.

- [ ] **Step 5: Run GREEN**

  ```bash
  npm test -- --runInBand src/api
  npm run typecheck
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add src/api
  git commit -m "feat: add WaniKani HTTP client"
  ```

### Task 4: Add the SQLite schema and database adapters

**Files:**
- Create: `src/db/Database.ts`
- Create: `src/db/ExpoDatabase.ts`
- Create: `src/db/NodeTestDatabase.ts`
- Create: `src/db/schema.ts`
- Create: `src/db/migrate.ts`
- Create: `src/db/__tests__/schema.test.ts`
- Create: `src/db/__tests__/transaction.test.ts`

**Interfaces:**
- Produces: `Database`, `DatabaseTransaction`, `ExpoDatabase`, and
  `NodeTestDatabase`.
- Produces: `migrateDatabase(db: Database): Promise<void>`.

- [ ] **Step 1: Write the failing migration contract test**

  ```ts
  test('creates every durable sync table and FTS index', async () => {
    const db = await NodeTestDatabase.open();
    await migrateDatabase(db);

    expect(await db.tableNames()).toEqual(expect.arrayContaining([
      'sync_state', 'user', 'subjects', 'subjects_fts', 'assignments',
      'study_materials', 'level_progressions', 'voice_actors',
      'review_statistics', 'audio_urls', 'subject_progress',
      'pending_progress', 'pending_study_materials', 'recent_mistakes',
      'sync_errors', 'settings', 'active_sessions',
    ]));
  });
  ```

- [ ] **Step 2: Run RED**

  ```bash
  npm test -- --runInBand src/db/__tests__/schema.test.ts
  ```

- [ ] **Step 3: Define the database port**

  ```ts
  export interface Database {
    run(sql: string, params?: readonly SqlValue[]): Promise<RunResult>;
    first<T>(sql: string, params?: readonly SqlValue[]): Promise<T | null>;
    all<T>(sql: string, params?: readonly SqlValue[]): Promise<readonly T[]>;
    transaction<T>(
      operation: (tx: DatabaseTransaction) => Promise<T>,
    ): Promise<T>;
    close(): Promise<void>;
  }
  ```

  `ExpoDatabase` delegates to `expo-sqlite`; `NodeTestDatabase` delegates to
  `better-sqlite3` but exposes the same asynchronous interface.

- [ ] **Step 4: Implement migration 1**

  Create the complete schema from the approved design. Initialize the single
  `sync_state` row with null cursors. Create indexes for assignment subject,
  subject level/type, review-stat subject, audio subject/actor, pending
  creation time, and mistake time. Populate `subjects_fts` through explicit
  repository writes rather than fragile SQL triggers.

- [ ] **Step 5: Prove transaction rollback**

  ```ts
  test('rolls back all writes when a transaction fails', async () => {
    await expect(db.transaction(async (tx) => {
      await tx.run('INSERT INTO settings (key, value) VALUES (?, ?)',
        ['theme', 'dark']);
      throw new Error('stop');
    })).rejects.toThrow('stop');

    expect(await db.first('SELECT * FROM settings WHERE key = ?', ['theme']))
      .toBeNull();
  });
  ```

- [ ] **Step 6: Run GREEN**

  ```bash
  npm test -- --runInBand src/db
  npm run typecheck
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add src/db
  git commit -m "feat: add local SQLite database"
  ```

### Task 5: Implement resource repositories and derived availability

**Files:**
- Create: `src/db/repositories/ResourceRepository.ts`
- Create: `src/db/repositories/AssignmentRepository.ts`
- Create: `src/db/repositories/SubjectRepository.ts`
- Create: `src/db/repositories/StudyMaterialRepository.ts`
- Create: `src/db/repositories/ReviewStatisticRepository.ts`
- Create: `src/db/repositories/DerivedRepository.ts`
- Create: `src/db/repositories/__tests__/resources.test.ts`
- Create: `src/db/repositories/__tests__/availability.test.ts`

**Interfaces:**
- Produces: transactional `replace*` methods for every synchronized resource.
- Produces: `getAvailableLessons(now)`, `getAvailableReviews(now)`,
  `getUpcomingReviews(now, hours)`, `getSrsCounts()`, and `getLeeches()`.

- [ ] **Step 1: Write failing resource and availability tests**

  ```ts
  test('available lessons exclude hidden, started, locked, and above-plan items',
    async () => {
      await fixtures.insertAvailabilityMatrix(db);
      expect((await assignments.getAvailableLessons(FIXED_NOW))
        .map(({ subjectId }) => subjectId)).toEqual([101, 105]);
    });
  ```

  Include kana vocabulary and the `#tsurukameExclude` study-material marker.

- [ ] **Step 2: Run RED**

  ```bash
  npm test -- --runInBand src/db/repositories
  ```

- [ ] **Step 3: Implement transactional resource replacement**

  Each synchronized family writes normalized searchable columns and the
  complete JSON resource. Subject replacement also writes FTS text and audio
  URL rows. Assignment replacement upserts `subject_progress` without
  overwriting `last_mistake_at`.

- [ ] **Step 4: Implement deterministic derived queries**

  `getUpcomingReviews()` returns hourly buckets based on `available_at`.
  `getLeeches()` uses Tsurukame's review-stat formula and configurable
  threshold. All list methods define stable SQL ordering.

- [ ] **Step 5: Run GREEN**

  ```bash
  npm test -- --runInBand src/db/repositories
  npm run typecheck
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add src/db/repositories
  git commit -m "feat: add cached WaniKani repositories"
  ```

### Task 6: Characterize pure synchronization rules

**Files:**
- Create: `src/features/sync/types.ts`
- Create: `src/features/sync/budget.ts`
- Create: `src/features/sync/recentMistakes.ts`
- Create: `src/features/sync/projection.ts`
- Create: `src/features/sync/__tests__/budget.test.ts`
- Create: `src/features/sync/__tests__/recentMistakes.test.ts`
- Create: `src/features/sync/__tests__/projection.test.ts`

**Interfaces:**
- Produces: `selectPendingWrites()`, `mergeRecentMistakes()`, and
  `projectSrsStage()`.

- [ ] **Step 1: Write failing request-budget tests**

  ```ts
  test('reserves fetch capacity and prioritizes pending progress', () => {
    expect(selectPendingWrites({
      requestsRemaining: 20,
      assignmentUnits: 1,
      subjectUnits: 1,
      fixedUnits: 6,
      progressIds: [1, 2, 3, 4, 5, 6, 7, 8],
      studyMaterialIds: [9, 10, 11, 12, 13, 14],
    })).toEqual({
      progressIds: [1, 2, 3, 4, 5, 6, 7, 8],
      studyMaterialIds: [9, 10, 11, 12],
    });
  });
  ```

  Add zero and negative-capacity cases and full-sync weights of assignments
  `8`, subjects `20`, fixed `6`.

- [ ] **Step 2: Write failing mistake and SRS projection tests**

  Verify 24-hour pruning, newest-timestamp merge, lesson advancement, correct
  review advancement, incorrect-review regression, and local mistake stamping.

- [ ] **Step 3: Run RED**

  ```bash
  npm test -- --runInBand src/features/sync
  ```

- [ ] **Step 4: Implement the minimal pure rules**

  Keep these modules free of React Native, SQLite, network, and clock globals.
  Inject `now` into every time-dependent function.

- [ ] **Step 5: Run GREEN**

  ```bash
  npm test -- --runInBand src/features/sync
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add src/features/sync
  git commit -m "feat: characterize Tsurukame sync rules"
  ```

### Task 7: Build the pending-write queue

**Files:**
- Create: `src/features/sync/PendingWriteRepository.ts`
- Create: `src/features/sync/PendingWriteSender.ts`
- Create: `src/features/sync/__tests__/pendingWrites.test.ts`

**Interfaces:**
- Produces: `completeLesson()`, `completeReview()`,
  `queueStudyMaterial()`, and `sendSelectedPendingWrites()`.
- Consumes: `WaniKaniApi`, `Database`, and projection rules.

- [ ] **Step 1: Write the failing atomic completion test**

  ```ts
  test('queues a review and updates local state in one transaction', async () => {
    await repository.completeReview(reviewCompletionFixture);

    expect(await pending.progressForSubject(42)).toMatchObject({
      kind: 'review',
      assignmentId: 900,
      incorrectMeaningAnswers: 1,
      incorrectReadingAnswers: 0,
    });
    expect(await assignments.byId(900)).toBeNull();
    expect(await progress.bySubjectId(42)).toMatchObject({
      srsStage: 2,
      lastMistakeAt: FIXED_NOW.toISOString(),
    });
  });
  ```

- [ ] **Step 2: Write delivery failure tests**

  Prove:

  - success deletes a pending row;
  - 422 deletes stale progress;
  - 401, 403, 429, decode, timeout, and server errors preserve it;
  - items send sequentially in creation order;
  - reviews older than 15 minutes send `created_at`;
  - recent reviews omit `created_at`.

- [ ] **Step 3: Run RED**

  ```bash
  npm test -- --runInBand src/features/sync/__tests__/pendingWrites.test.ts
  ```

- [ ] **Step 4: Implement queue transactions and sender**

  Do not expose a generic arbitrary mutation queue. Model the three WaniKani
  write shapes explicitly so retries remain type-safe.

- [ ] **Step 5: Run GREEN**

  ```bash
  npm test -- --runInBand src/features/sync/__tests__/pendingWrites.test.ts
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add src/features/sync
  git commit -m "feat: add durable WaniKani write queue"
  ```

### Task 8: Implement the two-phase synchronization engine

**Files:**
- Create: `src/features/sync/SyncEngine.ts`
- Create: `src/features/sync/SyncRepository.ts`
- Create: `src/features/sync/syncStore.ts`
- Create: `src/features/sync/__tests__/engine.test.ts`
- Create: `src/features/sync/__tests__/fullRefresh.test.ts`

**Interfaces:**
- Produces:

  ```ts
  export interface SyncEngine {
    synchronize(mode: 'quick' | 'full'): Promise<SyncResult>;
  }

  export type SyncResult =
    | { status: 'completed'; updatedResources: number }
    | { status: 'skipped'; reason: 'offline' | 'already-running' }
    | { status: 'failed'; error: SafeSyncError };
  ```

- [ ] **Step 1: Write failing phase-order tests**

  Capture calls in an event array and assert:

  ```ts
  expect(events).toEqual([
    'pending-progress:start',
    'pending-study:start',
    'subjects:start',
    'pending-progress:end',
    'pending-study:end',
    'subjects:end',
    'assignments:start',
    'study-materials:start',
    'user:start',
    'level-progressions:start',
    'voice-actors:start',
    'review-statistics:start',
    'assignments:end',
    'study-materials:end',
    'user:end',
    'level-progressions:end',
    'voice-actors:end',
    'review-statistics:end',
    'invalidate',
    'notifications',
  ]);
  ```

  The test may sort only the concurrent phase-two end events; start ordering and
  the phase boundary must remain exact.

- [ ] **Step 2: Write cursor transaction tests**

  For each cursor-backed resource, inject a failure after the final page but
  before commit and prove rows and cursor remain at the previous generation.
  Prove user and level progressions are fetched without cursors.

- [ ] **Step 3: Write full-refresh tests**

  Verify the exact cache families cleared, pending rows retained, recent
  mistakes restored, orphaned audio removed, and the review-stat cursor reset
  on logout.

- [ ] **Step 4: Run RED**

  ```bash
  npm test -- --runInBand src/features/sync/__tests__/engine.test.ts \
    src/features/sync/__tests__/fullRefresh.test.ts
  ```

- [ ] **Step 5: Implement the mutex, phases, commits, and finalization**

  Always release the mutex and invalidate derived data in `finally`. A failure
  in phase one prevents phase two. Phase-two resource commits are independent:
  completed resources retain their new cursor even if a sibling fails,
  matching Tsurukame's concurrent promises.

- [ ] **Step 6: Run GREEN and the complete milestone gate**

  ```bash
  npm test -- --runInBand src/api src/db src/features/sync
  npm run lint
  npm run typecheck
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add src/features/sync
  git commit -m "feat: reproduce Tsurukame synchronization"
  ```

### Task 9: Add token authentication and the database-backed app bootstrap

**Files:**
- Create: `src/features/auth/tokenStore.ts`
- Create: `src/features/auth/AuthProvider.tsx`
- Create: `src/features/auth/LoginScreen.tsx`
- Create: `src/features/auth/__tests__/login.test.tsx`
- Create: `src/app/AppProviders.tsx`
- Create: `app/(auth)/login.tsx`
- Modify: `app/_layout.tsx`
- Modify: `app/index.tsx`

**Interfaces:**
- Produces: `AuthProvider`, `useAuth()`, `TokenStore`, and guarded routing.
- Consumes: `HttpWaniKaniApi`, `ExpoDatabase`, and `SyncEngine`.

- [ ] **Step 1: Write failing login behavior tests**

  Verify empty-token validation, token masking, `/user` validation, SecureStore
  persistence, first quick sync, invalid-token error, and expired-token
  replacement for the same WaniKani user without clearing cached or pending
  data. Also prove a token belonging to another user cannot inherit or upload
  the previous user's pending writes.

- [ ] **Step 2: Run RED**

  ```bash
  npm test -- --runInBand src/features/auth
  ```

- [ ] **Step 3: Implement auth and bootstrap**

  Open and migrate the database before rendering authenticated routes. On a new
  installation, save the token only after validation succeeds, then run quick
  sync. During reauthentication, compare the validated user ID with the cached
  user ID: preserve all cached and pending data for the same account; require
  an explicit account-change action that clears the old account database before
  accepting a different account. A 401 during normal sync routes to
  reauthentication without clearing cached or pending data.

- [ ] **Step 4: Run GREEN**

  ```bash
  npm test -- --runInBand src/features/auth
  npm run typecheck
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add app src/features/auth src/app
  git commit -m "feat: add secure WaniKani login"
  ```

---

## Milestone 2: Read surfaces, analytics, and notifications

### Task 10: Build Taatoru's visual system and navigation shell

**Files:**
- Create: `src/ui/theme/colors.ts`
- Create: `src/ui/theme/spacing.ts`
- Create: `src/ui/theme/typography.ts`
- Create: `src/ui/theme/ThemeProvider.tsx`
- Create: `src/ui/components/Screen.tsx`
- Create: `src/ui/components/Card.tsx`
- Create: `src/ui/components/SubjectChip.tsx`
- Create: `src/ui/components/SyncStatus.tsx`
- Create: `src/ui/__tests__/theme.test.tsx`
- Create: `app/(tabs)/_layout.tsx`
- Create: `app/(tabs)/index.tsx`
- Create: `app/(tabs)/search.tsx`
- Create: `app/(tabs)/analytics.tsx`
- Create: `app/(tabs)/settings.tsx`

**Interfaces:**
- Produces: semantic theme tokens and four-tab navigation.

- [ ] **Step 1: Write failing light/dark and accessibility tests**

  Test minimum 48 dp controls, subject-type labels that do not rely on color,
  automatic dark mode, and accessible tab names.

- [ ] **Step 2: Run RED**

  ```bash
  npm test -- --runInBand src/ui
  ```

- [ ] **Step 3: Implement the original modern shell**

  Use neutral canvases, a blue brand accent, restrained cards, direct
  typography, and WaniKani subject colors only for subject meaning. Do not copy
  Tsurukame paper textures, table separators, profile artwork, icons, or
  navigation chrome.

- [ ] **Step 4: Run GREEN and commit**

  ```bash
  npm test -- --runInBand src/ui
  npm run typecheck
  git add app/'(tabs)' src/ui
  git commit -m "feat: add Taatoru visual system"
  ```

### Task 11: Implement the dashboard and sync controls

**Files:**
- Create: `src/features/home/dashboard.ts`
- Create: `src/features/home/HomeScreen.tsx`
- Create: `src/features/home/__tests__/dashboard.test.ts`
- Create: `src/features/home/__tests__/home.test.tsx`
- Modify: `app/(tabs)/index.tsx`

**Interfaces:**
- Produces: `getDashboardSnapshot(now)` and `HomeScreen`.

- [ ] **Step 1: Write failing dashboard fixture tests**

  Assert exact lesson/review counts, next review time, 24-hour buckets,
  current-level progress, SRS totals, pending count, vacation state, and
  offline state from a controlled database.

- [ ] **Step 2: Run RED**

  ```bash
  npm test -- --runInBand src/features/home
  ```

- [ ] **Step 3: Implement dashboard queries and UI**

  Add pull-to-refresh for full sync, a compact quick-sync action, honest
  skipped/error states, and disabled lesson/review actions when counts are
  zero. Use virtualized content for the full dashboard.

- [ ] **Step 4: Run GREEN and commit**

  ```bash
  npm test -- --runInBand src/features/home
  git add app/'(tabs)'/index.tsx src/features/home
  git commit -m "feat: add local-first dashboard"
  ```

### Task 12: Add offline search and subject details

**Files:**
- Create: `src/features/search/kana.ts`
- Create: `src/features/search/search.ts`
- Create: `src/features/search/SearchScreen.tsx`
- Create: `src/features/search/__tests__/search.test.ts`
- Create: `src/features/subjects/similarKanji.ts`
- Create: `src/features/subjects/SubjectDetailsScreen.tsx`
- Create: `src/features/subjects/__tests__/similarKanji.test.ts`
- Create: `src/features/subjects/__tests__/details.test.tsx`
- Modify: `app/(tabs)/search.tsx`
- Create: `app/subject/[id].tsx`

**Interfaces:**
- Produces: `searchSubjects(query, limit)`, `romajiToKana()`, and
  `resolveSimilarKanji()`.

- [ ] **Step 1: Write failing search ranking tests**

  Cover Japanese exact matches, romaji-to-kana, readings, meanings, synonyms,
  exact-match priority, stable level ordering, empty queries, and result caps.

- [ ] **Step 2: Write failing similar-kanji tests**

  ```ts
  test('uses only API-provided similar subject ids in API order', async () => {
    await subjects.insert([
      subject({ id: 9, level: 5 }),
      subject({ id: 3, level: 8 }),
      subject({ id: 1000, level: 9 }),
    ]);

    expect(await resolveSimilarKanji({
      ids: [9, 3, 9, 1000],
      currentLevel: 8,
      includeAboveLevel: false,
    })).toEqual([
      expect.objectContaining({ id: 9 }),
      expect.objectContaining({ id: 3 }),
    ]);
  });
  ```

  The fixture must prove community characters are not read or merged.

- [ ] **Step 3: Run RED**

  ```bash
  npm test -- --runInBand src/features/search src/features/subjects
  ```

- [ ] **Step 4: Implement search and details**

  Render meanings, readings, mnemonics, hints, context sentences, audio,
  components, amalgamations, WaniKani similar IDs, assignment state, review
  statistics, notes, and synonyms. Study-material edits use the pending queue.

- [ ] **Step 5: Run GREEN and commit**

  ```bash
  npm test -- --runInBand src/features/search src/features/subjects
  git add app/'(tabs)'/search.tsx app/subject src/features/search \
    src/features/subjects
  git commit -m "feat: add offline search and subject details"
  ```

### Task 13: Implement analytics calculations and charts

**Files:**
- Create: `src/features/analytics/calculations.ts`
- Create: `src/features/analytics/AnalyticsScreen.tsx`
- Create: `src/features/analytics/SimpleBarChart.tsx`
- Create: `src/features/analytics/DonutChart.tsx`
- Create: `src/features/analytics/__tests__/calculations.test.ts`
- Create: `src/features/analytics/__tests__/charts.test.tsx`
- Modify: `app/(tabs)/analytics.tsx`

**Interfaces:**
- Produces: upcoming distribution, SRS distribution, level timing, accuracy,
  strong/weak subject, and leech datasets.

- [ ] **Step 1: Write failing calculation tests**

  Use fixed fixtures to assert exact chart series and empty-data behavior.
  Include hidden subjects and reset levels so they do not distort metrics.

- [ ] **Step 2: Run RED**

  ```bash
  npm test -- --runInBand src/features/analytics
  ```

- [ ] **Step 3: Implement accessible SVG charts**

  Draw only with `react-native-svg`. Every chart receives a text summary and
  direct labels. Do not add a general charting dependency.

- [ ] **Step 4: Run GREEN and commit**

  ```bash
  npm test -- --runInBand src/features/analytics
  git add app/'(tabs)'/analytics.tsx src/features/analytics
  git commit -m "feat: add WaniKani analytics"
  ```

### Task 14: Reproduce Tsurukame review notifications

**Files:**
- Create: `src/features/notifications/schedule.ts`
- Create: `src/features/notifications/NotificationService.ts`
- Create: `src/features/notifications/backgroundTask.ts`
- Create: `src/features/notifications/__tests__/schedule.test.ts`
- Create: `src/features/notifications/__tests__/service.test.ts`
- Modify: `app/_layout.tsx`
- Modify: `app.config.ts`

**Interfaces:**
- Produces: `buildReviewNotificationSchedule()` and `NotificationService`.

- [ ] **Step 1: Write failing hourly schedule tests**

  Test rounding to the next hour, skipping empty buckets, cumulative counts,
  “new” counts, 64-item cap, sound/alert/badge preferences, and vacation-mode
  suppression.

- [ ] **Step 2: Run RED**

  ```bash
  npm test -- --runInBand src/features/notifications
  ```

- [ ] **Step 3: Implement the Android service**

  Create the `reviews` notification channel before permission or scheduling.
  Request Android 13 permission only when the user enables alerts or badges.
  Cancel and rebuild deterministic IDs after sync and when backgrounding.
  Register one opportunistic quick-sync background task with a 15-minute
  minimum and treat execution time as inexact.

- [ ] **Step 4: Run GREEN and milestone gate**

  ```bash
  npm test -- --runInBand src/features/notifications
  npm run verify
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add app.config.ts app/_layout.tsx src/features/notifications
  git commit -m "feat: add review notifications"
  ```

---

## Milestone 3: Lessons

### Task 15: Characterize lesson availability, ordering, and selection

**Files:**
- Create: `src/features/lessons/types.ts`
- Create: `src/features/lessons/order.ts`
- Create: `src/features/lessons/selection.ts`
- Create: `src/features/lessons/__tests__/order.test.ts`
- Create: `src/features/lessons/__tests__/selection.test.ts`

**Interfaces:**
- Produces: `buildAutomaticLessonQueue()` and `LessonSelection`.

- [ ] **Step 1: Write failing ordering tests**

  Cover current-level priority, configured radical/kanji/vocabulary ordering,
  lesson position, stable ID tie-break, kana vocabulary, apprentice limit,
  exclusions, and batch size.

- [ ] **Step 2: Write failing selection tests**

  Cover grouping by level/type, toggle/deselect, selected count, empty Begin,
  stale ID removal, and process-restored IDs.

- [ ] **Step 3: Run RED**

  ```bash
  npm test -- --runInBand src/features/lessons
  ```

- [ ] **Step 4: Implement pure lesson rules and run GREEN**

  ```bash
  npm test -- --runInBand src/features/lessons
  git add src/features/lessons
  git commit -m "feat: add lesson selection rules"
  ```

### Task 16: Persist lesson sessions and build the picker

**Files:**
- Create: `src/features/sessions/SessionRepository.ts`
- Create: `src/features/lessons/LessonPickerScreen.tsx`
- Create: `src/features/lessons/__tests__/picker.test.tsx`
- Create: `src/features/sessions/__tests__/sessionRepository.test.ts`
- Create: `app/lessons/picker.tsx`

**Interfaces:**
- Produces: durable `LessonSessionSnapshot` and `LessonPickerScreen`.

- [ ] **Step 1: Write failing persistence and picker tests**

  Prove selected IDs restore, stale assignments disappear before Begin, checked
  state is accessible, long lists virtualize, and automatic lessons bypass the
  picker without changing their ordering.

- [ ] **Step 2: Run RED**

  ```bash
  npm test -- --runInBand src/features/sessions src/features/lessons
  ```

- [ ] **Step 3: Implement the durable snapshot and picker**

  Store only stable assignment/subject IDs, current phase, queue position, and
  quiz state in `active_sessions`. Reload subjects from repositories after
  process recreation.

- [ ] **Step 4: Run GREEN and commit**

  ```bash
  npm test -- --runInBand src/features/sessions src/features/lessons
  git add app/lessons/picker.tsx src/features/sessions src/features/lessons
  git commit -m "feat: add lesson picker and persistence"
  ```

### Task 17: Build the immersive lesson presentation and quiz

**Files:**
- Create: `src/features/lessons/LessonSessionScreen.tsx`
- Create: `src/features/lessons/LessonSubjectStage.tsx`
- Create: `src/features/lessons/LessonQuizStage.tsx`
- Create: `src/features/lessons/lessonReducer.ts`
- Create: `src/features/lessons/__tests__/lessonReducer.test.ts`
- Create: `src/features/lessons/__tests__/lessonSession.test.tsx`
- Create: `app/lessons/session.tsx`

**Interfaces:**
- Consumes: `LessonSessionSnapshot`, subject repositories, audio, and
  `PendingWriteRepository.completeLesson()`.

- [ ] **Step 1: Write failing reducer and UI tests**

  Prove presentation-to-quiz transition, meaning/reading prompts, radical image
  handling, audio, progress, safe exit, keyboard placement, process restore,
  and exactly-once assignment start after the quiz completes.

- [ ] **Step 2: Run RED**

  ```bash
  npm test -- --runInBand src/features/lessons
  ```

- [ ] **Step 3: Implement Tsurukame-like lesson composition**

  Use full-screen subject color, a large Japanese glyph or radical image,
  compact progress strip, dark task strip, answer field above the keyboard,
  and explicit correct/incorrect feedback. Reuse Taatoru typography and icons;
  do not copy Tsurukame assets.

- [ ] **Step 4: Run GREEN and milestone gate**

  ```bash
  npm test -- --runInBand src/features/lessons src/features/sessions
  npm run verify
  git add app/lessons/session.tsx src/features/lessons
  git commit -m "feat: add lesson experience"
  ```

---

## Milestone 4: Reviews and release verification

### Task 18: Port and characterize the answer checker

**Files:**
- Create: `src/features/reviews/answerChecker.ts`
- Create: `src/features/reviews/levenshtein.ts`
- Create: `src/features/reviews/types.ts`
- Create: `src/features/reviews/__tests__/answerChecker.test.ts`
- Create: `src/features/reviews/__tests__/fixtures.ts`

**Interfaces:**
- Produces:

  ```ts
  export function checkAnswer(input: CheckAnswerInput): AnswerResult;

  export type AnswerResult =
    | { verdict: 'correct'; matched: string }
    | { verdict: 'retry'; reason: RetryReason }
    | { verdict: 'incorrect'; expected: readonly string[] };
  ```

- [ ] **Step 1: Write failing characterization tests before production code**

  Translate Tsurukame's AnswerChecker tests and add cases for whitespace,
  capitalization, romaji/kana conversion, accepted and auxiliary meanings,
  user synonyms, kunyomi/onyomi, close answers, meaning-reading mismatches,
  kana vocabulary, and forbidden answers.

- [ ] **Step 2: Run RED**

  ```bash
  npm test -- --runInBand src/features/reviews/__tests__/answerChecker.test.ts
  ```

- [ ] **Step 3: Implement the deterministic port**

  Files substantially translated from Tsurukame must retain its Apache header,
  say that Taatoru modified the file, and cite the upstream path and baseline
  revision. Keep all answer checking pure and clock-free.

- [ ] **Step 4: Run GREEN and commit**

  ```bash
  npm test -- --runInBand src/features/reviews/__tests__/answerChecker.test.ts
  git add src/features/reviews
  git commit -m "feat: port Tsurukame answer checking"
  ```

### Task 19: Implement review ordering and durable session state

**Files:**
- Create: `src/features/reviews/order.ts`
- Create: `src/features/reviews/reviewReducer.ts`
- Create: `src/features/reviews/__tests__/order.test.ts`
- Create: `src/features/reviews/__tests__/reviewReducer.test.ts`
- Modify: `src/features/sessions/SessionRepository.ts`

**Interfaces:**
- Produces: `buildReviewQueue()` and `ReviewSessionSnapshot`.

- [ ] **Step 1: Write failing queue tests**

  Cover available-only filtering, random fixture seed, meaning-first, grouped
  prompts, batch size, item limit, skipped kanji readings, and the device-local
  recent-mistakes mode. Recent-lesson and leech dashboard shortcuts open
  filtered read-only lists; they do not become specialized practice modes.

- [ ] **Step 2: Write failing reducer tests**

  Prove retry answers do not increment errors, incorrect answers increment the
  correct counter once, both prompts complete exactly one assignment, summary
  data is stable, and snapshots survive process restart.

- [ ] **Step 3: Run RED, implement, and run GREEN**

  ```bash
  npm test -- --runInBand src/features/reviews src/features/sessions
  git add src/features/reviews src/features/sessions/SessionRepository.ts
  git commit -m "feat: add durable review sessions"
  ```

### Task 20: Build the immersive review and summary UI

**Files:**
- Create: `src/features/reviews/ReviewSessionScreen.tsx`
- Create: `src/features/reviews/ReviewPrompt.tsx`
- Create: `src/features/reviews/ReviewSummaryScreen.tsx`
- Create: `src/features/reviews/__tests__/reviewSession.test.tsx`
- Create: `src/features/reviews/__tests__/summary.test.tsx`
- Create: `app/reviews/session.tsx`
- Create: `app/reviews/summary.tsx`

**Interfaces:**
- Consumes: answer checker, review reducer, audio, subject details, and
  `PendingWriteRepository.completeReview()`.

- [ ] **Step 1: Write failing interaction tests**

  Test correct, retry, and incorrect flows; audio; details; safe exit; summary;
  pending upload; error counts; progress; keyboard insets; and process restore.

- [ ] **Step 2: Run RED**

  ```bash
  npm test -- --runInBand src/features/reviews
  ```

- [ ] **Step 3: Implement Tsurukame-like review composition**

  Match lesson visuals: full-screen subject color, large subject, compact status
  strip, dark task label, and keyboard-adjacent input. Keep Android back,
  accessibility, and window-inset behavior native.

- [ ] **Step 4: Run GREEN and commit**

  ```bash
  npm test -- --runInBand src/features/reviews
  git add app/reviews src/features/reviews
  git commit -m "feat: add review experience"
  ```

### Task 21: Complete settings, About, logout, and diagnostics

**Files:**
- Create: `src/features/settings/SettingsScreen.tsx`
- Create: `src/features/settings/AboutScreen.tsx`
- Create: `src/features/settings/DiagnosticsScreen.tsx`
- Create: `src/features/settings/__tests__/settings.test.tsx`
- Create: `app/settings/about.tsx`
- Create: `app/settings/diagnostics.tsx`
- Modify: `app/(tabs)/settings.tsx`

**Interfaces:**
- Produces: settings for theme, lesson/review order, batch and item limits,
  kana vocabulary, above-level similar kanji, notifications, sound, and leech
  threshold.

- [ ] **Step 1: Write failing settings and logout tests**

  Prove settings persist, notification changes reschedule, full refresh retains
  preferences, logout removes token/cache/pending/mistakes/errors/schedules,
  and About shows the exact Tsurukame attribution.

- [ ] **Step 2: Run RED, implement, and run GREEN**

  ```bash
  npm test -- --runInBand src/features/settings
  git add app/'(tabs)'/settings.tsx app/settings src/features/settings
  git commit -m "feat: add settings and open source credits"
  ```

### Task 22: Add Android integration and visual regression flows

**Files:**
- Create: `.maestro/login-and-sync.yaml`
- Create: `.maestro/offline-search.yaml`
- Create: `.maestro/lesson-session.yaml`
- Create: `.maestro/review-session.yaml`
- Create: `.maestro/notifications.yaml`
- Create: `src/dev/FakeApiProvider.tsx`
- Create: `src/dev/fixtures.ts`
- Create: `docs/testing/android-manual-checklist.md`

**Interfaces:**
- Produces: a development-only, build-time fake API selected by
  `EXPO_PUBLIC_E2E_MODE=fixtures`.

- [ ] **Step 1: Add a fixture-mode guard test**

  Prove production builds cannot enable fixture mode and fixture mode never
  reads SecureStore or reaches `api.wanikani.com`. Resolve fixture mode through
  a function that requires both `__DEV__ === true` and
  `EXPO_PUBLIC_E2E_MODE === 'fixtures'`; fail closed otherwise.

- [ ] **Step 2: Build the Android development client**

  ```bash
  JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' \
    ANDROID_HOME="$HOME/Library/Android/sdk" \
    npx expo run:android
  ```

- [ ] **Step 3: Run the Maestro flows**

  ```bash
  maestro test .maestro/login-and-sync.yaml
  maestro test .maestro/offline-search.yaml
  maestro test .maestro/lesson-session.yaml
  maestro test .maestro/review-session.yaml
  maestro test .maestro/notifications.yaml
  ```

  Capture failures as test artifacts. Verify narrow phone, tablet, dark mode,
  200% font scale, rotation/process recreation, long lists, keyboard behavior,
  notification permission/channel/tap, and offline queue recovery.

- [ ] **Step 4: Compare lesson and review screenshots**

  Compare composition against:

  - `../tsurukame/ios/fastlane/screenshots/en-AU/iPhone 11 Pro Max-02_lesson.png`
  - current Tsurukame review screens rendered from its storyboard and
    `ReviewViewController`.

  Check hierarchy and input placement, not pixel identity or iOS chrome.

- [ ] **Step 5: Commit**

  ```bash
  git add .maestro src/dev docs/testing
  git commit -m "test: add Android acceptance flows"
  ```

### Task 23: Run final verification and document actual results

**Files:**
- Modify: `README.md`
- Create: `docs/verification/first-release.md`

**Interfaces:**
- Produces: reproducible setup, build, test, and manual verification evidence.

- [ ] **Step 1: Run the complete automated gate**

  ```bash
  npm ci
  npm run verify
  npx expo-doctor
  JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' \
    ANDROID_HOME="$HOME/Library/Android/sdk" \
    npx expo prebuild --clean --no-install
  JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' \
    ANDROID_HOME="$HOME/Library/Android/sdk" \
    npx expo run:android --variant debug
  ```

- [ ] **Step 2: Run every Maestro flow on a clean fixture database**

  Record the device image, Android version, screen size, font scale, theme, and
  exact result for every flow.

- [ ] **Step 3: Audit requirements and licensing**

  Check every acceptance criterion in the design specification. Confirm:

  - no live account data or tokens in Git;
  - no GPL similar-kanji datasets;
  - Apache license and Tsurukame attribution are present;
  - copied/translated Tsurukame files carry original headers and modification
    notices;
  - `android/` and `ios/` are not tracked;
  - only intentional files are modified.

- [ ] **Step 4: Write verification evidence**

  `docs/verification/first-release.md` lists each command actually run, exit
  status, test counts, emulator results, unavailable checks, and remaining
  risks. Do not claim an unexecuted check passed.

- [ ] **Step 5: Run a clean final gate and commit documentation**

  ```bash
  npm run verify
  git diff --check
  git status --short
  git add README.md docs/verification/first-release.md
  git commit -m "docs: record first release verification"
  ```

## Plan completion criteria

Implementation is complete only when all 23 tasks are checked, all four
milestone gates have fresh passing evidence, the Android development build
runs, Maestro acceptance flows pass or have explicit documented blockers, and
the final repository contains no unrelated or sensitive files.
