# Study Release Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Correct the audited study issues with the user's kana-behavior correction, obtain reliable synthetic native smoke evidence and open a ready MR.

**Architecture:** Extend current shared React Native study UI, pure reducers and transactional repositories. Keep pending writes and authoritative availability intact; use a separate durable image cache. Root handles harness troubleshooting while one implementation worker at a time owns product edits.

**Tech Stack:** TypeScript, Expo 57, React Native, SQLite, Jest, Maestro 2.12.0, Node 22.

**Spec:** `docs/superpowers/specs/2026-11-02-study-release-fixes-design.md`

## Global Constraints

- Both reference repositories are read-only. Modify Taatoru only.
- Preserve queued writes, completed halves, offline completion and subscription/reset guards.
- No real API/account mutation; original deterministic synthetic fixtures only.
- No dependency upgrades or optional advanced-study backlog in this MR.
- Do not weaken native journal/database/UI assertions or use test-only switches in product logic.

## Review Focus

- Preserve the requested immediate nn commitment and existing incremental editing; retain apostrophe grading and SRS corrections (Task 1).
- A refresh can replace assignments or make lessons unavailable between resume and completion (Task 2).
- Asset failure, restart and account replacement must not expose answers or delete pending work (Task 3).
- Wrap-up with mistakes, mixed completed halves, zero attempts and process recreation must leave untouched assignments due (Task 4).
- Settings saved mid-session and interrupted native bootstrap must not silently invalidate progress (Tasks 4–5).

### Task 1: Reading composition and SRS projections

**Files:** shared `StudyQuestion.tsx`, `answerChecker.ts`, kana helper if needed, `projection.ts`, their existing tests.
**Interfaces:** preserve shared question props and `checkAnswer`/`projectSrsStage` exports.
- [x] Superseded by user correction: restore original incremental `annai` → `あんあい`, `konnichiha` → `こんいちは`, `shinnyuu` → `しんゆう`; `nn` commits `ん`. Preserve trailing n/m, standalone nn and literal paste behavior; keep separate `shin'you` romaji grading correction.
- [x] Revert only hidden pending-n composition handling; retain media gating and the separate normalization/SRS fixes.
- [x] Add penalty tests: stage 8/one mistake → 6; stage 6/three mistakes → 2; clamp stage 1. Apply `ceil(totalMistakes / 2) * (stage >= 5 ? 2 : 1)` for incorrect reviews.
- [x] Run focused tests then full Jest suite; self-review and commit only this task's files.

### Task 2: Lesson opportunity validation and recovery

**Files:** `SessionRepository.ts`, lesson route/launcher/reducer/screen, focused session/route tests.
**Interfaces:** add a repository revalidation boundary analogous to reviews; preserve eligible progress and committed items.
- [x] Add failing in-memory/route tests for remote starts, replacement assignment IDs, hidden/excluded subjects, current subscription and reset state.
- [x] Revalidate on resume and atomically at completion. Refuse stale completion without enqueuing; distinguish refreshable availability errors.
- [x] Add retry/home to restore errors and safe reload to save errors; prove existing progress is preserved.
- [x] Run focused tests and full Jest suite; self-review and commit.

### Task 3: Offline image-only radicals

**Files:** shared hero/glyph, focused asset cache helper and tests, app/sync integration only where required.
**Interfaces:** cache URL-keyed radical image bytes durably without credentials; render from local content with visible retry on failure. Expose a neutral image label before grading.
- [x] Add failing tests for download/reuse after remount, offline cached asset, failed fetch/retry, absent media and pre-answer accessibility.
- [x] Implement durable image cache using existing Expo dependencies; prepare images as part of library asset preparation or before required study use. Do not copy reference assets.
- [x] Preserve theme rendering and prevent blank unanswerable prompts; keep session exits usable.
- [x] Run focused tests and full Jest suite; document limits, self-review and commit.

### Task 4: Deferral settings, wrap-up and results

**Files:** study settings and tests, review reducer/repository/screen and tests, shared study completion/question UI; lesson shared-callsite adjustments only as needed.
**Interfaces:** persist wrap-up intent and identify attempted subjects from completed halves/mistake counts. Introduce a separate boolean skip preference defaulting false; tolerate legacy snapshots.
- [x] Add failing tests for independent override/skip settings and explicit reset copy.
- [x] Add failing reducer/repository/UI tests for wrap-up with mixed halves, mistakes, no attempts, restart, completed accuracy and missed-subject links.
- [x] Implement wrap-up and results; untouched subjects stay available, committed items stay in outbox and Exit/resume still works.
- [x] Clarify settings application timing and shared lesson/review controls; prevent accidental dirty-draft loss using existing UI conventions.
- [x] Run focused tests and full Jest suite; self-review and commit.

### Task 5: Smoke harness, final evidence and MR

**Files:** `scripts/e2e/android.cjs`, runner helpers/tests, verification documentation; no product files owned by workers.
- [x] Diagnose development welcome-sheet startup and interrupted cleanup from captured evidence. Add failing focused tooling tests before fixing startup/cleanup.
- [x] Run real synthetic smoke without competing UI automation; expand to resume and focused new-feature device checks.
- [x] Run `npm run verify`, Expo Doctor, `npm run prebuild:check`, required native build/checks and `git diff --check`. Record output and limitations.
- [ ] Obtain independent whole-branch review, resolve important findings, verify staged scope, commit/push and create ready MR with exact base/dependency and test results.
