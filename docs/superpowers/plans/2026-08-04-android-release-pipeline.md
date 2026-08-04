# Android Release Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secret-free GitHub pull-request CI, protected tag-triggered EAS Android builds, manually approved Google Play submission, and a documented GitHub Release process.

**Architecture:** GitHub Actions runs public checks without secrets. EAS Workflows validates protected version tags and builds signed APK and AAB artifacts, while a separate manually dispatched workflow submits one explicit AAB build after human review. Pure Node scripts test release metadata and committed workflow configuration before either service runs.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript, Node.js 22, npm, Jest 29, Node test runner, GitHub Actions, EAS CLI 21.5.0, EAS Build, EAS Workflows, EAS Submit, YAML 2.9.0.

## Global Constraints

- Use Node.js 22. Taatoru's `package.json` accepts `>=22.13 <23`, and `.nvmrc` selects Node 22.
- Keep generated `android/` and `ios/` projects untracked through Continuous Native Generation.
- GitHub Actions receives no Expo token, Android signing material, Google Play credential, or other release secret.
- GitHub pull-request CI uses read-only repository permissions and must remain safe for forked pull requests.
- Only protected tags matching `vX.Y.Z` or `vX.Y.Z-rc.N` may pass release validation.
- Keep Expo `version` and Android `versionCode` in `app.config.ts`; set EAS `appVersionSource` to `local` and disable automatic increments.
- EAS owns Android signing and Google Play credentials. Do not copy credentials into the repository, logs, fixtures, or GitHub settings.
- Automatic workflows may build artifacts but may not submit them or create GitHub Releases.
- Google Play submission must use one explicit EAS build ID and pause for human approval.
- Keep over-the-air updates, iOS releases, web releases, F-Droid, automatic GitHub publication, and production-track promotion out of scope.
- Pin every external GitHub Action to a reviewed full commit SHA.
- Preserve unrelated working-tree changes and stage each task with an explicit file allowlist.
- Ask for confirmation immediately before creating an EAS project, installing the Expo GitHub App, changing GitHub rulesets, pushing a release tag, consuming an EAS build, submitting to Google Play, or publishing a GitHub Release.

---

## Planned file structure

- `.github/workflows/ci.yml`: secret-free checks for pull requests targeting `main` and pushes to `main`
- `.github/CODEOWNERS`: ownership for CI, EAS, dependency, version, and release-documentation files
- `.eas/workflows/build-android-release.yml`: tag validation plus parallel APK and AAB builds; no publication job
- `.eas/workflows/publish-android-release.yml`: manual review, approval, and exact-build submission to Google Play internal testing
- `eas.json`: source-controlled EAS CLI, Android build-profile, and submit-profile configuration
- `scripts/release/validate-release-ref.mjs`: deterministic tag, version, event, commit, and ancestry validation
- `scripts/release/validate-release-ref.test.mjs`: pure Node tests for release validation
- `scripts/release/workflow-config.test.mjs`: structural tests for GitHub CI, EAS workflows, EAS profiles, and CODEOWNERS
- `docs/releases.md`: maintainer release runbook and credential-recovery boundaries
- `docs/verification/android-release-pipeline.md`: hosted setup and release-candidate evidence without secrets
- `app.config.ts`: concrete EAS owner and project ID added by `eas init`
- `package.json`: release-validation and configuration-test scripts
- `package-lock.json`: direct `yaml@2.9.0` development dependency
- `README.md`: link to the release runbook

### Task 1: Add secret-free pull-request CI

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `scripts/release/workflow-config.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `.nvmrc`, `npm run verify`, `npm run prebuild:check`
- Produces: `npm run test:release-config`; GitHub check named `Taatoru CI`

- [ ] **Step 1: Confirm Node 22 and install the direct YAML test dependency**

Run:

```bash
node --version
npm install --save-dev --save-exact yaml@2.9.0
```

Expected: Node reports `v22.x`; `package.json` and `package-lock.json` add `yaml` without changing application dependencies.

- [ ] **Step 2: Add the release-configuration test script**

Add these scripts to `package.json` and append the configuration test to `verify`:

```json
{
  "scripts": {
    "test:release-config": "node --test scripts/release/*.test.mjs",
    "verify": "npm run lint && npm run typecheck && npm test -- --runInBand && npm run test:release-config"
  }
}
```

Preserve every existing script not shown above.

- [ ] **Step 3: Write the failing GitHub CI configuration test**

Create `scripts/release/workflow-config.test.mjs` with helpers that read repository-relative files and parse YAML:

```javascript
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parse } from 'yaml';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const readYaml = (path) => parse(read(path));

