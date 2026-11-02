/** @jest-environment node */
import { parseRunnerArgs, selectDevice, reviewCommands } from '../runner/flows';
import { createScenario } from '../scenarios/factory';

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
