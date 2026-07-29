# Taatoru Foundation Design

## Summary

Taatoru is an Android-first Expo application for WaniKani. Its first release
will provide a real-account, local-first experience covering login,
synchronization, lessons, reviews, search, subject details, analytics, and
review notifications.

Tsurukame is the primary behavioral reference. Taatoru will reproduce
Tsurukame's WaniKani-facing synchronization behavior and keep its lesson and
review experiences visually close to Tsurukame. The rest of the application
will use an original, more modern, clean, minimal Android design.

Smouldering Durtles may be consulted for Android-specific product ideas, but no
Smouldering Durtles source or branded assets will be copied in the first
release.

## Product identity

- Working app name: Taatoru.
- Repository directory: `taatoru/`.
- Android application ID: `app.taatoru`.
- Initial platform: Android.
- Framework: Expo with a development build and Continuous Native Generation.
- Language: TypeScript with strict type checking.
- Orientation: portrait-first, with responsive behavior for landscape and
  tablets.
- Authentication: a WaniKani personal access token supplied by the user.

Taatoru is an unofficial client. It must not imply endorsement by WaniKani or
Tsurukame.

## Licensing and attribution

Tsurukame is licensed under Apache License 2.0 and does not contain a separate
`NOTICE` file. Taatoru will satisfy the license and provide clear credit by:

1. Licensing the Taatoru repository under Apache License 2.0.
2. Shipping a copy of the Apache License 2.0 in `LICENSE`.
3. Adding `NOTICE.md` with a readable attribution to Tsurukame, David Sansome,
   and Tsurukame contributors.
4. Adding the same attribution to the in-app Settings > About > Open source
   licenses screen.
5. Retaining original copyright and license headers in any source file that is
   copied or translated from Tsurukame.
6. Adding a prominent modification notice to each such derivative file.
7. Recording the Tsurukame source path and upstream revision in a short comment
   near each substantial port so future maintainers can compare behavior.
8. Avoiding Tsurukame's name, icon, screenshots, and other branding as
   Taatoru's product identity.

The synchronization and lesson/review characterization baseline is Tsurukame
revision `8e18ddf7f12c44e91cb0ad63bab31af7440648ea`.

The initial visual components will be newly implemented. Tsurukame screenshots
may be used as internal comparison references but will not be bundled into the
application.

Taatoru will not copy or derive data from Tsurukame's bundled
`visually-similar-kanji.json` or the GPL-3.0 WaniKani Niai community
databases from which it was generated. Visually similar kanji will come only
from WaniKani API subject resources.

## First-release scope

### Included

- Personal access token login, validation, replacement, and logout.
- Local SQLite database and schema migrations.
- Quick incremental synchronization and full cache refresh.
- Offline-readable dashboard, analytics, search, and subject details.
- Transactional pending writes for lesson starts, reviews, and study-material
  edits.
- Automatic lesson sessions and a manual lesson picker.
- Lesson presentation and lesson quizzes.
- Review sessions, answer checking, session summaries, and recent mistakes.
- Search by Japanese characters, readings, meanings, and user synonyms.
- Subject details, mnemonics, context sentences, readings, meanings,
  pronunciation audio, related subjects, WaniKani-provided visually similar
  kanji, notes, and synonyms.
- Dashboard and analytics for available work, upcoming reviews, current-level
  progress, SRS distribution, accuracy, and leeches.
- Local review notifications, launcher badge updates when supported, and
  optional notification sounds.
- Light, dark, large-text, narrow-screen, and long-list support.

### Deferred

- Handwriting recognition.
- Apple Watch, Siri, and iCloud equivalents.
- Cross-device recent-mistake history.
- Remote push-notification infrastructure.
- Bulk offline-audio downloads.
- Katakana and other specialized practice modes.
- Exhaustive parity with Tsurukame's advanced display, font, and answer
  settings.
- Supplementary community-generated visually similar kanji.
- iOS and web releases.

Deferred features must not leave inactive controls or unfinished routes in the
first-release interface.

## Technical architecture

