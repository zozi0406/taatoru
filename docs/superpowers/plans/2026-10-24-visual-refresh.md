# Taatoru Visual Refresh Implementation Plan

> Execution: implement within the current session; user delegated visual choices.

**Goal:** A coherent native WaniKani-inspired interface across existing screens.

**Architecture:** Extend the shared semantic theme and small UI components.
Retain all existing feature data loaders, callbacks, reducers, and native tabs.

**Tech Stack:** Existing Expo 57, React Native, TypeScript, SVG; Lucide icons.

**Spec:** `docs/superpowers/specs/2026-10-24-visual-refresh-design.md`

## Global constraints

No data/API/session-engine changes; no unrelated file churn; system themes,
48dp controls, accessible chart summaries, and scalable layouts are required.

## Review focus

- Empty progress totals must never produce invalid widths or false completion.
- Charts must describe counts without depending on color or a drawing.
- Picker actions must remain reachable with long lists and large text.
- Native status/navigation bars must not cover study controls.
- Offline/error/loading states must remain honest and visible.

## Tasks

- [x] Extend semantic colors, typography, safe-area spacing, headings, cards,
  subject glyphs, and shared progress components. Verify theme tests/typecheck.
- [x] Refresh dashboard hierarchy; display actual forecast, level, and SRS data
  with accessible summaries. Add regression tests for charts and empty totals;
  retain action, offline, quick/full sync tests.
- [x] Refresh login, search, picker, analytics, settings, and study/detail screens.
  Preserve callbacks and accessible names. Keep picker actions outside its list;
  verify selection restoration, stale availability, cancellation and handoff.
- [x] Run `npm run verify`; inspect actual Android screens in light/dark, large
  text, and landscape. Review the full diff and record results.

## Outcome

Implemented and verified in this session. See `docs/verification/visual-refresh.md`
for the current-stage review, actual checks, and platform limits. Source review
found two layout issues; both were corrected and re-reviewed.
