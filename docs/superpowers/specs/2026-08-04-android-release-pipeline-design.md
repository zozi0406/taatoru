# How Taatoru builds and publishes Android releases

## Goal

Give contributors transparent, secret-free checks while limiting Android build, signing, and publication authority to trusted release maintainers. A release is complete when one reviewed version tag produces traceable Android artifacts, the verified Android App Bundle reaches Google Play through a manual action, and the matching Android Package is available from a GitHub Release.

## Decision

GitHub Actions will run public continuous integration (CI) checks only. GitHub will not store an Expo token, Android signing material, or Google Play credentials.

Expo Application Services (EAS) will build and sign release artifacts. A protected `v*` tag will start the build workflow through the Expo GitHub App. A separate manual EAS workflow will publish one verified build to Google Play after an approval step.

A trusted maintainer will publish the GitHub Release from a trusted workstation. The release will contain the EAS-built Android Package (APK), its SHA-256 checksum, the source commit, and the EAS build identifiers.

## Scope

This work includes:

- secret-free GitHub Actions checks for pull requests and `main`;
- EAS development, preview, APK release, and production Android App Bundle profiles;
- an automatic EAS build workflow for protected version tags;
- a manual EAS publication workflow with approval;
- source-controlled application and Android build versions;
- release-sensitive code ownership and documented repository settings;
- a repeatable process for publishing GitHub and Google Play releases; and
- verification of the workflow configuration and one release-candidate build.

This work excludes:

- over-the-air JavaScript updates;
- automatic Google Play publication;
- automatic GitHub Release publication;
- iOS and web release pipelines;
- Fastlane or a self-hosted native build service;
- F-Droid packaging and reproducible-build certification; and
- GitHub artifact attestations for binaries compiled outside GitHub Actions.

## Trust boundaries

GitHub remains the public collaboration surface. Pull requests from forks may run CI because the workflow has read-only repository permissions and receives no release secrets. Contributors may propose changes to release configuration, but protected branch rules and code ownership require a release maintainer to approve them.

EAS is the production authority. Only the owner and specifically trusted release maintainers may access the EAS project. Ordinary GitHub collaborators will not receive EAS membership. The Expo GitHub App will be installed only for the Taatoru repository.

The release process trusts reviewed source rather than a tag name alone. Before EAS builds a release, the workflow will confirm that the tag matches the source-controlled application version and points to a commit reachable from `main`. Only release maintainers may create matching `v*` tags.

## Repository components

### Secret-free GitHub continuous integration

`.github/workflows/ci.yml` will run for pull requests and pushes to `main`. It will use Node.js from `.nvmrc`, install the locked dependency graph with `npm ci`, and run:

```text
npm run verify
npx expo-doctor
npm run prebuild:check
git diff --exit-code
```

The workflow will declare `contents: read`, cancel superseded runs for the same branch, and avoid all repository, environment, and organization secrets. Every external action will be pinned to a reviewed full commit hash.

### EAS project and build profiles

`eas.json` will use source-controlled application versioning and define four Android profiles:

- `development` creates an internal development-client APK
- `preview` creates an internal production-mode APK for device testing
- `release-apk` creates the signed APK attached to GitHub Releases
- `production` creates the signed Android App Bundle (AAB) submitted to Google Play

`app.config.ts` will contain the public EAS project identifier and owner after project linking. These identifiers are not credentials. Android signing keys, Google Play service-account credentials, and secret EAS environment variables will remain in EAS.

### Automatic release build workflow

`.eas/workflows/build-android-release.yml` will react only to pushed tags matching `v*`. It will not react to branches, pull requests, or GitHub Release publication.

The workflow will:

1. Check out the exact tagged commit.
2. Validate the tag, application version, Android version code, branch ancestry, and clean dependency lock.
3. Run the same verification gate used by GitHub Actions.
4. Build the `release-apk` artifact.
5. Build the `production` AAB artifact.
6. Report both EAS build identifiers and artifact status.

The APK and AAB jobs may run in parallel after validation. Publication remains impossible from this workflow.

EAS does not currently expose a native GitHub `release.published` trigger. The version tag is therefore the automation boundary. A maintainer may create a draft GitHub Release for the tag, but the public release will remain unpublished until the artifacts pass verification.

### Manual Google Play publication workflow

`.eas/workflows/publish-android-release.yml` will use `workflow_dispatch`. It will accept the verified production AAB build identifier as an explicit input.

The workflow will:

1. Resolve the supplied build identifier.
2. Confirm that it is a successful Android `production` AAB build for the intended version and source commit.
3. Pause at an EAS approval job.
4. Submit that exact build identifier to Google Play’s internal testing track.

The workflow will never select the latest build implicitly. A later preview or retry must not change which binary reaches Google Play.

### Manual GitHub Release publication

After testing the APK and approving the AAB, a trusted maintainer will publish the GitHub Release through the GitHub interface or GitHub CLI on a trusted workstation. No GitHub credential capable of creating Releases will be added to an EAS environment.

