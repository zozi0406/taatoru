const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../../metro.config.cjs');
test('environment inputs are excluded but real app routes remain bundleable', () => {
  assert.ok(config.resolver.blockList.some(pattern => pattern.test('/project/.env.test.local')));
  assert.ok(!config.resolver.blockList.some(pattern => pattern.test('/project/app/index.tsx')));
});
