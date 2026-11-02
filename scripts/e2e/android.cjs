require('./register.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync, execFileSync } = require('node:child_process');
const { stringify } = require('yaml');
const { captureFile } = require('../../e2e/runner/capture.ts');
const { startMetroBridge } = require('../../e2e/runner/metro.ts');
const { startMockServer } = require('../../e2e/mock/server.ts');
const { parseRunnerArgs, selectDevice, waitFor, tap, reviewCommands, lessonCommands, answerCommands, assertReviewJournal, cancelLessonCommands, assertRetryTimestamps } = require('../../e2e/runner/flows.ts');
const ROOT = path.resolve(__dirname, '../..');
const APP = 'app.taatoru.e2e';
const SDK = process.env.ANDROID_HOME || path.join(process.env.HOME, 'Library/Android/sdk');
const ADB = process.env.ADB || path.join(SDK, 'platform-tools/adb');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const output = path.join(ROOT, '.expo/e2e', new Date().toISOString().replace(/[:.]/g, '-'));
let server, metro, serial, bridge, activeTool;
let interrupted = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { interrupted = true; activeTool?.kill('SIGTERM'); metro?.kill('SIGTERM'); });
const mappings = [];
function adb(args, options = {}) { return execFileSync(ADB, ['-s', serial, ...args], { timeout: 30000, ...options }); }
async function poll(operation, message, timeout = 240000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (interrupted) throw new Error('E2E run interrupted'); if (await operation()) return; await sleep(500); }
  throw new Error(`Timed out: ${message}`);
}
async function flow(name, commands) {
  const file = path.join(output, `${name}.yaml`);
  fs.writeFileSync(file, stringify({ appId: APP, name }) + '---\n' + stringify(commands));
  await new Promise((resolve, reject) => {
    const child = spawn(options.maestro || process.env.MAESTRO_BIN || 'maestro', ['--device', serial, 'test', '--debug-output', path.join(output, name), file],
      { cwd: ROOT, stdio: 'inherit', env: { ...process.env, MAESTRO_CLI_NO_ANALYTICS: '1' } });
    activeTool = child;
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`Native flow timed out: ${name}`)); }, 600000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { activeTool = undefined; clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Native flow failed: ${name}`)); });
  });
}

function snapshot(name) {
  adb(['shell', 'am', 'force-stop', APP]);
  const directory = path.join(output, name); fs.mkdirSync(directory, { recursive: true });
  const names = adb(['shell', 'run-as', APP, 'find', 'files', '-name', 'taatoru-e2e.db']).toString().trim().split('\n');
  if (names.length !== 1 || !names[0]) throw new Error('Cannot locate isolated SQLite database');
  for (const suffix of ['', '-wal', '-shm']) {
    const exists = spawnSync(ADB, ['-s', serial, 'shell', 'run-as', APP, 'test', '-f', names[0] + suffix]);
    if (exists.status === 0) captureFile(ADB, ['-s', serial, 'exec-out', 'run-as', APP, 'cat', names[0] + suffix], path.join(directory, 'state.db' + suffix));
  }
  const Database = require('better-sqlite3');
  const db = new Database(path.join(directory, 'state.db'));
  const state = {};
  for (const table of ['user', 'assignments', 'level_progressions', 'sync_outcomes', 'active_sessions', 'pending_progress', 'pending_study_materials', 'sync_dispatches', 'sync_control', 'subject_progress', 'study_materials']) state[table] = db.prepare(`SELECT * FROM ${table}`).all();
  fs.writeFileSync(path.join(directory, 'rows.json'), JSON.stringify(state, null, 2)); db.close(); return state;
}
function launch() {
  adb(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'taatoru-e2e://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8091', APP]);
}
const options = parseRunnerArgs(process.argv.slice(2));
(async () => {
  // Validate tools, package identity and device BEFORE clearing or installing anything.
  const maestro = spawnSync(options.maestro || process.env.MAESTRO_BIN || 'maestro', ['--version'], { env: { ...process.env, MAESTRO_CLI_NO_ANALYTICS: '1' } });
  if (maestro.error || maestro.status !== 0 || !/2\.12\.0/.test(maestro.stdout?.toString() || '')) throw new Error('Maestro 2.12.0 is required; set MAESTRO_BIN (see e2e/README.md)');
  serial = selectDevice(execFileSync(ADB, ['devices']).toString(), options.serial);
  const apk = options.apk || path.join(ROOT, 'android/app/build/outputs/apk/debug/app-debug.apk');
  const aapt = path.join(SDK, 'build-tools/36.0.0/aapt');
  const manifest = execFileSync(aapt, ['dump', 'badging', apk]).toString();
  if (!manifest.includes("package: name='app.taatoru.e2e'")) throw new Error('Refusing to install/reset a non-E2E APK. Build with EXPO_PUBLIC_TAATORU_E2E=1.');
  fs.mkdirSync(output, { recursive: true });
  server = await startMockServer({ scenario: options.scenario, seed: options.seed });
  const oldMappings = adb(['reverse', '--list']).toString();
  for (const port of [8787, 8091]) {
    if (oldMappings.includes(`tcp:${port}`)) throw new Error(`Port ${port} is already reversed; remove or choose another device`);
    adb(['reverse', `tcp:${port}`, `tcp:${port}`]); mappings.push(port);
  }
  // Refuse an occupied Metro port instead of accepting a manifest from another app.
  const net = require('node:net');
  await new Promise((resolve, reject) => { const probe = net.createServer(); probe.once('error', reject); probe.listen(8090, '::1', () => probe.close(resolve)); });
  bridge = await startMetroBridge();
  const metroLog = fs.openSync(path.join(output, 'metro.log'), 'w');
  metro = spawn(process.execPath, [path.join(ROOT, 'node_modules/expo/bin/cli'), 'start', '--dev-client', '--port', '8090', '--localhost'],
    { cwd: ROOT, env: { ...process.env, EXPO_PUBLIC_TAATORU_E2E: '1', EXPO_PACKAGER_PROXY_URL: 'http://127.0.0.1:8091', EXPO_NO_DOTENV: '1', CI: '1' }, stdio: ['ignore', metroLog, metroLog] });
  fs.closeSync(metroLog);
  await poll(async () => { try { return (await fetch('http://127.0.0.1:8091/status', { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; } }, 'Metro readiness', 90000);
  const devManifest = await (await fetch('http://127.0.0.1:8091/', { headers: { Accept: 'application/expo+json', 'expo-platform': 'android' }, signal: AbortSignal.timeout(30000) })).json();
  const bundle = await fetch(devManifest.launchAsset.url, { signal: AbortSignal.timeout(120000) });
  if (!bundle.ok) throw new Error('E2E bundle compilation failed; inspect Metro diagnostics');
  await bundle.arrayBuffer();
  adb(['install', '-r', apk], { timeout: 120000 });
  adb(['shell', 'am', 'force-stop', APP]); adb(['shell', 'pm', 'clear', APP]);
  launch();
  await flow('ready', [{ tapOn: { text: 'Continue', optional: true } }, { runFlow: { when: { visible: 'Reload' }, commands: [{ back: {} }] } }, waitFor('home-dashboard')]);
  const scenario = server.world.scenario;
  if (options.suite === 'sandbox') {
    console.log(`Synthetic sandbox ready (${options.scenario}, seed ${options.seed}). Press Ctrl-C to stop owned services.`);
    await new Promise(resolve => { const timer = setInterval(() => { if (interrupted) { clearInterval(timer); resolve(); } }, 250); });
    return;
  }
  const due = server.world.dueReviews().sort((a,b) => a.data.subject_id - b.data.subject_id);
  const ids = due.map(a => a.data.subject_id);
  if (!ids.length && !['bounds', 'materials'].includes(options.suite)) throw new Error('Selected suite requires due reviews');
  if (options.suite === 'bounds') {
    const last = server.world.availableLessons().sort((a,b) => a.data.subject_id-b.data.subject_id).at(-1);
    await flow('bounds', [{ assertVisible: '200' }, { assertVisible: '1000' }, ...lessonCommands(scenario, last.data.subject_id, 180000)]);
    await poll(() => server.journal.some(e => e.accepted && e.path === `/v2/assignments/${last.id}/start`), 'distant selected lesson accepted');
    await flow('bounds-cancel', cancelLessonCommands(server.world.availableLessons()[0].data.subject_id));
    if (server.journal.filter(e => e.accepted).length !== 1) throw new Error('Bounds mutated more than the selected lesson');
  } else if (['materials', 'material-recovery'].includes(options.suite)) {
    const id = ids[0];
    server.arm({ method: 'POST', path: '/v2/study_materials', kind: options.suite === 'material-recovery' ? 'drop-after' : 'hold-after' });
    await flow('material-create', [{ openLink: `taatoru-e2e://subject/${id}` }, { scrollUntilVisible: { element: { id: 'material-meaning-note' }, direction: 'DOWN' } },
      { tapOn: { id: 'material-meaning-note' } }, { inputText: 'First synthetic note' }, { waitForAnimationToEnd: {} }, { pressKey: 'back' }, { waitForAnimationToEnd: {} },
      { scrollUntilVisible: { element: { text: 'Save study materials' }, direction: 'DOWN' } }, tap('Save study materials')]);
    if (options.suite === 'material-recovery') {
      await poll(() => server.world.scenario.studyMaterials.some(m => m.data.subject_id === id && m.data.meaning_note === 'First synthetic note'), 'material create accepted');
    } else {
      await server.waitForHeld(120000);
      await flow('newer-material-edit', [{ scrollUntilVisible: { element: { id: 'material-meaning-note' }, direction: 'UP' } }, { tapOn: { id: 'material-meaning-note' } },
        { eraseText: {} }, { inputText: 'Newer synthetic note' }, { waitForAnimationToEnd: {} }, { pressKey: 'back' }, { waitForAnimationToEnd: {} },
        { scrollUntilVisible: { element: { id: 'material-meaning-synonyms' }, direction: 'DOWN' } }, { tapOn: { id: 'material-meaning-synonyms' } },
        { inputText: 'Invented glow' }, { waitForAnimationToEnd: {} }, { pressKey: 'back' }, { waitForAnimationToEnd: {} },
        { scrollUntilVisible: { element: { text: 'Save study materials' }, direction: 'DOWN' } }, tap('Save study materials')]);
      server.release();
      await poll(() => server.world.scenario.studyMaterials.some(m => m.data.subject_id === id && m.data.meaning_note === 'Newer synthetic note' && m.data.meaning_synonyms.includes('invented glow')), 'newer material accepted');
      const materialWrites = server.journal.filter(e => e.accepted && e.path.startsWith('/v2/study_materials'));
      if (materialWrites.filter(e => e.method === 'POST').length !== 1 || !materialWrites.some(e => e.method === 'PUT'))
        throw new Error('Material identity/revision did not use one create followed by update');
    }
    await flow('materials-home', [{ back: {} }, waitFor('home-dashboard')]);
  } else {
    if (options.suite === 'connection-before') server.arm({ method: 'POST', path: '/v2/reviews', kind: 'drop-before' });
    if (['preacceptance', 'quota', 'rejected'].includes(options.suite)) server.arm({ method: 'POST', path: '/v2/reviews', kind: 'reject', status: options.suite === 'preacceptance' ? 500 : options.suite === 'quota' ? 429 : 422 });
    if (['recovery', 'receipt-recovery'].includes(options.suite)) server.arm({ method: 'POST', path: '/v2/reviews', kind: options.suite === 'recovery' ? 'drop-after' : 'malformed-after' });
    await flow('start-reviews', [tap('Start reviews')]);
    if (options.suite === 'resume') {
      const first = ids[0];
      if (!scenario.answers[first].reading) throw new Error('Resume scenario needs a two-part review');
      await flow('first-half', answerCommands(scenario, first, 'meaning'));
      const before = snapshot('before-resume');
      if (!before.active_sessions.length) throw new Error('No saved session before restart');
      launch(); await flow('resume', [waitFor('home-dashboard'), tap('Start reviews'), ...answerCommands(scenario, first, 'reading'), ...reviewCommands(scenario, ids.slice(1)), tap('Finish reviews')]);
    } else {
      await flow('reviews', [...reviewCommands(scenario, ids, options.suite === 'mutations'), tap('Finish reviews'), waitFor('home-dashboard')]);
    }
    if (options.suite === 'rejected') {
      await poll(() => server.journal.some(e => e.path === '/v2/reviews' && e.status === 422), 'rejection observed');
      await flow('attention', [{ extendedWaitUntil: { visible: 'Synchronization needs attention.*', timeout: 120000 } }, { assertVisible: 'Review saved changes' }]);
    } else {
      await poll(() => server.journal.filter(e => e.accepted && e.path === '/v2/reviews').length === ids.length, 'all reviews accepted');
      assertReviewJournal(server.journal, due.map(a => a.id), options.suite === 'mutations' && due[1] ? { [due[1].id]: 1 } : {});
      const attempts = server.journal.filter(e => e.method === 'POST' && e.path === '/v2/reviews');
      if (['recovery', 'receipt-recovery'].includes(options.suite) && attempts.length !== ids.length) throw new Error('Lost-response recovery replayed a review');
      if (['preacceptance', 'quota', 'connection-before'].includes(options.suite)) assertRetryTimestamps(server.journal);
      if (options.suite === 'connection-before') {
        if (attempts.length < 2 || !attempts.some(e => e.fault === 'drop-before' && !e.accepted))
          throw new Error('Pre-acceptance loss did not exercise a retry');
        const previous = new Map();
        for (const attempt of attempts) {
          const id = attempt.body.review.assignment_id;
          const prior = previous.get(id);
          if (prior) {
            const subjectId = due.find(a => a.id === id)?.data.subject_id;
            const between = server.journal.filter(e => e.sequence > prior.sequence && e.sequence < attempt.sequence);
            if (!between.some(e => e.method === 'GET' && e.path === `/v2/assignments/${id}`) ||
                !between.some(e => e.method === 'GET' && e.path === `/v2/review_statistics?subject_ids=${subjectId}`))
              throw new Error('Mutation retried without authoritative reconciliation reads');
          }
          previous.set(id, attempt);
        }
      }

    }
    if (options.suite === 'level-up-auto') {
      // Do not scroll upward: reaching the FlatList top can trigger manual pull-to-refresh.
      await flow('automatic-level-up', [{ scrollUntilVisible: { element: { text: 'Synchronization complete.*' }, direction: 'DOWN', timeout: 120000 } }]);
    } else if (options.suite === 'progression') {
      if (scenario.name === 'level-up' && server.world.scenario.user.data.level !== 4) throw new Error('Level did not advance');
      await flow('level-up', [{ scrollUntilVisible: { element: { text: 'Quick sync' }, direction: 'DOWN' } }, tap('Quick sync'), { scrollUntilVisible: { element: { text: 'Level 4' }, direction: 'UP', timeout: 120000 } }]);
    } else if (options.suite === 'smoke' || options.suite === 'mutations') {
      // One chosen lesson, then cancel another choice without a mutation.
      const lesson = server.world.availableLessons().sort((a,b) => a.data.subject_id - b.data.subject_id)[0];
      await flow('lesson', lessonCommands(scenario, lesson.data.subject_id));
      await poll(() => server.journal.some(e => e.accepted && e.path === `/v2/assignments/${lesson.id}/start`), 'selected lesson accepted');
      if (options.suite === 'smoke') {
        const automatic = server.world.availableLessons().sort((a,b) => a.data.subject_id - b.data.subject_id)[0];
        await flow('automatic-lesson', [tap('Start lessons'), tap('Continue to quiz'), ...reviewCommands(scenario, [automatic.data.subject_id]), tap('Finish lessons'), waitFor('home-dashboard')]);
        await poll(() => server.journal.some(e => e.accepted && e.path === `/v2/assignments/${automatic.id}/start`), 'automatic lesson accepted');
      }
      await flow('cancel', cancelLessonCommands(server.world.availableLessons()[0].data.subject_id));
      const expectedStarts = options.suite === 'smoke' ? 2 : 1;
      if (server.journal.filter(e => e.accepted).length !== ids.length + expectedStarts) throw new Error('Cancel or another UI action mutated unintended subjects');
    }
  }
  // Coordinator may still be importing receipt-adjacent collections. Give it a bounded real settling window.
  if (options.suite !== 'rejected') await poll(async () => {
    const tree = adb(['exec-out', 'uiautomator', 'dump', '/dev/tty']).toString();
    return !tree.includes('changes waiting to upload') && !tree.includes('Saved changes need attention');
  }, 'visible delivery settles');
  const state = snapshot('final');
  if (options.suite === 'rejected') {
    if (state.pending_progress.length !== 1 || state.pending_progress[0].delivery_state !== 'rejected' || server.journal.some(e => e.accepted))
      throw new Error('Rejected work was lost or applied remotely');
  } else if (state.pending_progress.length || state.pending_study_materials.length || state.sync_dispatches.length)
    throw new Error('Durable work did not settle; inspect final/rows.json');
  if (options.suite === 'material-recovery') {
    const creates = server.journal.filter(e => e.method === 'POST' && e.path === '/v2/study_materials');
    const material = state.study_materials.find(m => m.subject_id === ids[0]);
    if (creates.length !== 1 || !creates[0].accepted || !material || material.id <= 0 || material.meaning_note !== 'First synthetic note')
      throw new Error('Lost material create did not reconcile one positive server identity');
    if (!server.journal.some(e => e.sequence > creates[0].sequence && e.method === 'GET' && e.path.startsWith('/v2/study_materials?subject_ids=')))
      throw new Error('Lost material create settled without authoritative lookup');
  }
  if (options.suite === 'level-up-auto' && state.user[0]?.level !== 4) throw new Error('Automatic account level was not persisted');
  if (options.suite === 'progression') {
    if (state.user[0]?.level !== 4) throw new Error('New account level was not persisted');
    const localLessons = state.assignments.filter(a => a.srs_stage === 0 && a.unlocked_at && !a.started_at).map(a => a.subject_id).sort((a,b) => a-b);
    const remoteLessons = server.world.availableLessons().map(a => a.data.subject_id).sort((a,b) => a-b);
    if (JSON.stringify(localLessons) !== JSON.stringify(remoteLessons)) throw new Error('Newly unlocked lesson set was not persisted exactly');
  }
  if (options.suite === 'bounds') {
    const starts = server.journal.filter(e => e.accepted);
    const assignmentId = Number(starts[0].path.split('/')[3]);
    if (!state.assignments.some(a => a.id === assignmentId && a.started_at !== null)) throw new Error('Distant selected lesson was not persisted');
  }
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ suite: options.suite, seed: options.seed, serial, accepted: server.journal.filter(e => e.accepted), passed: true }, null, 2));
  console.log(`PASS ${options.suite}; artifacts: ${output}`);
})().catch(error => {
  console.error(error.stack || error); process.exitCode = 1;
  if (fs.existsSync(output)) fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: false, suite: options.suite, seed: options.seed, error: String(error) }, null, 2));
  if (serial && fs.existsSync(output)) {
    try { fs.writeFileSync(path.join(output, 'failure.png'), adb(['exec-out', 'screencap', '-p'])); } catch {}
    try { fs.writeFileSync(path.join(output, 'logcat.txt'), adb(['logcat', '-d', '-t', '2000'])); } catch {}
    try { snapshot('failure'); } catch {}
  }
}).finally(async () => {
  if (server) { fs.writeFileSync(path.join(output, 'server.json'), JSON.stringify({ scenario: server.world.scenario, journal: server.journal }, null, 2)); await server.close(); }
  if (metro && metro.exitCode === null) await new Promise(resolve => { metro.once('exit', resolve); metro.kill('SIGTERM'); setTimeout(resolve, 5000).unref(); });
  await bridge?.close();
  for (const port of mappings) { try { adb(['reverse', '--remove', `tcp:${port}`]); } catch {} }
});