The release will include:

- `taatoru-vX.Y.Z.apk` from the successful `release-apk` EAS build;
- `taatoru-vX.Y.Z.apk.sha256`;
- the source commit hash;
- the EAS APK and AAB build identifiers;
- concise release notes; and
- a clear prerelease label for release candidates.

The AAB does not need to be attached because Google Play is its distribution surface. The release notes will identify the corresponding AAB build so maintainers can audit both artifacts.

### Release ownership and repository settings

`.github/CODEOWNERS` will require release-maintainer review for:

- `.eas/**`;
- `.github/workflows/**`;
- `eas.json`;
- `app.config.ts`;
- `package.json` and `package-lock.json`; and
- release documentation.

Repository settings cannot be enforced by committed files alone. `docs/releases.md` will record the required branch and tag rules:

- require pull requests for `main`;
- prevent direct and force pushes to `main`;
- require CI before merge;
- require code-owner approval for release-sensitive files; and
- restrict `v*` tag creation and deletion to release maintainers.

## Version and artifact identity

Every release will commit both version values before tagging:

- Expo `version` uses semantic versioning, such as `0.1.0`
- Android `versionCode` increases monotonically, such as `1`

The release tag adds a `v` prefix, such as `v0.1.0`. EAS will not maintain a separate remote version that contributors cannot inspect. The build records, Google Play submission, APK filename, checksum, and GitHub Release must all resolve to the same tag and commit.

Release-candidate tags may use a suffix such as `v0.1.0-rc.1`. They produce signed artifacts but may only create GitHub prereleases and must not enter a production Google Play track.

## Release lifecycle

1. Merge a reviewed pull request that updates the application version, Android version code, and release notes.
2. Confirm that secret-free GitHub CI passes on `main`.
3. Create and push the protected version tag from the reviewed `main` commit.
4. Let EAS validate the tag and build the APK and AAB.
5. Install the APK on the dedicated Android emulator and a physical device when available.
6. Verify the EAS build identifiers, commit hash, version, signing identity, and checksum.
7. Run the manual EAS publication workflow with the verified AAB build identifier.
8. Approve submission to Google Play internal testing.
9. Test the Play-delivered build.
10. Publish the GitHub Release with the verified APK and checksum.
11. Promote the Play release beyond internal testing only through the Google Play Console after the release-specific checks pass.

## Failure handling

A failed CI or validation job prevents both EAS build jobs. A failed APK or AAB build leaves publication unavailable. Maintainers may rerun the failed EAS workflow against the same immutable tag and commit; they must not move a tag to conceal a correction.

If version validation fails, fix the version in a new reviewed commit and create a new version tag. If artifact metadata does not match the intended tag, discard the artifact and rebuild. If Google Play submission fails, keep the GitHub Release unpublished until maintainers determine whether the failure affects the binary or only the store configuration.

Revoking an EAS maintainer, Expo GitHub App installation, signing credential, or Google Play service account must not require a source change. `docs/releases.md` will document credential rotation and recovery without recording secret values.

## Testing and verification

Repository-level checks will verify:

- GitHub CI contains no secret references and uses read-only permissions;
- EAS build triggers match only version tags;
- the publication workflow requires an explicit build identifier and approval;
- all EAS workflow files validate against the current EAS schema;
- every build profile resolves through EAS configuration inspection;
- Expo prebuild succeeds without tracked native-project changes;
- a mismatched tag and application version fail before building;
- a build from a commit outside `main` fails validation; and
- the existing local development build remains unchanged.

The first release-candidate exercise will:

1. Create a protected `v0.1.0-rc.1` tag from a reviewed commit.
2. Confirm that EAS starts one release workflow and produces both artifacts.
3. Install and smoke-test the APK without a valuable WaniKani account.
4. Confirm that no Google Play submission occurs automatically.
5. Run the manual publication workflow only after approval.
6. Publish a GitHub prerelease with the APK, checksum, commit, and build identifiers.

## Rollout

Implementation will proceed in four bounded stages:

1. Add secret-free GitHub CI and verify fork-safe behavior.
2. Link the EAS project, add build profiles, and validate preview builds.
3. Add and validate the tag-triggered build and manual publication workflows.
4. Configure repository protections and exercise the release-candidate lifecycle.

The production `v0.1.0` release will remain manual after these stages. Automatic store promotion, GitHub publication, and over-the-air updates require separate approved designs.

## Acceptance criteria

The release pipeline is ready when:

- pull requests run the complete secret-free CI gate;
- GitHub stores no Expo, signing, or Google Play secret;
- only a protected version tag starts an EAS release build;
- the tag, source version, commit, and artifacts agree;
- EAS produces a signed APK and production AAB;
- no build workflow can publish an artifact;
- Google Play submission requires a verified build identifier and human approval;
- a maintainer can publish a matching GitHub Release from a trusted workstation;
- release-sensitive changes require designated review; and
- the release-candidate exercise records every result and remaining limitation.
