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
