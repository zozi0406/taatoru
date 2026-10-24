# Review and lesson UX verification — 24 October 2026

The reported review blocker was reproduced on the Android development build. A saved session still referenced assignments replaced by the current cache. Correct answers therefore failed their transactional completion. The error appeared below the keyboard-aware screen, outside its protected content. Wrong answers also lacked an explicit Continue action and readable recovery information.

The lesson chooser had separate persistence races: an older draft save could overwrite a newer selection, recreate a cancelled draft, or replace a batch that had just begun. Selectable child text also competed with checkbox taps.

## Resulting behavior

- Remaining review subjects are checked against current local availability before resuming. Replaced assignments reset their attempts; unchanged subjects retain completed halves and mistakes. A stale completion cannot silently write against a different assignment.
- Reviews and lesson quizzes share a compact WaniKani-style subject, question, answer, result and information layout. Correct answers advance automatically by default. Incorrect answers reveal accepted answers and offer Continue, an explicit override, or a later attempt. Local saves gate navigation and duplicate taps.
- Meaning synonyms are loaded for grading. Adding a synonym uses the existing study-material outbox and preserves personal notes. Typo/exact-match guidance and alternate-reading guidance do not record mistakes.
- Reading input can convert romaji to kana. Long-vowel marks remain valid in romaji mode. Meanings, labeled readings, mnemonics, hints, personal notes, context sentences and audio controls are available; unattempted halves remain concealed until explicitly revealed. Full subject details provide the existing relationships and editing tools.
- Lesson study pages have Previous/Next and a separate quiz. Ordinary Start lessons resumes an active chosen batch. Merely viewing information does not start an assignment.
- Settings persist locally: automatic advancement, overrides, exact matching, information disclosure, reading input, pronunciation autoplay, meaning/reading/mixed questions, review order and limit, active-pool size, mistake delay, lesson batch size/type priority, current-level priority, kana vocabulary and Apprentice limit. Returning to Settings refreshes its draft rather than overwriting newer modal changes.
- The chooser has group selection/clear, a configured selection cap, visible checked states, ordered draft saves, revalidation before Begin, safe Cancel, and local-load recovery. Selected lessons use the configured lesson presentation order.
- Database connections are owned independently across provider remounts, tolerate short lock contention, and are closed on initialization/bootstrap failure. Startup can be retried. Rotation exposed the lock-contention case during this run; the repeated device check recovered after the fix.

## Reference behavior and scope

Read-only references: Tsurukame `ReviewViewController`, `ReviewSession`, `SubjectDetailsView`, lesson/review settings and lesson ordering; Smouldering Durtles `Session` and question completion/undo boundaries. Neither repository was edited.

This covers the typed study workflows and core customization, not an exhaustive port of every Tsurukame feature. Mixed questions use deterministic rotation within the configured active pool; the reference randomizes question selection. The existing meaning-first default remains available and unchanged. Optional Anki self-grading, font libraries and some advanced review-order variants are outside this pass.

## Checks actually run

`npm run verify` passed: Expo lint, TypeScript checking, 291 tests across 56 suites, and 13 release-configuration checks. `git diff --check` passed.

Focused regressions cover stale/replaced assignments, unavailable subjects, completed-half preservation, rollback, reading-first and mixed scheduling, override accounting, duplicate submission, failed-save retry, cached synonyms, audio failure after a persisted grade, settings persistence/focus refresh, lesson navigation, active-batch preservation, chooser save/Begin/Cancel races, selection limits and groups, and database connection ownership/startup recovery. Automated tests use controlled local data and do not call the live API.

An independent review found completed-half selection on resume, stale settings drafts, and initialization-handle cleanup. Each was fixed with a regression test.

## Android walkthrough

1. **Resume review — healthy:** the saved position restored with current assignment IDs; a correct live answer saved and advanced.
2. **Incorrect result and override — healthy:** accepted answer and mnemonic were readable; the explicit override removed the current mistake and advanced. Two live subjects were completed in total, within the user's authorization.
3. **Exit and resume — healthy:** leaving and reopening retained the next subject. Repeated application refreshes retained the persisted session.
4. **Settings — healthy:** modal controls and ordering options were inspected at enlarged text. Persistence and refreshing a retained tab were checked with integration tests.
5. **Choose lessons — safe empty state:** the connected account had no available lessons. Begin remained disabled and Cancel returned home. Nonempty selection, ordering, Begin, cancellation and lesson quiz completion were verified with controlled local tests, not a live lesson start.
6. **Large text and rotation — healthy after fixes:** portrait at font scale 1.8 and landscape were inspected. A compact subject panel keeps the answer field fully visible in the short viewport, with the primary action outside the scrolling content. Original font scale, dark mode and automatic rotation were restored.

Screenshots and a step-by-step gallery are in the ignored local `.expo/study-ux/` folder because captures include live account UI. They were opened and inspected. The emulator used its floating/minimized keyboard; a full docked keyboard and iOS device were not validated. No complete live review batch was finished; full-session completion is covered by local tests.

Existing visual-refresh work and unrelated API/synchronization documents were preserved.