test('GitHub CI is secret-free and targets main', () => {
  const workflow = readYaml('.github/workflows/ci.yml');
  assert.deepEqual(workflow.on.pull_request.branches, ['main']);
  assert.deepEqual(workflow.on.push.branches, ['main']);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.equal(workflow.jobs.verify.name, 'Taatoru CI');
  assert.equal(JSON.stringify(workflow).includes('secrets.'), false);

  const commands = workflow.jobs.verify.steps.flatMap((step) => step.run ?? []);
  assert.deepEqual(commands, [
    'npm ci',
    'npm run verify',
    'npx --yes expo-doctor@1.20.1',
    'npm run prebuild:check',
    'git diff --exit-code',
  ]);
});
```

- [ ] **Step 4: Run the test to confirm the workflow is missing**

Run:

```bash
npm run test:release-config
```

Expected: FAIL with `ENOENT` for `.github/workflows/ci.yml`.

- [ ] **Step 5: Add the GitHub Actions workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ci-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    name: Taatoru CI
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    steps:
      - name: Check out source
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - name: Set up Node.js
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version-file: .nvmrc
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Run lint, types, and tests
        run: npm run verify
      - name: Check Expo dependencies
        run: npx --yes expo-doctor@1.20.1
      - name: Generate native projects
        run: npm run prebuild:check
      - name: Confirm tracked files are unchanged
        run: git diff --exit-code
```

- [ ] **Step 6: Run the local CI-equivalent gate**

Run from a clean implementation worktree so `expo prebuild --clean` cannot overwrite another developer's generated native directories:

```bash
npm ci
npm run verify
npx --yes expo-doctor@1.20.1
npm run prebuild:check
git diff --exit-code
```

Expected: every command exits `0`; the generated `android/` and `ios/` directories remain ignored.

- [ ] **Step 7: Commit only the CI files**

```bash
git add .github/workflows/ci.yml scripts/release/workflow-config.test.mjs package.json package-lock.json
git diff --cached --name-status
git commit -m "ci: add secret-free pull request checks"
```

### Task 2: Add tested release-tag validation

**Files:**
- Create: `scripts/release/validate-release-ref.mjs`
- Create: `scripts/release/validate-release-ref.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: EAS `github.event_name`, `github.ref_type`, `github.ref_name`, and `github.sha`; resolved Expo public config; `origin/main`
- Produces: `validateReleaseMetadata(input): { version: string, prerelease: boolean }`; `npm run validate:release -- event_name ref_type tag sha`

- [ ] **Step 1: Write pure failing validation tests**

Create `scripts/release/validate-release-ref.test.mjs`:

```javascript
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateReleaseMetadata } from './validate-release-ref.mjs';

const valid = {
  eventName: 'push',
  refType: 'tag',
  tag: 'v0.1.0',
  expectedCommitSha: 'abc123',
  headCommitSha: 'abc123',
  appVersion: '0.1.0',
  versionCode: 1,
  isOnMain: true,
};

test('accepts stable and release-candidate tags for the app version', () => {
  assert.deepEqual(validateReleaseMetadata(valid), {
    version: '0.1.0',
    prerelease: false,
  });
  assert.deepEqual(validateReleaseMetadata({ ...valid, tag: 'v0.1.0-rc.1' }), {
    version: '0.1.0',
    prerelease: true,
  });
});

for (const [name, change, message] of [
  ['manual event', { eventName: 'workflow_dispatch' }, /tag push/],
  ['branch ref', { refType: 'branch' }, /tag push/],
  ['malformed tag', { tag: 'release-0.1.0' }, /version tag/],
  ['version mismatch', { appVersion: '0.2.0' }, /does not match/],
  ['invalid version code', { versionCode: 0 }, /versionCode/],
  ['commit mismatch', { headCommitSha: 'def456' }, /commit/],
  ['commit outside main', { isOnMain: false }, /main/],
]) {
  test(`rejects ${name}`, () => {
    assert.throws(() => validateReleaseMetadata({ ...valid, ...change }), message);
  });
}
```

- [ ] **Step 2: Run the focused test and confirm the module is absent**

```bash
node --test scripts/release/validate-release-ref.test.mjs
```

Expected: FAIL because `validate-release-ref.mjs` does not exist.

- [ ] **Step 3: Implement the pure rule and command-line adapter**

Create `scripts/release/validate-release-ref.mjs`. The pure export must:

```javascript
const VERSION_TAG = /^v(\d+\.\d+\.\d+)(?:-rc\.(\d+))?$/;

