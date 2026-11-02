# Study release fixes verification — 2 November 2026

Scope: Taatoru lesson/review release fixes on `codex/study-release-fixes`, stacked on PR #6 (`codex/local-mutation-e2e`, `2c4b7f7`). Tsurukame and Smouldering Durtles remained read-only. Optional comparison features were deferred. The user's kana correction supersedes the initial composition finding: `nn` immediately commits `ん`; incremental `annai` is `あんあい`. Apostrophe grading and SRS penalty fixes remain.

Automated release gates passed on Node 22:

- `npm run verify`: lint, TypeScript, 84 Jest suites / 566 tests, 13 release-config tests and 3 native-tooling tests.
- `npx --yes expo-doctor@1.20.1`: 20/20 checks.
- `EXPO_NO_DOTENV=1 CI=1 npm run prebuild:check`: normal Android/iOS generation; no tracked changes.
- Isolated Android regeneration with `EXPO_PUBLIC_TAATORU_E2E=1`, then JDK 17 `./gradlew :app:assembleDebug :app:testDebugUnitTest --tests app.taatoru.network.NonReplayingApiWritesTest`: build succeeded, 5 tests, no failures/errors/skips.
- `git diff --check`: clean. Independent task and whole-branch reviews approved; no outstanding Critical/Important findings.

Native evidence uses API 36.1 `emulator-5554`, Maestro 2.12.0, original synthetic subjects and a local HTTP server. Tests drive actual UI → SQLite → pending-write queue → HTTP. No real account/token is used.

| Suite | Result | Artifact directory |
| --- | --- | --- |
| media-cache | PASS | `.expo/e2e/2026-11-02T15-25-05-254Z` |
| wrap-up | PASS | `.expo/e2e/2026-11-02T20-00-23-265Z` |
| reading-input | PASS | `.expo/e2e/2026-11-02T20-02-26-672Z` |
| smoke | PASS | `.expo/e2e/2026-11-02T20-06-37-128Z` |
| resume | PASS | `.expo/e2e/2026-11-02T20-14-08-086Z` |

Reading-input typed separate native events and asserted `annai` → `あんあい` and `konnichiha` → `こんいちは`, erased the draft, then completed one valid lesson with exactly one start write. Smoke completed twelve mixed-type reviews, a selected lesson, an automatic lesson and mutation-free selection cancellation. Resume force-stopped after a meaning half, resumed at reading and settled exactly one review without repeating the meaning half. Each run retained its exact UI, HTTP and SQLite/outbox assertions. A slow startup in the kana run resolved within the readiness gate without a code change or retry.

Wrap-up retained the real first-subject mistake, completed four attempted subjects including a partial kanji, displayed 75% and its missed-subject link, and left eight untouched assignments due in both server and SQLite. Its four review writes matched the exact journal and the pending queue settled.

The media-cache test renders an original image-only radical from durable app document storage before and after force-stop, then submits exactly one review and settles its queue. The after-restart screenshot was visually checked. It seeds the cache under an unreachable HTTPS URL; this is native cache reading/rendering/restart evidence. Controlled unit tests cover downloads, credential omission, SVG/raster validation, retry, offline reuse and preparation lifecycle boundaries.

Harness diagnoses and fixes: developer onboarding intercepted startup; an unquoted Android shell URL lost query flags; the home container appeared before loaded actions; cleanup stopped after a failed release; and macOS sleep paused an active input run while wall-clock timeouts expired. Launcher flags, shell-argument regressions, loaded-action waits, independent cleanup and runner-scoped `caffeinate` address these causes. No concurrent UI-automation client is used. Earlier native input evidence for hidden-n composition is superseded by the user's correction.

Limitations: local SRS stage projection does not fabricate server due times. The mock is bounded synthetic behavior, not full WaniKani scheduling. This does not verify live media downloads, OS background delivery or iOS device behavior. Final runs use the emulator's default font scale/light theme. The workflow only triggers for PRs against `main`; stacked-branch CI must run after #6 merges and this PR is retargeted. Optional advanced-study comparison features are outside this MR.
