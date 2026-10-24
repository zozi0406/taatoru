# CI dependency alignment — 24 October 2026

The failing Taatoru CI run passed lint, TypeScript and application tests, then failed Expo Doctor's SDK compatibility check. It reported 19 packages below the recommended Expo 57 patch versions. Native project generation was skipped after that failure.

Updated those 19 direct dependency declarations, including Expo 57.0.31 and React Native 0.86.3, and regenerated the lockfile. Resolving the graph in a clean temporary folder avoided retaining the previous React Native/Jest preset pair during an in-place npm upgrade. The matching test preset is resolved transitively; no new direct dependencies, peer-check exclusions or force flags were added.

Checks completed with Node 22:

- A clean `npm ci` succeeded using the regenerated lockfile.
- `npm run verify` passed: lint, TypeScript, 291 tests in 56 suites and 13 release checks.
- The exact CI command, `npx --yes expo-doctor@1.20.1`, passed all 20 checks.
- `npm run prebuild:check` generated Android and iOS projects successfully in an isolated copy. Comparing every tracked file afterward found no changes. This preserved the existing local native development projects.
- `git diff --check` passed.

These checks validate installation, tests, dependency compatibility and native project generation. The updated native dependencies have not been rebuilt into or exercised in a new device binary in this CI repair.

## Review feedback: incremental reading input

The review identified that a trailing `m` became `ん` before the following vowel could arrive. Character-by-character tests through both the review and lesson inputs reproduced ten failures, while four existing `n` cases passed. The input now preserves unfinished `m` syllables and handles doubled `m` without losing the converter's small-tsu behavior.

All 14 input cases now pass, covering `ma`, `yama`, `mya`, `mma`, `sempai`, `na` and `nn` in both flows. A fresh `npm run verify` passed lint, TypeScript, 305 tests across 57 suites and all 13 release checks after this correction.