export function validateReleaseMetadata(input) {
  if (input.eventName !== 'push' || input.refType !== 'tag') {
    throw new Error('Release builds require a GitHub tag push.');
  }
  const match = VERSION_TAG.exec(input.tag);
  if (!match) {
    throw new Error(`Invalid version tag: ${input.tag}`);
  }
  if (match[1] !== input.appVersion) {
    throw new Error(`Tag ${input.tag} does not match app version ${input.appVersion}.`);
  }
  if (!Number.isInteger(input.versionCode) || input.versionCode < 1) {
    throw new Error('android.versionCode must be a positive integer.');
  }
  if (input.expectedCommitSha !== input.headCommitSha) {
    throw new Error('The checked-out commit does not match the tag event commit.');
  }
  if (!input.isOnMain) {
    throw new Error('The tagged commit is not reachable from origin/main.');
  }
  return { version: match[1], prerelease: match[2] !== undefined };
}
```

The command-line adapter must:

1. require the four arguments `event_name`, `ref_type`, `tag`, and GitHub SHA;
2. read `version` and `android.versionCode` from `npx expo config --type public --json`;
3. resolve both `HEAD` and the GitHub SHA to commit objects with `git rev-parse <ref>^{commit}` so annotated tags work;
4. call `git merge-base --is-ancestor HEAD origin/main`;
5. pass those values to `validateReleaseMetadata`; and
6. print only the validated tag, version, version code, and prerelease state.

Use `execFileSync` and `spawnSync` with argument arrays. Do not construct shell command strings or log environment variables.

- [ ] **Step 4: Add the command-line script**

Add to `package.json`:

```json
{
  "scripts": {
    "validate:release": "node scripts/release/validate-release-ref.mjs"
  }
}
```

- [ ] **Step 5: Run focused and complete tests**

```bash
npm run test:release-config
npm run verify
```

Expected: the new stable, prerelease, and seven rejection cases pass; the existing Jest suite remains green.

- [ ] **Step 6: Exercise the CLI's event guard**

Run one controlled rejection from the implementation branch:

```bash
npm run validate:release -- workflow_dispatch tag v0.1.0 "$(git rev-parse HEAD)"
```

Expected: FAIL with `Release builds require a GitHub tag push.`

Do not weaken the `origin/main` ancestry rule merely to make a feature-branch invocation pass. Task 9 performs the successful end-to-end CLI check after the implementation has merged to `main`.

- [ ] **Step 7: Commit only the validator files**

```bash
git add scripts/release/validate-release-ref.mjs scripts/release/validate-release-ref.test.mjs package.json
git diff --cached --name-status
git commit -m "test: validate Android release tags"
```

### Task 3: Configure source-controlled EAS build profiles

**Files:**
- Create: `eas.json`
- Modify: `scripts/release/workflow-config.test.mjs`

**Interfaces:**
- Consumes: Expo app config with package `app.taatoru`, Node 22, remote EAS credentials
- Produces: EAS profiles `development`, `preview`, `release-apk`, and `production`; submit profile `production`

- [ ] **Step 1: Add a failing EAS profile test**

Extend `scripts/release/workflow-config.test.mjs`:

```javascript
test('EAS profiles keep versions local and publication internal', () => {
  const eas = JSON.parse(read('eas.json'));
  assert.equal(eas.cli.version, '21.5.0');
  assert.equal(eas.cli.appVersionSource, 'local');
  assert.equal(eas.cli.requireCommit, true);
  assert.equal(eas.build.development.developmentClient, true);
  assert.equal(eas.build.preview.android.buildType, 'apk');
  assert.equal(eas.build['release-apk'].android.buildType, 'apk');
  assert.equal(eas.build.production.android.buildType, 'app-bundle');
  assert.equal(eas.build.production.autoIncrement, false);
  assert.equal(eas.submit.production.android.track, 'internal');
  assert.equal(eas.submit.production.android.releaseStatus, 'completed');
});
```

- [ ] **Step 2: Run the test and confirm `eas.json` is missing**

```bash
npm run test:release-config
```

Expected: FAIL with `ENOENT` for `eas.json`.

- [ ] **Step 3: Add exact Android profiles**

Create `eas.json`:

```json
{
  "cli": {
    "version": "21.5.0",
    "appVersionSource": "local",
    "requireCommit": true
  },
  "build": {
    "development": {
      "node": "22",
      "developmentClient": true,
      "distribution": "internal",
      "environment": "development"
    },
    "preview": {
      "node": "22",
      "distribution": "internal",
      "environment": "preview",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "node": "22",
      "distribution": "store",
      "environment": "production",
      "autoIncrement": false,
      "android": {
        "buildType": "app-bundle",
        "credentialsSource": "remote"
      }
    },
    "release-apk": {
      "extends": "production",
      "distribution": "internal",
      "android": {
        "buildType": "apk",
        "credentialsSource": "remote"
      }
    }
  },
  "submit": {
    "production": {
      "android": {
        "track": "internal",
        "releaseStatus": "completed"
      }
    }
  }
}
```

Do not add EAS Update channels or automatic version increments.

- [ ] **Step 4: Run profile tests and inspect resolved Expo config**

```bash
npm run test:release-config
npx expo config --type public --json
```

Expected: tests pass; Expo config still reports `app.taatoru`, version `0.1.0`, and Android version code `1`.

- [ ] **Step 5: Commit only EAS profile configuration**

```bash
git add eas.json scripts/release/workflow-config.test.mjs
git diff --cached --name-status
git commit -m "chore: configure Android EAS profiles"
```

### Task 4: Add automatic tag-triggered EAS builds

**Files:**
- Create: `.eas/workflows/build-android-release.yml`
- Modify: `scripts/release/workflow-config.test.mjs`

**Interfaces:**
- Consumes: `npm run validate:release -- event_name ref_type tag sha`; EAS build profiles `release-apk` and `production`
- Produces: EAS jobs `build_release_apk` and `build_production_aab` with separate `build_id` outputs

- [ ] **Step 1: Add a failing build-workflow structure test**

Extend `scripts/release/workflow-config.test.mjs`:

```javascript
test('EAS release builds require a version-tag push and cannot publish', () => {
  const workflow = readYaml('.eas/workflows/build-android-release.yml');
  assert.deepEqual(workflow.on.push.tags, ['v*']);
  assert.equal(workflow.on.push.branches, undefined);
  assert.equal(workflow.jobs.validate.steps.some((step) =>
    step.run?.includes('npm run validate:release --')), true);
  assert.deepEqual(workflow.jobs.build_release_apk.needs, ['validate']);
  assert.equal(workflow.jobs.build_release_apk.params.profile, 'release-apk');
  assert.deepEqual(workflow.jobs.build_production_aab.needs, ['validate']);
  assert.equal(workflow.jobs.build_production_aab.params.profile, 'production');
  assert.equal(Object.values(workflow.jobs).some((job) => job.type === 'submit'), false);
});
```

- [ ] **Step 2: Run the focused test and confirm the workflow is missing**

```bash
npm run test:release-config
```

Expected: FAIL with `ENOENT` for `.eas/workflows/build-android-release.yml`.

- [ ] **Step 3: Add the build-only EAS workflow**

Create `.eas/workflows/build-android-release.yml`:

```yaml
name: Build Android release

