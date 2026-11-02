/** @jest-environment node */
import { execFileSync } from 'node:child_process';
import { parseRunnerArgs, selectDevice, reviewCommands, developmentClientLaunchUrl, developmentClientLaunchCommand, wrapUpCommands, readingInputCommands, homeReadyCommands } from '../runner/flows';
import { createScenario } from '../scenarios/factory';
import { seedCachedRadical } from '../runner/media';

test('isolated development launch suppresses developer onboarding without changing app routes', () => {
  const launch = new URL(developmentClientLaunchUrl());
  expect(launch.protocol).toBe('taatoru-e2e:');
  expect(launch.hostname).toBe('expo-development-client');
  expect(launch.searchParams.get('url')).toBe('http://127.0.0.1:8091');
  expect(launch.searchParams.get('disableOnboarding')).toBe('1');
  expect(launch.searchParams.get('disableFab')).toBe('1');
  expect(launch.searchParams.get('disableAutoLaunch')).toBe('1');
});

test('Android shell receives the complete development URL as one argument', () => {
  const output = execFileSync('/bin/sh', ['-c',
    `am() { printf '%s\\n' "$@"; }\n${developmentClientLaunchCommand()}`,
  ], { encoding: 'utf8' });
  expect(output.trim().split('\n')).toEqual([
    'start', '-a', 'android.intent.action.VIEW', '-d', developmentClientLaunchUrl(), 'app.taatoru.e2e',
  ]);
});

test('restart readiness waits for loaded dashboard actions after its loading container appears', () => {
  expect(homeReadyCommands()).toEqual([
    { extendedWaitUntil: { visible: { id: 'home-dashboard' }, timeout: 120000 } },
    { extendedWaitUntil: { visible: 'Start reviews', timeout: 120000 } },
  ]);
});

test('rejects unknown suite and ambiguous devices before issuing resets', () => {
  expect(() => parseRunnerArgs(['--suite', 'unknown'])).toThrow();
  expect(() => selectDevice('List of devices attached\na device\nb device\n')).toThrow('serial');
  expect(selectDevice('List of devices attached\na device\n', 'a')).toBe('a');
  expect(() => selectDevice('List of devices attached\na offline\n', 'a')).toThrow();
});

test('generated questions use real inputs and correct subject-specific original answers', () => {
  const scenario = createScenario('smoke');
  const id = scenario.subjects.find(s => s.object === 'kanji')!.id;
  const commands = JSON.stringify(reviewCommands(scenario, [id]));
  expect(commands).toContain(`study-answer-${id}-meaning`);
  expect(commands).toContain(scenario.answers[id]!.meaning);
  expect(commands).toContain(`study-answer-${id}-reading`);
  expect(commands).toContain('Submit answer');
});

test('native mutation oracle rejects wrong identities, counts and duplicate writes', () => {
  const { assertReviewJournal } = require('../runner/flows');
  const good = { accepted: true, path: '/v2/reviews', body: { review: { assignment_id: 1001,
    incorrect_meaning_answers: 0, incorrect_reading_answers: 0 } } };
  expect(() => assertReviewJournal([good], [1001])).not.toThrow();
  expect(() => assertReviewJournal([good], [1002])).toThrow();
  expect(() => assertReviewJournal([good, good], [1001])).toThrow();
  expect(() => assertReviewJournal([{ ...good, body: { review: { ...good.body.review, incorrect_meaning_answers: 1 } } }], [1001])).toThrow();
});

test('mutation command sequence preserves one unoverridden mistake separately from an override', () => {
  const scenario = createScenario('smoke');
  const commands = JSON.stringify(reviewCommands(scenario, [1001, 1002], true));
  expect(commands.match(/incorrect invented comet/g)).toHaveLength(2);
  expect(commands.match(/My answer was correct/g)).toHaveLength(1);
});

test('manual sandbox defaults to a daily workload and accepts explicit scenarios', () => {
  expect(parseRunnerArgs(['--suite', 'sandbox']).scenario).toBe('daily');
  expect(parseRunnerArgs(['--suite', 'sandbox', '--scenario', 'backlog']).scenario).toBe('backlog');
});

test('wrap-up suite finishes a begun reading half and retains a real mistake for results', () => {
  const scenario = createScenario('smoke');
  const commands = wrapUpCommands(scenario, [1001, 1002, 1003, 1011]);
  const actions = commands.map(command => command.tapOn).filter(Boolean);
  expect(parseRunnerArgs(['--suite', 'wrap-up']).scenario).toBe('smoke');
  expect(actions).toContain('Wrap up reviews');
  expect(commands).toContainEqual({ assertVisible: '.*75%.*' });
  expect(commands).toContainEqual({ inputText: 'incorrect invented comet' });
  expect(JSON.stringify(commands)).toContain('study-answer-1011-reading');
});

test('reading input suite types n syllables as separate native input events before grading', () => {
  const scenario = createScenario('smoke');
  const commands = readingInputCommands(scenario, 1021);
  expect(parseRunnerArgs(['--suite', 'reading-input']).scenario).toBe('smoke');
  expect(commands).toContainEqual({ assertVisible: 'あんあい' });
  expect(commands).toContainEqual({ assertVisible: 'こんいちは' });
  expect(commands.filter(command => command.inputText === 'n')).toHaveLength(4);
  expect(JSON.stringify(commands)).toContain('Finish lessons');
});

test('media-cache workload uses an original image-only subject and durable app files', () => {
  const scenario = createScenario('smoke');
  const fixture = seedCachedRadical(scenario);
  const subject = scenario.subjects.find(item => item.id === fixture.subjectId)!;
  expect(subject.data.characters).toBeNull();
  expect(fixture.path.startsWith('files/radical-images-v1/')).toBe(true);
  const payload = JSON.parse(fixture.payload);
  expect(payload.key).toBe('https://synthetic-media.invalid/original-square.svg\nimage/svg+xml');
  expect(payload.image.content).toContain('M1 1h8v8H1z');
  expect(parseRunnerArgs(['--suite', 'media-cache']).scenario).toBe('smoke');
});


test('connection loss suites select review and material workloads explicitly', () => {
  expect(parseRunnerArgs(['--suite', 'connection-before']).scenario).toBe('level-up');
  expect(parseRunnerArgs(['--suite', 'material-recovery']).scenario).toBe('smoke');
});

test('retry timestamps are stable per review, not shared across different completions', () => {
  const { assertRetryTimestamps } = require('../runner/flows');
  const attempt = (id: number, time: string) => ({ method: 'POST', path: '/v2/reviews', body: { review: { assignment_id: id, created_at: time } } });
  expect(() => assertRetryTimestamps([attempt(1, 'first'), attempt(2, 'later'), attempt(1, 'first')])).not.toThrow();
  expect(() => assertRetryTimestamps([attempt(1, 'first'), attempt(1, 'changed')])).toThrow('timestamp');
});


test.each(['constructor', 'toString', '__proto__'])('rejects inherited object property %s as a scenario before device setup', scenario => {
  expect(() => parseRunnerArgs(['--scenario', scenario])).toThrow('Unknown scenario');
});
