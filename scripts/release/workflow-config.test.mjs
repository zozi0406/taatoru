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

  const headerStep = workflow.jobs.verify.steps.find(
    (step) => step.name === 'Use installed Node headers',
  );
  assert.equal(
    headerStep?.run.trim(),
    `node -e "const path = require('node:path'); process.stdout.write('npm_config_nodedir=' + path.dirname(path.dirname(process.execPath)) + '\\n')" >> "$GITHUB_ENV"`,
  );

  const commands = workflow.jobs.verify.steps
    .filter((step) => step.name !== 'Use installed Node headers')
    .flatMap((step) => step.run ?? []);
  assert.deepEqual(commands, [
    'npm ci',
    'npm run verify',
    'npx --yes expo-doctor@1.20.1',
    'npm run prebuild:check',
    'git diff --exit-code',
  ]);
});

test('EAS profiles keep versions local and publication internal', () => {
  const eas = JSON.parse(read('eas.json'));
  assert.equal(eas.cli.version, '21.5.0');
  assert.equal(eas.cli.appVersionSource, 'local');
  assert.equal(eas.cli.requireCommit, true);
  assert.deepEqual(
    [eas.build.development.node, eas.build.preview.node, eas.build.production.node],
    ['22.23.2', '22.23.2', '22.23.2'],
  );
  assert.equal(eas.build.development.developmentClient, true);
  assert.equal(eas.build.preview.android.buildType, 'apk');
  assert.equal(eas.build['release-apk'].android.buildType, 'apk');
  assert.equal(eas.build.production.android.buildType, 'app-bundle');
  assert.equal(eas.build.production.autoIncrement, false);
  assert.equal(eas.submit.production.android.track, 'internal');
  assert.equal(eas.submit.production.android.releaseStatus, 'completed');
});

test('EAS release builds require a version-tag push and cannot publish', () => {
  const workflow = readYaml('.eas/workflows/build-android-release.yml');
  assert.deepEqual(workflow.on.push.tags, ['v*']);
  assert.equal(workflow.on.push.branches, undefined);
  assert.equal(
    workflow.jobs.validate.steps.some((step) =>
      step.run?.includes('npm run validate:release --'),
    ),
    true,
  );
  assert.deepEqual(workflow.jobs.build_release_apk.needs, ['validate']);
  assert.equal(workflow.jobs.build_release_apk.params.profile, 'release-apk');
  assert.deepEqual(workflow.jobs.build_production_aab.needs, ['validate']);
  assert.equal(workflow.jobs.build_production_aab.params.profile, 'production');
  assert.equal(Object.values(workflow.jobs).some((job) => job.type === 'submit'), false);
});

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