on:
  push:
    tags: ['v*']

defaults:
  tools:
    node: '22'

concurrency:
  cancel_in_progress: true
  group: ${{ workflow.filename }}-${{ github.ref }}

jobs:
  validate:
    name: Validate release source
    steps:
      - uses: eas/checkout
      - name: Fetch main history
        run: |
          if [ "$(git rev-parse --is-shallow-repository)" = "true" ]; then
            git fetch --unshallow origin
          fi
          git fetch origin main:refs/remotes/origin/main
      - uses: eas/install_node_modules
      - name: Validate event, tag, version, and commit
        run: npm run validate:release -- "${{ github.event_name }}" "${{ github.ref_type }}" "${{ github.ref_name }}" "${{ github.sha }}"
      - name: Run lint, types, and tests
        run: npm run verify
      - name: Check Expo dependencies
        run: npx --yes expo-doctor@1.20.1
      - name: Generate native projects
        run: npm run prebuild:check
      - name: Confirm tracked files are unchanged
        run: git diff --exit-code

  build_release_apk:
    name: Build signed release APK
    needs: [validate]
    type: build
    params:
      platform: android
      profile: release-apk
      message: Taatoru ${{ github.ref_name }} APK from ${{ github.sha }}

  build_production_aab:
    name: Build production AAB
    needs: [validate]
    type: build
    params:
      platform: android
      profile: production
      message: Taatoru ${{ github.ref_name }} AAB from ${{ github.sha }}