### Runtime and navigation

Taatoru will use Expo Router with native stack routes and a small bottom
navigation bar for Home, Search, Analytics, and Settings. Lessons, reviews,
subject details, login, and synchronization status will be stack routes above
those tabs.

A development build is required because reliable Android notification,
background-task, and database behavior must be verified outside Expo Go.

### Durable data

`expo-sqlite` is the durable source of truth. The database will enable WAL mode
and foreign keys during initialization. User-controlled SQL values will always
use bound parameters.

The schema will contain:

- `sync_state`: one row containing update cursors for assignments, study
  materials, subjects, voice actors, and review statistics, plus schema
  metadata. User and level progression resources are fetched in full on every
  sync, matching Tsurukame.
- `user`: the latest WaniKani user resource.
- `subjects`: searchable subject fields plus the complete JSON resource.
- `subjects_fts`: an FTS5 index for Japanese, readings, meanings, and synonyms.
- `assignments`: the latest unlocked, visible assignments.
- `study_materials`: notes and synonyms.
- `level_progressions`: historical level timing.
- `voice_actors`: voice metadata.
- `review_statistics`: accuracy and leech inputs.
- `audio_urls`: normalized pronunciation audio metadata.
- `subject_progress`: derived level, type, SRS stage, and local mistake time.
- `pending_progress`: queued lesson-start or review submissions.
- `pending_study_materials`: queued note and synonym edits.
- `recent_mistakes`: device-local subject mistake timestamps.
- `sync_errors`: a capped diagnostic history of 100 entries.
- `settings`: non-secret preferences.

The WaniKani token will not be stored in SQLite. It will be stored with
`expo-secure-store`, which uses Android Keystore-backed encrypted storage.

### State ownership

- SQLite owns server-derived and durable local data.
- A small synchronization store owns the current sync phase, progress,
  connectivity state, and last result.
- Lesson and review session stores own only the active transient session.
- Routes query repository functions rather than reading SQLite directly.
- Derived dashboard and analytics queries are deterministic and testable.

Long collections will use virtualized lists. Large calculations and database
work will be asynchronous to avoid blocking the JavaScript thread.

## WaniKani API client

The API client will:

- target `https://api.wanikani.com/v2`;
- send the currently documented `Authorization: Bearer <token>` header;
- send `Wanikani-Revision: 20170710`;
- parse all supported WaniKani timestamp formats used by Tsurukame;
- follow `pages.next_url` until pagination is complete;
- expose response `data_updated_at` values to the sync engine;
- track the 60-request server-clock minute used by Tsurukame;
- estimate clock skew from the response `Date` header and round-trip time;
- decode successful 200 and 201 responses;
- decode structured 4xx errors;
- preserve enough sanitized request and response context for diagnostics;
- never log authorization headers, tokens, user answers, mnemonics, notes, or
  other sensitive account content.

These documented headers intentionally replace Tsurukame's older
`Token token=<token>` authorization form without changing synchronization
semantics.

Initial full subject and review-statistic downloads will reproduce
Tsurukame's speculative pagination: nine page windows of 1,000 records are
started in parallel, the final window continues serially if more pages exist,
and duplicate IDs are removed before committing.

## Synchronization parity contract

The synchronization engine will be characterized against Tsurukame's
`LocalCachingClient.sync(quick:progress:)` behavior. Each item below is a
required behavior, not a later enhancement.

### Entry and concurrency

- Only one synchronization may run at a time.
- A second request while syncing completes without starting duplicate work.
- A request while offline completes without changing cursors or cached rows.
- Quick sync uses incremental cursors.
- Full sync clears the same server-derived cache families and resets their
  cursors before downloading replacements.
- Full sync preserves pending writes, local settings, credentials, and the
  device-local recent-mistake snapshot.

Two apparent upstream cache-cleanup defects are explicitly excluded from
parity: Taatoru clears orphaned audio URL rows during full refresh and resets
the review-statistics cursor during logout. Preserving either stale state could
leak data between cache generations or accounts. All other observed sync
ordering and failure behavior remains covered by parity tests.

