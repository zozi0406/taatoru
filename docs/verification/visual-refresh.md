# Taatoru visual refresh — 24 October 2026

## Current stage

Taatoru has working authentication/initial setup, local-first synchronization,
lessons and their quiz, reviews, search/details, and analytics. Settings remains
an informational screen; this change does not add account or study preferences.
The starting baseline passed 47 suites / 234 tests.

The initial Android dashboard gave synchronization the strongest visual priority,
used identical lesson/review cards, and displayed forecast and level progress as
text paragraphs. Search and lesson selection lacked a shared subject identity.
Lesson mnemonics also displayed WaniKani emphasis tags literally.

## Implemented

- WaniKani pink, cyan, and purple subject identity with semantic light/dark
  palettes, native system tabs, consistent typography, fine borders and surfaces.
- Primary lesson/review actions, graphical forecast, Guru progress meters and SRS
  distribution with textual accessibility equivalents and real local data.
- Compact synchronization below the study sections; existing offline, failure,
  vacation, pending upload and last-sync information is preserved.
- Consistent headings, subject tiles, search empty/results states and login.
- Persistent picker count and Begin/Cancel footer, checked cards, and disabled
  selection during preparation. Revalidation and session callbacks stay intact.
- Study prompts and quiz share the visual language, scroll with constrained
  height, protect system insets, and keep 48dp exit targets.
- WaniKani inline emphasis is rendered as native text, including readable colors
  in both themes. This is text rendering, not HTML execution.
- Analytics shares SRS colors and avoids oversized/negative-width bars for
  sparse or full 60-level histories.

## Verification

`npm run verify` runs Expo lint, TypeScript, the complete Jest suite, and the
release configuration tests. Final result: **49 suites / 243 Jest tests and 13
release checks passed**. `git diff --check` also passed.

New regression coverage exercises non-cumulative forecast totals, empty level
progress, all progress state accessibility labels, empty forecasts, cancellation,
preparation interaction gating, API text emphasis, and 60-level chart bounds.
Existing authentication, sync, subscriptions, automatic lesson start, stale
selection, persistence, lesson/review reducer and session tests remain green.

An independent source review identified footer safe-area handling and large-text
header overflow. Both were fixed; the follow-up review found no remaining
actionable issues.

## Android manual checks

Used the existing Android API 36.1 Taatoru test emulator and the existing debug
build, loading current JavaScript with Node 22. Screenshots were captured and
opened for visual inspection in this run.

| Step | Check | Result |
| --- | --- | --- |
| 1 | Dashboard and native navigation in light and dark modes | Passed |
| 2 | Picker empty state, checked row, live count, enabled Begin | Passed |
| 3 | Selection restored after activity recreation and preserved through rotation | Passed |
| 4 | Picker at 180% text in portrait and landscape; list scrolls independently of footer; dashboard at 320dp / 200% text | Passed |
| 5 | One selected subject reaches the actual lesson screen; exit returns home | Passed |
| 6 | Review entry resumes the existing session; answer field focuses; exit returns home | Passed, no answers submitted |
| 7 | Search by meaning, subject colors for radical/kanji/vocabulary, opening subject details and returning | Passed |
| 8 | Analytics and informational settings rendering | Passed |

Screenshots stay in ignored `.expo/visual-refresh/` so local account state is not
included in source control. Temporary emulator display settings are restored
before handoff.

## Limits and existing issues

- No iOS simulator/device run, TalkBack audit, or signed release build was made.
  The initial release targets Android. iOS safe-area handling was source-reviewed.
- Long-list virtualization is covered by a 100-subject component test; the cached
  emulator lesson list is short, so a long native list was not manually populated.
- The emulator's first keyboard focus showed Gboard's handwriting onboarding;
  this run does not establish every soft-keyboard configuration.
- The pre-existing debug build reports a missing notification sound named
  `default`. The warning was captured before this change and remains outside this
  initial visual refresh. It was subsequently fixed in the same session; see
  `account-and-notification-ux.md` for the cause and verification.
- An emulator System UI freeze and a development-launcher restart error occurred
  during preview setup. A clean launch and an emulator-compatible server binding
  restored the preview; no production data-layer changes were made for them.
