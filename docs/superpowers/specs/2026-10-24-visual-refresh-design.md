# Taatoru visual refresh

## Intent

Make the existing native Expo client feel like a polished WaniKani companion.
The user delegated the art direction. The chosen direction is a restrained neon
study desk: warm light surfaces or ink-dark panels, WaniKani pink/cyan/purple,
strong numerical hierarchy, fine borders, and consistent Lucide icons.

## Current stage and evidence

The app has functional local-first authentication, synchronization, lessons,
reviews, search, and analytics. Settings is a static account information screen.
All 47 suites / 234 tests pass before changes. Android inspection showed a
dashboard dominated by synchronization controls and text-only progress summaries.
The existing development build also reports a notification sound warning; that
predates this work. Current screenshots were captured in the test emulator.

## Approaches

1. Recolor existing cards only: small scope, but leaves the dashboard hierarchy
   and dense progress text unresolved.
2. Refresh the shared system and study surfaces (chosen): native navigation,
   recognizable subject colors, prominent study actions, compact synchronization,
   accessible charts, consistent subject tiles, and a persistent picker footer.
3. Replace navigation and add a game-like sci-fi shell: unnecessary behavioral
   scope and less familiar for everyday study.

## Constraints and decisions

- Work only in Taatoru; preserve unrelated edits to `docs/wanikani-api.md`.
- Keep the current Expo/React Native architecture and native tabs.
- Keep system light/dark mode, scalable text, 48dp targets, explicit labels,
  checked state, and safe areas. Charts include textual equivalents.
- Preserve lesson ordering, revalidation, selection persistence, API/database,
  authentication, answer checking, and synchronization contracts.
- No invented stats, placeholder actions, new product routes, or remote assets.
- Use one small icon dependency, compatible with the existing SVG dependency.
- Scope includes dashboard, shared surfaces, login, search, picker, analytics,
  subject details, and the existing study prompts. Native text rendering handles WaniKani emphasis tags. Settings remains informational.

## Verification

Run focused interaction/semantic regression tests, then the full `npm run verify`
gate. Inspect the actual Android screens in both themes, picker selection and
cancel, lesson/review entry and exit, large text, and narrow/landscape layouts.
Document exactly what was verified; do not submit answers to a live account.