### Rate-limit budgeting

Before work begins, the engine calculates remaining requests in the current
server-clock minute. It reserves Tsurukame's expected request budget for
subjects, assignments, and six fixed resource calls. Only the remaining
capacity may be used for pending progress and study-material uploads.

Pending progress is selected first. Pending study materials may use what
remains. Negative or zero capacity selects no queued writes.

### Phase one

The following operations begin together:

1. Send selected pending progress sequentially.
2. Send selected pending study-material edits sequentially.
3. Fetch subjects.

Subjects must finish before phase two because assignment normalization depends
on subject levels and subject types.

### Phase two

After phase one succeeds, these resources are fetched concurrently:

- assignments;
- study materials;
- user;
- level progressions;
- voice actors; and
- review statistics.

Assignments request only unlocked, non-hidden records. Subjects and review
statistics request non-hidden records.

### Resource commits and cursors

- Every page of a resource must be received before that resource is committed.
- Each resource is written in one SQLite transaction.
- The assignments, study-materials, subjects, voice-actors, and
  review-statistics cursors advance in their corresponding transaction.
- User and level progressions are fetched in full on each sync and therefore
  have no stored cursor.
- A failed fetch or failed transaction leaves the previous cursor unchanged.
- Assignment writes update `subject_progress` without erasing an existing
  local mistake timestamp.
- An increased subscription level clears the subject cursor so previously
  inaccessible subjects are downloaded on the next sync.
- Derived counts and subscriptions are invalidated after synchronization
  finishes, whether it succeeds or fails.

### Pending lesson and review progress

Completing a lesson or review atomically:

1. removes the stale assignment from the available local queue;
2. writes a serialized pending operation keyed by subject;
3. updates the local SRS projection;
4. records a current mistake timestamp for an incorrect review; and
5. invalidates dashboard, SRS, lesson, leech, and recent-mistake queries.

The app immediately attempts delivery when online. Lesson progress uses
`PUT /assignments/{id}/start`. Review progress uses `POST /reviews` with the
assignment ID and incorrect meaning and reading counts. A `created_at` value is
sent only when the operation is older than 15 minutes, matching Tsurukame's
clock-drift behavior.

Queued progress is delivered one item at a time:

- success removes the queue row;
- HTTP 422 removes the stale queue row because the server cannot accept it;
- authentication, connectivity, rate-limit, decoding, and server errors keep
  the queue row for retry.

Replacing an expired token must preserve cached data and pending progress.

### Pending study materials

Notes, synonyms, and exclusions are updated locally and queued in one
transaction. Delivery first checks whether a study-material resource already
exists, then uses POST for a new resource or PUT for an existing resource.
Successful delivery removes the pending marker. Failures preserve it.

### Full refresh and recent mistakes

Before a full refresh, the engine snapshots device-local mistake timestamps.
The server-derived assignment and progress cache is rebuilt, then mistake
timestamps from the last 24 hours are merged back by subject ID. When duplicate
timestamps exist, the newer one wins. Older entries are pruned.

No cross-device mistake synchronization will be implemented.

### Completion and errors

After every attempted sync, the engine:

- marks progress complete;
- releases the synchronization mutex;
- invalidates all derived data;
- refreshes visible queries;
- updates the last-sync result;
- recomputes notification schedules from the resulting assignment cache.

Error behavior will match Tsurukame:

- HTTP 401 opens a reauthentication path without deleting pending progress.
- A hibernation-specific HTTP 403 shows a dedicated account state.
- Other API and decoding errors are recorded in the capped diagnostic log.
- Expected offline, timeout, and connection-aborted errors do not create noisy
  diagnostic entries.
- HTTP 429 retains all pending data and displays the calculated retry time.

Explicit logout removes the token, account cache, pending writes, local mistake
history, diagnostic data, and scheduled notifications.

## Lessons

The dashboard offers both automatic lessons and a separate lesson picker.

