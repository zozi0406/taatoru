# Android release pipeline verification

## Local implementation evidence

- Date: 2026-08-04
- Source commit: `f6081a0`
- Node: `22.23.2`
- `npm ci`: passed; npm reported 11 pre-existing moderate audit findings
- `npm run verify`: passed
  - ESLint: passed
  - TypeScript: passed
  - Jest: 46 suites and 211 tests passed
  - Release-policy tests: 13 passed
- `npx --yes expo-doctor@1.20.1`: 20 of 20 checks passed
- `npm run prebuild:check`: passed with no tracked-file changes
- Official Expo workflow schema and authenticated EAS CLI validation: both
  workflow files passed
- Working tree after verification: clean

## Hosted setup evidence

- GitHub repository: `zozi0406/taatoru`
- GitHub Actions repository secrets: 0
- GitHub pull request: <https://github.com/zozi0406/taatoru/pull/2>
- GitHub CI run: <https://github.com/zozi0406/taatoru/actions/runs/30934046851>
  (`Taatoru CI` passed)
- GitHub `main` ruleset: `Protect main` (`20398515`, active)
- GitHub `v*` tag ruleset: `Protect release tags` (`20398530`, active)
- Git tags: none
- Expo login: authenticated as `zozi0406`
- EAS project: `@zozi0406/taatoru`
- EAS project ID: `68bed05b-4efa-43d0-b82e-1f2cdb0a9cbc`
- EAS project URL: <https://expo.dev/accounts/zozi0406/projects/taatoru>
- Expo GitHub App access: pending
- Android signing credential: `Zffp7_SJXQ` (remote JKS, default)
- Android signing SHA-256 fingerprint:
  `67:5F:8D:61:C3:F2:4A:6E:7B:43:F2:BD:29:F3:C5:AD:17:B2:6C:C4:E3:3B:8A:AE:FE:1B:5A:63:BE:B6:AB:31`
- Google Play service account: not configured
- Release-candidate build and submission: pending

The remaining hosted steps require explicit maintainer approval for Android
signing setup, GitHub push and ruleset changes, Play credential setup, and
release-triggering actions.
