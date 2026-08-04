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