Automatic lessons use Tsurukame-compatible ordering settings, current-level
priority, batch size, apprentice limit, and kana-vocabulary visibility. The
manual picker shows only currently available, non-excluded assignments grouped
by level and subject type. It shows accessible checked state and a selected
count, and Begin is disabled for an empty selection.

The lesson experience intentionally stays close to Tsurukame:

- immersive, subject-colored full-screen presentation;
- a large Japanese character or radical image;
- compact progress and queue indicators;
- meaning, reading, mnemonic, examples, and pronunciation sections;
- a batch presentation phase followed by a quiz phase;
- the same visible distinction between meaning and reading prompts;
- an answer field anchored above the Android keyboard;
- clear correct, incorrect, and retry feedback;
- a session menu for details, audio, and ending the session safely.

Lesson state survives activity recreation and process restart. An assignment is
not submitted as started until its lesson quiz is complete.

## Reviews

Reviews use the same immersive visual language as lessons. The layout preserves
Tsurukame's large subject field, dark task strip, compact session status, and
keyboard-adjacent answer input while respecting Android system insets.

The deterministic answer checker will port Tsurukame's accepted-answer
behavior, including:

- case and whitespace normalization;
- kana conversion;
- accepted meanings and readings;
- auxiliary meaning types;
- user synonyms;
- close-answer handling;
- reading-versus-meaning mismatch guidance;
- separate meaning and reading error counts;
- configurable meaning-first and grouped prompt ordering.

Review sessions support item limits, batching, summary results, pronunciation
audio, subject details, recent mistakes, and safe early exit. Completion queues
exactly one review submission per assignment.

## Search and subject details

Search runs against local data and remains useful offline. It supports Japanese
characters, romaji-to-kana conversion, readings, meanings, and user synonyms.
Exact matches rank first, followed by lower subject level while preserving a
stable order. Results are capped to keep interaction responsive.

Search results use the established WaniKani subject palette:

- radical: cyan/blue;
- kanji: pink;
- vocabulary and kana vocabulary: purple with a distinct accessible marker.

Subject details expose meanings, readings, mnemonics, context sentences,
pronunciation audio, level, SRS stage, related subjects, notes, synonyms, and
review statistics. Editable notes and synonyms use the pending
study-material queue.

For kanji subjects, Taatoru reads `visually_similar_subject_ids` from the
WaniKani subject resource and resolves those IDs against locally cached
subjects. The section preserves the API order, removes duplicate or unavailable
subjects, and by default hides subjects above the user's current level. A
subject-details setting may reveal above-level matches. Taatoru does not merge
these results with Tsurukame's bundled supplementary character list.

## Dashboard and analytics

The dashboard will be an original modern interpretation rather than a literal
UIKit copy. It uses generous spacing, restrained cards, simple typography,
subtle dividers, and a compact bottom navigation bar.

It includes:

- available lesson and review counts;
- the next review time;
- an hourly review forecast with cumulative totals;
- current-level radical, kanji, and vocabulary progress;
- estimated time to level completion;
- SRS category totals;
- recent lessons, recent mistakes, and leech shortcuts;
- vacation and offline states;
- last-sync status and pending-write count.

Analytics includes:

- upcoming-review distribution;
- SRS distribution;
- current and historical level timing;
- meaning and reading accuracy;
- strongest and weakest subjects;
- leech ranking.

Charts will use minimal axes, direct labels, accessible summaries, and the
subject/SRS palette. They will not reproduce Tsurukame's paper textures or
older table styling.

## Visual system

The general application uses:

- neutral light and near-black dark canvases;
- white or lightly tinted surfaces;
- one blue brand accent;
- WaniKani subject colors only where they communicate subject type;
- rounded but restrained cards;
- system typography with a Japanese-capable fallback;
- 48 dp minimum interactive targets;
- visible focus, pressed, selected, disabled, loading, and error states;
- semantic accessibility roles and labels;
- responsive spacing for large text and narrow screens.

Lessons and reviews deliberately remain visually closer to Tsurukame than the
rest of the app. Their strong full-screen color fields and compact task strips
are part of the learning context and should not be converted into ordinary
dashboard cards.

