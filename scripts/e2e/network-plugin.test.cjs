const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { patchApplication, patchGradle, copySources } = require('../../plugins/with-non-replaying-api-writes.cjs');

test('normal and isolated application install the policy once before React Native starts', () => {
  for (const name of ['app.taatoru', 'app.taatoru.e2e']) {
    const source = `package ${name}\nclass MainApplication {\n override fun onCreate() {\n super.onCreate()\n loadReactNative(this)\n ApplicationLifecycleDispatcher.onApplicationCreate(this)\n }\n}`;
    const once = patchApplication(source);
    assert.equal(patchApplication(once), once);
    assert.equal(once.match(/NonReplayingApiWrites.install\(this\)/g).length, 1);
    assert.ok(once.indexOf('NonReplayingApiWrites.install(this)') < once.indexOf('loadReactNative(this)'));
    assert.ok(once.includes(`package ${name}`));
    assert.ok(once.includes('ApplicationLifecycleDispatcher.onApplicationCreate(this)'));
  }
  assert.throws(() => patchApplication('unsupported application template'), /startup/);
  assert.throws(() => patchApplication('loadReactNative(this)\napp.taatoru.network.NonReplayingApiWrites.install(this)'), /startup/);
  assert.throws(() => patchApplication('app.taatoru.network.NonReplayingApiWrites.install(this)\napp.taatoru.network.NonReplayingApiWrites.install(this)\nloadReactNative(this)'), /startup/);

});

test('native test dependencies and source generation survive repeated prebuild', async () => {
  const gradle = patchGradle('dependencies {\n implementation("com.facebook.react:react-android")\n}\n');
  assert.equal(patchGradle(gradle), gradle);
  assert.ok(gradle.includes('testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")'));
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taatoru-network-plugin-'));
  try {
    await copySources(root); await copySources(root);
    for (const [kind, file] of [['main', 'NonReplayingApiWrites.kt'], ['test', 'NonReplayingApiWritesTest.kt']]) {
      const target = await fs.readFile(path.join(root, 'app/src', kind, 'java/app/taatoru/network', file), 'utf8');
      assert.equal(target, await fs.readFile(path.join(__dirname, '../../plugins/android', file), 'utf8'));
    }
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
