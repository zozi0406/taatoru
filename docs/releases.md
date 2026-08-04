# Android release runbook

Taatoru uses GitHub for public, secret-free source checks and EAS for Android
signing, builds, and Google Play submission. Automatic workflows build
artifacts only. A release maintainer must verify and approve every store
submission and must publish every GitHub Release manually.

## Trust model

- GitHub Actions has read-only repository access and receives no Expo token,
  Android signing key, or Google Play credential.
- EAS holds the Android upload key and Google Play service-account credential.
- Only trusted release maintainers may administer the EAS project, create
  protected `v*` tags, approve EAS submissions, or publish GitHub Releases.
- GitHub releases are published from a trusted maintainer workstation. EAS is
  not given a GitHub release token.
- Two-factor authentication is required for GitHub, Expo, and Google accounts
  that can change or use release authority.

## Required hosted settings

Before the first release, confirm all of the following:

1. The GitHub `main` branch ruleset requires a pull request, one approval,
   code-owner review, dismissal of stale approvals, and the `Taatoru CI`
   status check. Force pushes and deletion are blocked.
2. The GitHub `v*` tag ruleset restricts tag creation, update, and deletion to
   designated release maintainers. General collaborators cannot bypass it.
3. The Expo GitHub App is installed for `zozi0406/taatoru` only, not every
   repository owned by the account.
4. EAS project membership is limited to release maintainers.
5. The EAS project has a remote Android upload key and a Google Play service
   account limited to releasing `app.taatoru`.
6. The Play Console application exists, uses Google Play App Signing, and has
   its required store listing and app-content declarations completed.

Do not add an Expo token, keystore, service-account JSON, or signing password
to GitHub repository secrets. They are not needed by `.github/workflows/ci.yml`.

## One-time EAS setup

Run these commands from a trusted workstation using Node.js 22.23.2:

```sh
npx --yes eas-cli@21.5.0 login
npx --yes eas-cli@21.5.0 whoami
npx --yes eas-cli@21.5.0 init
npx --yes eas-cli@21.5.0 project:info
npx --yes eas-cli@21.5.0 credentials:configure-build --platform android --profile production
```

Review the public `owner` and `extra.eas.projectId` values produced by
`eas init` before committing them. Choose EAS-managed remote Android
credentials. Upload the Play service-account credential directly to EAS from
a path outside this repository, then delete the local copy according to the
team's credential policy. Record only public project identifiers and signing
fingerprints in verification notes.

Validate every profile and workflow after the project is linked:

```sh
npx --yes eas-cli@21.5.0 config --platform android --profile development --non-interactive
npx --yes eas-cli@21.5.0 config --platform android --profile preview --non-interactive
npx --yes eas-cli@21.5.0 config --platform android --profile release-apk --non-interactive
npx --yes eas-cli@21.5.0 config --platform android --profile production --non-interactive
npx --yes eas-cli@21.5.0 workflow:validate .eas/workflows/build-android-release.yml --non-interactive
npx --yes eas-cli@21.5.0 workflow:validate .eas/workflows/publish-android-release.yml --non-interactive
```

## Prepare a release

1. Start from an up-to-date `main` whose pull-request CI passed.
2. Update the top-level `version` and Android `versionCode` in
   `app.config.ts`. Every AAB submitted to Play must have a previously unused,
   higher `versionCode`.
3. Prepare release notes and merge the version change through a pull request.
4. Use a stable tag such as `v0.1.0` or an RC tag such as `v0.1.0-rc.1`. The
   semantic version in the tag must exactly match the Expo app version.
5. Run the complete preflight from a clean checkout:

```sh
npm ci
npm run verify
npx --yes expo-doctor@1.20.1
npm run prebuild:check
git diff --exit-code
git status --short
```

For the initial release candidate, set and verify the immutable source:

```sh
release_tag=v0.1.0-rc.1
release_commit=$(git rev-parse HEAD)
git fetch origin main
git merge-base --is-ancestor "$release_commit" origin/main
npm run validate:release -- push tag "$release_tag" "$release_commit"
```

The commands must succeed, and `git status --short` must print nothing.

## Start signed builds

