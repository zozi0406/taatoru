const fs = require('node:fs/promises');
const path = require('node:path');

const INSTALL = 'app.taatoru.network.NonReplayingApiWrites.install(this)';
const DEPENDENCIES = `
// @generated Taatoru API transport tests
dependencies {
    testImplementation("junit:junit:4.13.2")
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
}
`;

function patchApplication(source) {
  const startup = /^([ \t]*)loadReactNative\(this\)[ \t]*$/m;
  const match = startup.exec(source);
  if (!match) throw new Error('Unsupported Android startup template: cannot install API transport policy');
  if (source.includes(INSTALL)) {
    if (source.indexOf(INSTALL) > match.index || source.split(INSTALL).length !== 2)
      throw new Error('Invalid Android startup transport policy registration');
    return source;
  }
  return source.replace(startup, `${match[1]}${INSTALL}\n$&`);
}
function patchGradle(source) {
  return source.includes('// @generated Taatoru API transport tests') ? source : source + DEPENDENCIES;
}
async function copySources(androidRoot) {
  for (const [kind, file] of [['main', 'NonReplayingApiWrites.kt'], ['test', 'NonReplayingApiWritesTest.kt']]) {
    const directory = path.join(androidRoot, 'app/src', kind, 'java/app/taatoru/network');
    await fs.mkdir(directory, { recursive: true });
    await fs.copyFile(path.join(__dirname, 'android', file), path.join(directory, file));
  }
}
function withNonReplayingApiWrites(config) {
  const { withMainApplication, withAppBuildGradle, withDangerousMod } = require('expo/config-plugins');
  config = withMainApplication(config, mod => {
    if (mod.modResults.language !== 'kt') throw new Error('API transport policy requires the Kotlin Android startup template');
    mod.modResults.contents = patchApplication(mod.modResults.contents);
    return mod;
  });
  config = withAppBuildGradle(config, mod => {
    if (mod.modResults.language !== 'groovy') throw new Error('API transport tests require the Groovy Android Gradle template');
    mod.modResults.contents = patchGradle(mod.modResults.contents);
    return mod;
  });
  return withDangerousMod(config, ['android', async mod => {
    await copySources(mod.modRequest.platformProjectRoot);
    return mod;
  }]);
}
module.exports = withNonReplayingApiWrites;
module.exports.patchApplication = patchApplication;
module.exports.patchGradle = patchGradle;
module.exports.copySources = copySources;