```

The validation job rejects manual workflow runs because manual runs expose `workflow_dispatch`, not a tag `push`.

- [ ] **Step 4: Run structural and official schema validation**

```bash
npm run test:release-config
npx --yes eas-cli@21.5.0 workflow:validate .eas/workflows/build-android-release.yml --non-interactive
```

Expected: both commands pass against the current EAS workflow schema.

- [ ] **Step 5: Confirm the workflow contains no publication path**

```bash
rg -n "type: submit|github-release|EXPO_TOKEN|serviceAccount" .eas/workflows/build-android-release.yml
```

Expected: no matches.

- [ ] **Step 6: Commit only the automatic build workflow**

```bash
git add .eas/workflows/build-android-release.yml scripts/release/workflow-config.test.mjs
git diff --cached --name-status
git commit -m "ci: build Android releases from version tags"
```

### Task 5: Add manually approved Google Play submission

**Files:**
- Create: `.eas/workflows/publish-android-release.yml`
- Modify: `scripts/release/workflow-config.test.mjs`

**Interfaces:**
- Consumes: explicit inputs `build_id`, `release_tag`, and `commit_sha`; EAS submit profile `production`
- Produces: approval job `approve_submission`; exact-build submit job `submit_internal`

- [ ] **Step 1: Add a failing publication-workflow test**

Extend `scripts/release/workflow-config.test.mjs`:

```javascript
test('Google Play submission is manual, reviewed, and exact', () => {
  const workflow = readYaml('.eas/workflows/publish-android-release.yml');
  const inputs = workflow.on.workflow_dispatch.inputs;
  assert.equal(inputs.build_id.required, true);
  assert.equal(inputs.release_tag.required, true);
  assert.equal(inputs.commit_sha.required, true);
  assert.equal(workflow.on.push, undefined);
  assert.equal(workflow.jobs.approve_submission.type, 'require-approval');
  assert.deepEqual(workflow.jobs.submit_internal.needs, ['approve_submission']);
  assert.equal(workflow.jobs.submit_internal.params.build_id, '${{ inputs.build_id }}');
  assert.equal(workflow.jobs.submit_internal.params.profile, 'production');
  assert.equal(JSON.stringify(workflow).includes('latest'), false);
});
```

- [ ] **Step 2: Run the focused test and confirm the workflow is missing**

```bash
npm run test:release-config
```

Expected: FAIL with `ENOENT` for `.eas/workflows/publish-android-release.yml`.

- [ ] **Step 3: Add the manual EAS publication workflow**

Create `.eas/workflows/publish-android-release.yml`:

```yaml
name: Publish Android release

on:
  workflow_dispatch:
    inputs:
      build_id:
        type: string
        required: true
        description: Verified production AAB build ID
      release_tag:
        type: string
        required: true
        description: Protected version tag for the build
      commit_sha:
        type: string
        required: true
        description: Reviewed source commit for the build

jobs:
  review_build:
    name: Review production build metadata
    type: doc
    params:
      md: |
        Confirm build `${{ inputs.build_id }}` in the EAS dashboard before approval.

        It must be an Android `production` store build for package `app.taatoru`, tag `${{ inputs.release_tag }}`, and commit `${{ inputs.commit_sha }}`. Reject the approval if any field differs.

  approve_submission:
    name: Submit verified AAB to Google Play internal testing?
    needs: [review_build]
    type: require-approval

  submit_internal:
    name: Submit exact AAB to internal testing
    needs: [approve_submission]
    type: submit
    params:
      build_id: ${{ inputs.build_id }}
      profile: production
```

The review job documents the metadata check. The EAS submit job resolves the exact build ID and rejects incompatible artifacts; it never selects the latest build.

- [ ] **Step 4: Run structural and official schema validation**

```bash
npm run test:release-config
npx --yes eas-cli@21.5.0 workflow:validate .eas/workflows/publish-android-release.yml --non-interactive
```

Expected: both commands pass.

- [ ] **Step 5: Confirm the workflow has no automatic trigger or implicit build selection**

```bash
rg -n "push:|pull_request:|--latest|latest build|EXPO_TOKEN" .eas/workflows/publish-android-release.yml
```

Expected: no matches.

- [ ] **Step 6: Commit only the manual publication workflow**

```bash
git add .eas/workflows/publish-android-release.yml scripts/release/workflow-config.test.mjs
git diff --cached --name-status
git commit -m "ci: require approval for Android publication"
```

### Task 6: Document release ownership and operations

**Files:**
- Create: `.github/CODEOWNERS`
- Create: `docs/releases.md`
- Modify: `README.md`
- Modify: `scripts/release/workflow-config.test.mjs`

**Interfaces:**
- Consumes: GitHub owner `@zozi0406`; both EAS workflows and build profiles
- Produces: code-owner review paths; maintainer commands for tags, EAS inspection, checksums, Google Play submission, and GitHub prereleases

- [ ] **Step 1: Add failing ownership assertions**

Extend `scripts/release/workflow-config.test.mjs`:

```javascript
test('release-sensitive files require owner review', () => {
  const codeowners = read('.github/CODEOWNERS');
  for (const path of [
    '/.github/',
    '/.eas/',
    '/eas.json',
    '/app.config.ts',
    '/package.json',
    '/package-lock.json',
    '/docs/releases.md',
  ]) {
    assert.match(codeowners, new RegExp(`^${path.replaceAll('.', '\\.')}\\s+@zozi0406$`, 'm'));
  }
});
```

- [ ] **Step 2: Run the test and confirm CODEOWNERS is missing**

```bash
npm run test:release-config
```

Expected: FAIL with `ENOENT` for `.github/CODEOWNERS`.

- [ ] **Step 3: Add exact release ownership**

Create `.github/CODEOWNERS`:

```text
/.github/ @zozi0406
/.eas/ @zozi0406
/eas.json @zozi0406
/app.config.ts @zozi0406
/package.json @zozi0406
/package-lock.json @zozi0406
/docs/releases.md @zozi0406
/docs/verification/ @zozi0406
```

The first line protects `CODEOWNERS` itself.

- [ ] **Step 4: Write the maintainer runbook**

Create `docs/releases.md` with these concrete sections:

1. **Trust model:** GitHub is secret-free; EAS holds signing and Play credentials; only trusted EAS maintainers release.
2. **Required hosted settings:** `main` ruleset, `v*` tag ruleset, Expo GitHub App scope, EAS membership, and two-factor authentication.
3. **Prepare a release:** update `version`, increment `versionCode`, update notes, run `npm run verify`, merge through `main` CI.
4. **Start a build:** create an annotated protected tag with `git tag -a`, inspect it with `git show`, then push only that tag.
5. **Verify artifacts:** compare EAS build profile, package, app version, version code, commit, and signing identity; install the APK on an emulator and device.
6. **Submit to Play:** run `eas workflow:run` with `build_id`, `release_tag`, and `commit_sha`, inspect the approval page, then approve or reject.
7. **Publish GitHub Release:** download the APK, rename it `taatoru-vX.Y.Z.apk`, produce a SHA-256 file, and publish manually with the build IDs and commit in the notes.
8. **Recover safely:** rerun against the immutable tag; never move a published tag; revoke EAS members, GitHub App access, or credentials in their owning service.

Use `npx --yes eas-cli@21.5.0` in every EAS command. Use shell variables named `release_tag`, `release_commit`, `apk_build_id`, and `aab_build_id` instead of generic token placeholders. State that submitting a release candidate consumes its Android `versionCode`, so the production build must increment it.

- [ ] **Step 5: Link the runbook from the README**

Add after the Development section in `README.md`:

```markdown
## Releases