Creating the protected tag triggers `.eas/workflows/build-android-release.yml`.
It validates the event, tag, app version, commit, and `main` ancestry before
building a signed internal APK and production AAB in parallel. It cannot
submit either artifact.

Inspect the proposed tag and commit before pushing:

```sh
git tag -a "$release_tag" -m "Taatoru $release_tag"
git show --no-patch "$release_tag"
git push origin "$release_tag"
```

Never move, overwrite, or reuse a published version tag. If the source or
version is wrong, increment the version code as needed and create a new tag.

Follow the matching workflow run:

```sh
npx --yes eas-cli@21.5.0 workflow:runs --workflow build-android-release.yml --limit 5 --json
```

Copy the matching workflow-run ID into `workflow_run_id`, then inspect all
jobs and outputs:

```sh
read -r workflow_run_id
npx --yes eas-cli@21.5.0 workflow:view "$workflow_run_id" --json --non-interactive
```

## Verify the artifacts

Copy the `release-apk` and `production` build IDs from the workflow output into
the named variables, one at a time:

```sh
read -r apk_build_id
read -r aab_build_id
npx --yes eas-cli@21.5.0 build:view "$apk_build_id" --json
npx --yes eas-cli@21.5.0 build:view "$aab_build_id" --json
```

Both builds must report all of these values correctly:

- platform `android` and package `app.taatoru`;
- expected app version and unused Android version code;
- the protected tag's commit;
- profile `release-apk` with internal distribution for the APK; and
- profile `production` with store distribution for the AAB.

Download the APK to a temporary directory, create its checksum, and install it
on an emulator and a non-valuable test device:

```sh
shasum -a 256 "/tmp/taatoru-${release_tag}.apk" > "/tmp/taatoru-${release_tag}.apk.sha256"
shasum -a 256 -c "/tmp/taatoru-${release_tag}.apk.sha256"
adb install -r "/tmp/taatoru-${release_tag}.apk"
```

Check cold launch, offline launch, onboarding without entering a valuable API
token, dark theme, large text, notification permission behavior, and absence
of development-client UI. Do not submit or publish if metadata or smoke checks
differ from the expected release.

## Submit the exact AAB to Google Play internal testing

Start the manual publication workflow only after the APK smoke test and AAB
metadata review pass:

```sh
npx --yes eas-cli@21.5.0 workflow:run .eas/workflows/publish-android-release.yml \
  --ref "$release_tag" \
  -F "build_id=$aab_build_id" \
  -F "release_tag=$release_tag" \
  -F "commit_sha=$release_commit" \
  --wait
```

The workflow shows the supplied build ID, tag, and commit, then stops at a
`require-approval` job. Compare those inputs with the EAS build page and reject
the workflow if any value differs. Approval submits only that build ID to the
Google Play internal track.

Submitting an RC consumes its Android `versionCode`. Increment `versionCode`
before building and submitting the stable release, even when the public app
version remains unchanged.

## Publish the GitHub Release manually

Publish only the APK already smoke-tested above. Include the checksum, source
commit, workflow-run ID, APK build ID, and AAB build ID in the notes. For an RC,
use GitHub's prerelease flag:

```sh
gh release create "$release_tag" \
  "/tmp/taatoru-${release_tag}.apk" \
  "/tmp/taatoru-${release_tag}.apk.sha256" \
  --verify-tag \
  --prerelease \
  --title "Taatoru $release_tag" \
  --notes-file "/tmp/taatoru-${release_tag}-notes.md"
```

Omit `--prerelease` for a stable release. Confirm the GitHub Release points to
the protected tag and that its downloaded APK reproduces the recorded SHA-256
checksum.

## Recovery and credential boundaries

- A failed build can be rerun from the immutable tag. Do not move the tag.
- A failed submission can be retried with the same exact AAB build ID if Play
  has not consumed its version code. Inspect Play Console before retrying.
- If a credential or maintainer account may be compromised, remove EAS project
  membership, restrict or revoke the Expo GitHub App, rotate the Play service
  account, and reset the Android upload key in the service that owns it.
- Never commit recovery credentials, local account data, tokens, or credential
  exports. Verification notes contain IDs, URLs, fingerprints, and results
  only.
