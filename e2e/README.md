# Local mutation E2E harness

This harness runs the real Android routes, SQLite session commits, account ownership, paced sync coordinator and HTTP client against an in-memory loopback API. It uses original, visibly synthetic learning items. No real API token or account is needed. Login, exact WaniKani SRS scheduling, media and OS-scheduled background delivery are not tested.

## Prerequisites

Use Node 22, the project's installed dependencies, Java 17+ (Android Studio's JDK works), Android SDK/build tools 36.0.0, a clean Android emulator and Maestro **2.12.0**. Install the pinned CLI from the official [release](https://github.com/mobile-dev-inc/Maestro/releases/tag/cli-2.12.0), or follow the [official installation guide](https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli). Set `MAESTRO_BIN` if it is not on PATH. Use a fresh emulator without an account; the runner never resets the ordinary Taatoru package.

Prepare the isolated development APK once (and again after native/config changes):

```sh
EXPO_PUBLIC_TAATORU_E2E=1 npx expo prebuild --platform android --clean --no-install
cd android
EXPO_PUBLIC_TAATORU_E2E=1 ./gradlew app:assembleDebug
cd ..
```

The mutation transport policy is installed in both normal and E2E Android builds by the Expo config plugin. Rebuild the APK after changing it; Metro reload alone cannot update native behavior. Native policy tests run with `cd android && ./gradlew :app:testDebugUnitTest --tests app.taatoru.network.NonReplayingApiWritesTest`.

Generated native directories remain ignored. Before building the normal app again, regenerate without the E2E flag. EAS profiles reject E2E configuration entirely. Runtime also verifies the **installed native package** is `app.taatoru.e2e`, not merely the manifest identity. Its SQLite database and secure-store sandbox are separate.

## Run

```sh
npm run test:e2e:contracts
npm run e2e:android -- --suite smoke --serial emulator-5554
npm run e2e:android -- --suite mutations --serial emulator-5554
npm run e2e:android -- --suite progression --serial emulator-5554
npm run e2e:android -- --suite receipt-recovery --serial emulator-5554
npm run e2e:android -- --suite connection-before --serial emulator-5554
npm run e2e:android -- --suite material-recovery --serial emulator-5554
npm run e2e:android -- --suite resume --serial emulator-5554
npm run e2e:android -- --suite materials --serial emulator-5554
npm run e2e:android -- --suite bounds --serial emulator-5554
npm run e2e:android -- --suite preacceptance --serial emulator-5554
npm run e2e:android -- --suite quota --serial emulator-5554
npm run e2e:android -- --suite rejected --serial emulator-5554
```

The runner validates the APK package before installing or clearing data. It starts its own API and Metro, bridges IPv6 localhost to IPv4 for adb reverse, disables dotenv loading, precompiles an explicit entry using the real application routes, and generates Maestro commands from the original answer manifest. Ports 8787, 8090 and 8091 must be free. An existing reverse mapping causes a clear error rather than being replaced. `--apk`, `--seed`, `--scenario` and `--maestro` are optional overrides; unknown options/suites and ambiguous devices fail before resetting the app.

Each run resets only the E2E app and fake server. Resume steps preserve both sides, including credentials, saved sessions, pending revisions, dispatch evidence and lease deadlines. A force-stop can leave the real two-minute lease outstanding; recovery deliberately waits for the production ownership rules. Request spacing/backoff remain real, so device suites take minutes rather than seconds.

Smoke completes a mixed-type small review batch, one selected lesson and one ordinary automatic-start lesson, then selects/cancels another item without mutation. Mutations also exercises explicit incorrect-answer override. Progression starts one review before level-up. Receipt recovery accepts one review but returns an unreadable receipt, then verifies reconciliation without another review POST. Node HTTP tests also cover a completely dropped connection. The app marks API mutation bodies one-shot to prevent native retransmission after sending starts. Raw connection-loss recovery separately verifies the real Expo Fetch path; this harness does not claim universal exactly-once server effects. Resume force-stops between meaning and reading and completes that persisted subject without repeating the first half. Materials holds a create response while a newer note/synonym edit is saved, then verifies the update and positive server identity. Bounds checks the 200-lesson/1,000-review extreme, completes a distant selected lesson and cancels another choice. Connection-before verifies a genuinely unaccepted write can retry through authoritative reads with its original timestamp. Material-recovery verifies a lost create response settles one positive identity without another POST. Preacceptance/quota verify automatic recovery with a stable completion timestamp; rejected verifies visible retained attention after 422. Server/repository contract tests cover additional receipts, retained 422 attention, material-create recovery and prerequisite/cap/rounding cases.

## Manual synthetic sandbox

```sh
npm run e2e:android -- --suite sandbox --scenario daily --seed 42 --serial emulator-5554
```

This prepares the app and leaves its local services running until Ctrl-C. For a standalone API without the app:

```sh
npm run mock:api -- --scenario daily --seed 42
```

Start the isolated APK with E2E Metro configuration and reverse ports as above; the automatic runner is the simplest managed way to prepare these. The standalone API is also useful for HTTP-client development. Do not run it simultaneously with a managed native suite using the same ports.

| Scenario | Available lessons | Due reviews | Purpose |
| --- | ---: | ---: | --- |
| smoke | 8 | 12 | Short full mutation paths |
| daily | 20 | 80 | Default illustrative everyday state |
| backlog | 80 | 300 | Heavier illustrative backlog |
| extreme | 200 | 1,000 | Optional upper-end UI bounds |

Additional scenarios: `first-level`, `empty`, `prerequisite`, `level-up`, `subscription-cap`, `final-level`. A seeded curriculum includes prior and future levels; account level and subscription gates remain distinct. Passed prerequisite history survives demotion. Passing 90% (rounded up) of current-level kanji advances the synthetic account and unlocks eligible dependents. Mock mistake penalty is one stage; future reviews are four hours out. This is a bounded testing model, not WaniKani scheduling parity.

Loopback control endpoints:

- `GET /__e2e/bootstrap`: shared seed resources, original answers, run identity and expected available IDs.
- `GET /__e2e/state`: server resources, attempted/accepted journal and response-barrier count.
- `POST /__e2e/reset`: `{ "scenario": "daily", "seed": 42 }`; changes run identity. Reset the E2E app before reconnecting.
- `POST /__e2e/fault`: method, `/v2/` path and kind (`reject`, `drop-before`, `drop-after`, `malformed-after`, `hold-after`), optional rejection status/assignment ID.
- `POST /__e2e/release`: releases held responses. Acceptance has already happened for `hold-after`.
- `POST /__e2e/make-due`: `{ "assignmentIds": [101001] }`. Use only after existing work for those assignments settles; refresh through normal app services afterward.

The API serves actual typed write receipts and targeted assignment/material/statistic lookups, collection filtering/pagination and empty reset history. It does not invent an idempotency-key protocol. A 422 without acceptance evidence remains visible for attention under current sync policy. Remote conflicting notes follow the app's authoritative-server policy.

## Assertions and diagnostics

Artifacts live under ignored `.expo/e2e/<timestamp>/`: concrete Maestro flows, tool output, server state/journal, result, screenshots/logcat on failure, and SQLite snapshots. The runner force-stops the isolated app before copying the main database **with WAL/SHM**, then queries only the copy using `better-sqlite3`. It checks durable queues and dispatch evidence in addition to UI/server assertions. Snapshots never read SecureStore values or authorization headers.

Generated commands use stable IDs only where dynamic subject identity is needed; grading and session transitions remain ordinary UI actions. No answer injection or direct SQL completion exists in native flows. Faster Node integration tests may advance retry eligibility explicitly and do not claim native scheduler coverage.

A server/app run-ID mismatch or interrupted bootstrap fails with a reset instruction instead of overwriting pending work. A missing local server fails closed. If a run fails, inspect its result, Metro and Maestro artifacts. Regenerate the isolated APK if configuration/native dependencies changed. Stop any unrelated Metro/server first; the runner cleans only processes and port mappings it owns.

## Application regression probes

See [application findings](../docs/verification/local-e2e-app-findings.md). These preserve the original expectations that exposed stale account level and native mutation replay. Both are regression checks for the fixes; do not skip or weaken them:

```sh
npm run e2e:android -- --suite level-up-auto --serial emulator-5554
npm run e2e:android -- --suite recovery --serial emulator-5554
```

The first requires automatic level freshness without manual sync. The second uses an abruptly closed connection and strictly checks for no repeated POST. Explicit-refresh progression and malformed-receipt recovery remain separate tests with separate claims. Record new app failures before changing assertions.
