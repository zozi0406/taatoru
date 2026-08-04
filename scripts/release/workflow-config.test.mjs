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
