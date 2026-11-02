# Application findings from the local E2E harness

1 November 2026. App baseline `f8fe7d0`. These were recorded before production fixes; resolution evidence is added below while retaining the original observations. Generated evidence contains only synthetic account data and remains in ignored `.expo/e2e/` directories.

## APP-001 — automatic delivery can leave the current level stale

**Status: resolved in the local implementation.** The unchanged automatic-only probe passes on the final APK at `2026-11-01T22-13-43-122Z`: server and persisted user Level 4, one accepted review, empty outbox/dispatches, no manual refresh. Quick sync now reads the user after progress delivery, before subject import and completion. See [fix verification](mutation-sync-fixes.md).

**Expected:** after completing the threshold review and automatic delivery/import settles, dashboard/current-level state reflects the server's new level without a second user-triggered sync.

**Observed:** the synthetic server advances from Level 3 to 4 and returns the updated assignment/statistics. The local `user` row can remain Level 3. A normal Quick sync fetches the new user and then the dashboard shows Level 4. The separate explicit-refresh progression case passes; that does not establish automatic level freshness.

**Evidence:** `.expo/e2e/2026-11-01T16-24-54-047Z/server.json` records server Level 4; `failure/rows.json` records local Level 3. The same difference was observed in the connection-loss run `2026-11-01T16-30-03-618Z`.

**Reproduce:** `npm run e2e:android -- --suite level-up-auto --serial SERIAL`. The probe retains its original persisted-Level-4 expectation and should pass with the rebuilt fixed app. `--suite progression` separately verifies the original explicit-refresh contract.

**Probe qualification:** runs `2026-11-01T17-19-01-743Z` and `2026-11-01T17-21-32-712Z` used an upward scroll to find the header. That gesture can trigger the dashboard's pull-to-refresh: their journals show a full refresh after delivery, so later Level 4 snapshots do not establish automatic freshness. The probe now performs no upward gesture. It waits for automatic delivery completion and asserts the persisted user level directly; it does not inject a refresh or relax the Level 4 requirement.

**Confirmed automatic-only reproduction:** `2026-11-01T17-24-22-442Z` fails `Automatic account level was not persisted`: server Level 4, `final/rows.json` local Level 3, after the visible synchronization-complete state. The journal contains no post-write full refresh. The persisted-level assertion is retained.

**Original diagnosis:** quick sync downloads user before dispatching pending writes; a level-changing write can make that user snapshot stale during the same run. Investigate `SynchronizationEngine.runSynchronization()` and coordinator continuation/invalidation. This diagnosis was recorded during the initial harness phase; the subsequent fix is described above.

## APP-002 — Android may replay a POST after abrupt connection loss

**Status: resolved in the local implementation for the tested Android transport.** The unchanged strict recovery probe passes on the final APK at `2026-11-01T22-12-24-091Z`: exactly one accepted review POST, followed by assignment/statistic reconciliation reads and empty durable queues. Native one-shot bodies are installed through the client factory shared by Expo Fetch and React Native. A native rebuild is required. See [fix verification](mutation-sync-fixes.md).

**Expected by the strict recovery probe:** once the server accepted a review whose response was lost, subsequent recovery reads authoritative evidence before submitting another review POST.

**Observed:** Android sent a second POST immediately, before intervening assignment/statistic reads. The mock accepted the first and rejected the second with 422. No duplicate accepted effect was observed. This appears to be transport-level replay before JavaScript receives a response; do not describe it as proven exactly-once delivery or assume it is the coordinator retrying.

**Evidence:** `.expo/e2e/2026-11-01T16-30-03-618Z/server.json`, sequences 31–34: assignment lookup; statistic lookup; accepted review with dropped response; immediately repeated POST returning 422.

**Reproduce:** `npm run e2e:android -- --suite recovery --serial SERIAL`. The strict no-replayed-POST assertion remains in place and should pass on the rebuilt fixed app. `--suite receipt-recovery` is a distinct fault: accepted write with an unreadable receipt. It tests JavaScript receipt reconciliation and must not be substituted as evidence that arbitrary connection-loss transport never replays.

**Original classification:** observed transport risk / policy question, not evidence of a duplicate server effect. The design already excludes a universal exactly-once guarantee. Investigate native fetch/OkHttp retry behavior and the real server's duplicate validation before deciding whether an app change is appropriate.

## Tooling distinctions

- Metro attempted to parse an ignored local environment input during native bundling. Environment files are now explicitly excluded from Metro's source/asset graph; test runs also disable dotenv loading. Diagnostic values were redacted. No environment file is included in source or fixtures.
- Maestro keyboard dismissal and IPv6-localhost/adb bridging failures are harness/tooling issues, not application mutation defects. Their fixes do not bypass grading or persistence.
- Synonyms are intentionally normalized to lowercase by `normalizedSynonyms()` in `SubjectDetailsScreen`. Native assertions compare the documented normalized value; this is not being treated as an app failure or weakened to accept arbitrary payloads.

Add new application findings here with expected/observed behavior and reproducible evidence. Do not loosen their assertions to make the suite green. Application fixes require their own scoped change and regression verification.