## Notifications

After sync and when the app moves to the background, Taatoru removes its
previous review schedule and rebuilds it from cached assignments.

The scheduling algorithm reproduces Tsurukame:

1. Round forward to the next whole hour.
2. Start with the currently available review count.
3. Walk hourly upcoming-review buckets.
4. Skip empty buckets.
5. Add each bucket to the cumulative count.
6. Schedule at most 64 notifications.
7. Include cumulative available reviews and newly available reviews.
8. Apply independent alert, badge, and sound preferences.
9. Clear badges and suppress schedules during vacation mode.

Android 13 notification permission is requested in context when the user first
enables notifications. The notification channel is created before scheduling.
Launcher badges are best effort because support varies by Android launcher.

An Expo background task performs opportunistic quick sync and rescheduling.
Android controls its execution time, so notifications never depend on a
background task running at an exact moment.

## Security and privacy

- The API token is stored only in SecureStore.
- The token is never included in logs, analytics, crash reports, screenshots,
  or source control.
- Taatoru has no first-party backend in the first release.
- Account data remains on the device except for direct WaniKani API requests.
- Database queries bind user-controlled input.
- Logout removes credentials and local account data.
- Development fixtures contain invented users and subjects only.

## Testing strategy

### Characterization and unit tests

Before implementing production sync behavior, tests will capture Tsurukame's:

- quick and full sync ordering;
- request-budget calculations;
- sequential pending writes;
- subject-first dependency;
- paginated and speculative fetches;
- duplicate removal;
- cursor commit timing;
- subscription-level cursor reset;
- optimistic SRS projection;
- HTTP 401, 403, 422, and 429 handling;
- recent-mistake merge, restore, and pruning;
- derived count invalidation;
- notification bucket scheduling.

Pure tests will also cover lesson selection and ordering, answer checking,
search normalization and ranking, analytics calculations, and SRS projections.
Subject-detail tests will verify API ordering, local subject resolution,
deduplication, unavailable-subject handling, and the above-current-level
setting for visually similar kanji.

### Component tests

React Native Testing Library tests will cover login, empty/loading/error states,
lesson selection, review prompts, search results, settings, notification
permission rationale, accessibility roles, and large-text layout behavior.

### Android integration

A development build and Android emulator will verify:

- SecureStore persistence;
- SQLite migrations, WAL mode, FTS queries, and transactional rollback;
- real navigation and process recreation;
- notification permission, channels, scheduling, taps, sounds, and badges where
  the emulator launcher supports them;
- background-task registration;
- keyboard and input-method behavior;
- audio playback;
- dark theme and large text;
- long virtualized lists.

API integration tests use a controlled HTTP fake. Automated tests never call
the live WaniKani API or alter a real account.

### Visual comparison

Lesson and review screens will be compared against Tsurukame's checked-in
Fastlane screenshots for composition, hierarchy, task labeling, progress, and
input placement. Dashboard, search, analytics, and settings screenshots will
be reviewed against Taatoru's own modern visual rules rather than pixel-matched
to Tsurukame.

## Acceptance criteria

The first release is acceptable when:

1. A user can authenticate, complete the first sync, close the app, and browse
   cached data offline.
2. Quick and full synchronization pass the complete parity characterization
   suite.
3. A lesson can be completed offline, queued, and submitted once connectivity
   returns.
4. A review can be completed offline, retained across process death, and
   submitted exactly once.
5. Search and subject details work from local data.
   Visually similar kanji contain only subjects identified by the WaniKani API.
6. Dashboard and analytics agree with controlled assignment fixtures.
7. Review notifications match controlled hourly fixtures and are rescheduled
   after sync.
8. Lessons and reviews preserve Tsurukame's focused visual hierarchy on a
   narrow Android phone.
9. The rest of the application is clean, minimal, modern, and accessible in
   light and dark themes.
10. The repository and in-app About screen carry the required Apache 2.0
    license and Tsurukame attribution.
11. No token, account data, signing material, or live-answer data appears in
    source, fixtures, logs, or commits.
