# Study release fixes

The user authorized fixing the eight findings in the 2 November lesson/review audit, troubleshooting the native smoke suite and opening a ready MR. Implement focused corrections within the existing Expo/SQLite architecture; keep both reference apps read-only and exclude the optional feature backlog.

## Behavior

- User correction: preserve original Japanese-keyboard behavior: `nn` commits `ん`, so incrementally typed `annai` produces `あんあい`. Revert the hidden pending-n composition change; preserve original trailing n/m, deletion and paste behavior. Preserve `n'` until romaji reading conversion (a separate grading correction).
- Revalidate saved lesson assignments on resume and within the completion transaction, retaining committed work and eligible progress. Unavailable/replaced assignments must not queue invalid starts. Offer retry, home and safe reload on lesson failures.
- Use WaniKani's count-dependent local SRS penalty, bounded to stages 1–9. Do not fabricate due times.
- Make image-only radicals durably available offline through an explicit asset cache, with load/error/retry behavior and neutral pre-answer accessibility labels. Keep asset state independent of assignment state and credentials. Do not import reference-app assets or new frameworks.
- Separate skipping from answer overrides. Preserve the existing reset-on-deferral semantics with explicit copy; default skipping off. Existing persisted settings remain valid.
- Add persisted review wrap-up: stop introducing untouched subjects, finish attempted subjects, leave untouched reviews due. Results show completed-subject accuracy and missed subjects with details links. Exit/resume and ordinary completion remain valid.
- Fix native harness startup without weakening UI, database or HTTP assertions. Avoid concurrent accessibility automation clients; clean only resources owned by the runner.

## Approach

Extend existing repositories, reducers, shared study UI and test harness seams. A new session framework or optimistic remote progression would add risk without helping the reported defects. Add focused regression tests before production changes, then run all automated checks and synthetic Android flows. Use a small cache helper rather than changing sync schemas. The implementing agent may choose exact helper names after reading neighboring code.

## Release evidence

Require Node 22 verification, Expo Doctor, native/prebuild checks, real synthetic smoke execution and source/diff review before creating the MR. Record exact limits if a device check remains unavailable. Never use a real account or token for mutation testing.