Android builds use secret-free GitHub checks and restricted EAS release workflows. Maintainers should follow [the Android release runbook](docs/releases.md).
```

- [ ] **Step 6: Run documentation-adjacent verification**

```bash
npm run test:release-config
npm run verify
git diff --check
```

Expected: all tests pass; no whitespace errors.

- [ ] **Step 7: Commit only ownership and release documentation**

```bash
git add .github/CODEOWNERS docs/releases.md README.md scripts/release/workflow-config.test.mjs
git diff --cached --name-status
git commit -m "docs: add Android release runbook"
```

### Task 7: Link Taatoru to its restricted EAS project

**Files:**
- Modify: `app.config.ts`

**Interfaces:**
- Consumes: a trusted maintainer's Expo account and explicit approval to create or link the EAS project
- Produces: concrete `owner` and `extra.eas.projectId` values; remote Android signing credentials

- [ ] **Step 1: Stop for the external-state checkpoint**

Show the user the clean diff and ask permission to create or link the EAS project. Do not continue if the user has not chosen the owning Expo account.

- [ ] **Step 2: Confirm trusted Expo identity**

```bash
npx --yes eas-cli@21.5.0 whoami
```

If no account is active, run `npx --yes eas-cli@21.5.0 login` interactively. Never paste credentials into source, shell history, or chat.

- [ ] **Step 3: Create or link the EAS project**

```bash
npx --yes eas-cli@21.5.0 init
npx --yes eas-cli@21.5.0 project:info
```

Choose the intended Expo owner. Review the generated `app.config.ts` change. It must add a concrete project UUID under `extra.eas.projectId` without replacing `extra.router`. Add the concrete `owner` returned by `project:info` to the top-level Expo config if `eas init` does not add it.

- [ ] **Step 4: Validate every Android profile against the linked project**

```bash
npx --yes eas-cli@21.5.0 config --platform android --profile development --non-interactive
npx --yes eas-cli@21.5.0 config --platform android --profile preview --non-interactive
npx --yes eas-cli@21.5.0 config --platform android --profile release-apk --non-interactive
npx --yes eas-cli@21.5.0 config --platform android --profile production --non-interactive
```

Expected: all four commands resolve `app.taatoru`, Node 22, local versions, and their intended APK or AAB distribution.

- [ ] **Step 5: Configure remote Android signing credentials**

Ask for confirmation before this credential mutation, then run:

```bash
npx --yes eas-cli@21.5.0 credentials:configure-build --platform android --profile production
```

Use EAS-managed remote credentials. Record only the non-secret credential identifier or fingerprint in verification notes.

- [ ] **Step 6: Re-run repository verification**

```bash
npm run verify
npx --yes expo-doctor@1.20.1
git diff --check
```

- [ ] **Step 7: Commit only the public EAS link**

```bash
git add app.config.ts
git diff --cached --name-status
git diff --cached
git commit -m "chore: link Taatoru to EAS"
```

### Task 8: Configure hosted protections and integrations

**Files:**
- Create: `docs/verification/android-release-pipeline.md`

**Interfaces:**
- Consumes: pushed CI workflow, linked EAS project, repository admin access, Play Console app, trusted service-account credential
- Produces: enforced `main` and `v*` rulesets; Taatoru-only Expo GitHub App access; EAS Submit credential; setup evidence

- [ ] **Step 1: Stop for hosted-service approval**

Ask permission before pushing the implementation commits, installing the Expo GitHub App, changing GitHub rulesets, or uploading the Google Play service-account key to EAS.

- [ ] **Step 2: Push the reviewed implementation and verify public CI**

Push the implementation through a pull request targeting `main`. Confirm that `Taatoru CI` runs without secrets and passes from the pull-request commit. Do not configure it as required until one successful check exists.

- [ ] **Step 3: Configure the `main` ruleset**

In GitHub repository settings, create an active branch ruleset targeting `main` with:

- deletion and force-push blocking;
- pull requests required;
- one approval required;
- stale approvals dismissed after new commits;
- code-owner review required; and
- required status check `Taatoru CI`.

Do not grant general collaborator bypass. Keep repository-owner emergency bypass only if GitHub requires one.

- [ ] **Step 4: Configure the `v*` tag ruleset**

Create an active tag ruleset targeting `v*`. Restrict tag creation, update, and deletion to the repository owner or designated release maintainers. Do not permit ordinary write collaborators to bypass it.

- [ ] **Step 5: Link the Expo GitHub App narrowly**

From the EAS project GitHub settings, install or configure the Expo GitHub App for `zozi0406/taatoru` only. Do not grant all-repository access. Confirm that EAS can see `.eas/workflows/build-android-release.yml` on `main`.

- [ ] **Step 6: Configure Google Play submission authority**

Create the `app.taatoru` Play Console app if it does not exist. Create a service account limited to the permissions required for releases of this app, then upload that credential directly to EAS. Do not copy it into the Taatoru workspace. Keep EAS membership limited to release maintainers.

- [ ] **Step 7: Validate both EAS workflow files against the linked project**

```bash
npx --yes eas-cli@21.5.0 workflow:validate .eas/workflows/build-android-release.yml --non-interactive
npx --yes eas-cli@21.5.0 workflow:validate .eas/workflows/publish-android-release.yml --non-interactive
```

- [ ] **Step 8: Record non-secret setup evidence**

Create `docs/verification/android-release-pipeline.md` and record:

- date and source commit;
- GitHub CI run URL and conclusion;
- names and enforcement state of the `main` and `v*` rulesets;
- EAS project URL or public project ID;
- EAS workflow validation results;
- signing credential fingerprint, not the key;
- whether the Play service account is configured; and
- any setup step that remains blocked.

- [ ] **Step 9: Commit only the setup evidence**

```bash
git add docs/verification/android-release-pipeline.md
git diff --cached --name-status
git commit -m "docs: record Android release setup"
```

### Task 9: Exercise the release-candidate lifecycle

**Files:**
- Modify: `docs/verification/android-release-pipeline.md`

**Interfaces:**
- Consumes: protected tag `v0.1.0-rc.1`, EAS build and publish workflows, configured Android signing and Play internal testing
- Produces: verified signed APK, production AAB, internal-track submission, GitHub prerelease, and recorded evidence

- [ ] **Step 1: Run the complete clean preflight**

```bash
npm ci
npm run verify
npx --yes expo-doctor@1.20.1
npm run prebuild:check
git diff --exit-code
git status --short
```

Expected: all commands pass and the working tree is clean.

- [ ] **Step 2: Confirm the release-candidate identity**

```bash
npx expo config --type public --json
git rev-parse HEAD
git merge-base --is-ancestor HEAD origin/main
npm run validate:release -- push tag v0.1.0-rc.1 "$(git rev-parse HEAD)"
```

Expected: app version `0.1.0`, positive Android version code, current commit on `main`, and successful release-tag validation.

- [ ] **Step 3: Stop before the irreversible external trigger**

Show the exact commit and proposed `v0.1.0-rc.1` tag. Ask permission before creating and pushing the protected tag because it consumes EAS build capacity and starts signed builds.

- [ ] **Step 4: Create and push the annotated release-candidate tag**

```bash
git tag -a v0.1.0-rc.1 -m "Taatoru v0.1.0-rc.1"
git show --no-patch v0.1.0-rc.1
git push origin v0.1.0-rc.1
```

Expected: the tag ruleset accepts the release maintainer and EAS starts exactly one `Build Android release` workflow.

- [ ] **Step 5: Follow the EAS workflow to completion**

```bash
npx --yes eas-cli@21.5.0 workflow:runs --workflow build-android-release.yml --limit 5 --json
npx --yes eas-cli@21.5.0 workflow:view "$workflow_run_id" --json --non-interactive
```

Set `workflow_run_id` to the matching tag-triggered run returned by the first command. Use the detailed job output to record the `release-apk` and `production` build IDs. Confirm validation passed before both builds and that no submit job exists.

- [ ] **Step 6: Verify build metadata and artifacts**

For each captured build ID, run:

```bash
npx --yes eas-cli@21.5.0 build:view "$apk_build_id" --json
npx --yes eas-cli@21.5.0 build:view "$aab_build_id" --json
```

Confirm platform `android`, package `app.taatoru`, version `0.1.0`, the expected version code, the tagged commit, `release-apk` for the APK, and `production` for the AAB.

- [ ] **Step 7: Install and smoke-test the APK**

Download the APK from its EAS build page to `/tmp/taatoru-v0.1.0-rc.1.apk`, then run:

```bash
shasum -a 256 /tmp/taatoru-v0.1.0-rc.1.apk > /tmp/taatoru-v0.1.0-rc.1.apk.sha256
shasum -a 256 -c /tmp/taatoru-v0.1.0-rc.1.apk.sha256
adb install -r /tmp/taatoru-v0.1.0-rc.1.apk
```

Check cold launch, offline launch, API-token onboarding without entering a valuable account token, dark theme, large text, notification permission behavior, and absence of development-client UI.

- [ ] **Step 8: Stop before Google Play submission**

Show the AAB build ID, tag, commit, version, version code, and smoke-test result. Ask permission before starting the manual publication workflow.

- [ ] **Step 9: Run and approve exact-build internal submission**

```bash
npx --yes eas-cli@21.5.0 workflow:run .eas/workflows/publish-android-release.yml --ref v0.1.0-rc.1 -F "build_id=$aab_build_id" -F "release_tag=v0.1.0-rc.1" -F "commit_sha=$(git rev-parse v0.1.0-rc.1^{commit})" --wait
```

Inspect the EAS approval page and approve only after its metadata matches. Confirm the submission reaches Google Play internal testing. Record that this consumes the current Android `versionCode`; increment it before the production `v0.1.0` AAB.

- [ ] **Step 10: Stop before public GitHub prerelease publication**

Prepare `taatoru-v0.1.0-rc.1.apk`, its `.sha256` file, release notes, both EAS build IDs, and the source commit. Ask the maintainer to publish the GitHub prerelease or explicitly authorize the agent to run the GitHub CLI command.

- [ ] **Step 11: Publish the verified GitHub prerelease manually**

From a trusted maintainer machine:

```bash
gh release create v0.1.0-rc.1 /tmp/taatoru-v0.1.0-rc.1.apk /tmp/taatoru-v0.1.0-rc.1.apk.sha256 --verify-tag --prerelease --title "Taatoru v0.1.0-rc.1" --notes-file /tmp/taatoru-v0.1.0-rc.1-notes.md
```

Expected: the prerelease points to the protected tag and contains only the verified APK, checksum, and release notes.

- [ ] **Step 12: Complete and commit verification evidence**

Update `docs/verification/android-release-pipeline.md` with every command actually run, exit result, GitHub and EAS run URLs, build and submission IDs, checksum, emulator/device results, GitHub prerelease URL, unavailable checks, and remaining risks. Do not include tokens, service-account data, keystore data, or account content.

```bash
git add docs/verification/android-release-pipeline.md
git diff --cached --name-status
git commit -m "docs: verify Android release candidate"
```

## Final verification

After Task 9, run the repository gate once more from a clean worktree:

```bash
npm ci
npm run verify
npx --yes expo-doctor@1.20.1
npm run prebuild:check
npx --yes eas-cli@21.5.0 workflow:validate .eas/workflows/build-android-release.yml --non-interactive
npx --yes eas-cli@21.5.0 workflow:validate .eas/workflows/publish-android-release.yml --non-interactive
git diff --check
git status --short
```

Confirm the hosted evidence separately:

- the latest pull request to `main` has a passing `Taatoru CI` check;
- the `main` and `v*` rulesets are active;
- GitHub contains no Expo, signing, or Google Play secret;
- the EAS build workflow has no submit job;
- the publish workflow used the recorded AAB build ID;
- Google Play received only the approved internal-test submission; and
- the GitHub prerelease APK checksum matches the local verified artifact.
