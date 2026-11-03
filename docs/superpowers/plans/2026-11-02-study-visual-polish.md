# Study Visual Polish Implementation Plan

> Execute inline using superpowers:executing-plans; fresh whole-change review at the end.

**Goal:** Implement the seven approved lesson/review visual upgrades.
**Architecture:** Extend shared React Native study UI; keep persistence/reducers unchanged. Shared header and feedback layout unify lessons and reviews.
**Tech Stack:** Existing Expo 57, React Native, TypeScript, Jest and lucide icons.
**Spec:** ../specs/2026-11-02-study-visual-polish-design.md

## Global Constraints

No new dependencies, grading/sync/schema changes, native regeneration, unrelated
fixes, commits or pushes. Preserve all accessibility labels and draft/save/error
behavior. Use Node 22.

## Review Focus

- Persist before success; one completion despite duplicate taps or unmount.
- Manual advance and failed-save retries retain their existing semantics.
- Disclosure never reveals an unanswered prompt unless explicitly requested.
- Section switching retains all settings drafts and dirty-close behavior.
- Keyboard, large text, safe areas, long subject text and landscape stay usable.

## Tasks

1. [x] Shared header, compact hero and feedback: add focused success persistence
   ordering/unmount tests; observe failures; implement 220 ms success cue and
   shared count/progress/settings/exit header. Retain input labels and controls.
   Run study question/review/lesson tests.
2. [x] Guided lesson and results: lighten information sections, collapse optional
   details, show primary reading early and batch position; add missed-subject
   glyphs and compact completion metrics. Test disclosure and finish behavior.
3. [x] Settings sections: test draft retention across Answers/Reviews/Lessons/Audio,
   saving from any section and failed-save recovery; implement persistent footer.
   Run settings and focus tests, then npm run verify.
4. [x] Inspect the synthetic smoke fixture through the native lesson, settings,
   review and wrap-up screens. Check light/dark, keyboard, 1.8x text and
   landscape. Restore emulator settings and verify the complete diff.

## Progress

Baseline: clean feature checkout; previous audit ran npm verify successfully
(84 suites / 566 tests). Ruling: work in the clean existing checkout on a new
feature branch to reuse the native synthetic harness; no worktree needed.
User approval of all seven changes authorizes implementation without a further
design/plan approval round. No commits until requested.

Final verification passed with 84 Jest suites and 570 tests, plus release config
and native tooling checks. Manual wrap-up sent one review with two recorded
meaning mistakes and left 11 reviews due. The independent reviewer verified
cue ordering before its session ended. The author completed the final diff review.
