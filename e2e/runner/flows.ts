import type { Scenario, ScenarioName } from '../scenarios/factory';
import { PRESETS } from '../scenarios/factory';

export type Command = Record<string, unknown>;
export const SUITES = ['smoke', 'mutations', 'progression', 'bounds', 'recovery', 'resume', 'materials', 'preacceptance', 'quota', 'rejected', 'sandbox', 'receipt-recovery', 'level-up-auto', 'connection-before', 'material-recovery', 'reading-input', 'wrap-up', 'media-cache'] as const;
export type Suite = typeof SUITES[number];

/** Expo launcher flags affect development chrome only; application routes stay real. */
export function developmentClientLaunchUrl(): string {
  const launch = new URL('taatoru-e2e://expo-development-client/');
  launch.searchParams.set('url', 'http://127.0.0.1:8091');
  launch.searchParams.set('disableOnboarding', '1');
  launch.searchParams.set('disableFab', '1');
  launch.searchParams.set('disableAutoLaunch', '1');
  return launch.toString();
}

/** adb shell joins arguments; quote the fixed URL so query separators stay literal. */
export function developmentClientLaunchCommand(): string {
  return `am start -a android.intent.action.VIEW -d '${developmentClientLaunchUrl()}' app.taatoru.e2e`;
}

export function parseRunnerArgs(args: readonly string[]) {
  const options: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!['--suite', '--serial', '--scenario', '--seed', '--apk', '--maestro'].includes(args[index]!) || !args[index + 1])
      throw new Error(`Unknown or incomplete option: ${args[index]}`);
    options[args[index]!] = args[index + 1]!;
  }
  const suite = options['--suite'] ?? 'smoke';
  if (!SUITES.includes(suite as Suite)) throw new Error('Unknown suite');
  const scenario = options['--scenario'] ?? (['progression', 'resume', 'recovery', 'preacceptance', 'quota', 'rejected', 'receipt-recovery', 'level-up-auto', 'connection-before'].includes(suite) ? 'level-up' : suite === 'bounds' ? 'extreme' : suite === 'sandbox' ? 'daily' : 'smoke');
  if (!Object.hasOwn(PRESETS, scenario)) throw new Error('Unknown scenario');
  const seed = Number(options['--seed'] ?? 42);
  if (!Number.isSafeInteger(seed)) throw new Error('Invalid seed');
  return { suite: suite as Suite, scenario: scenario as ScenarioName, seed, serial: options['--serial'], apk: options['--apk'], maestro: options['--maestro'] };
}
export function selectDevice(output: string, requested?: string): string {
  const devices = output.split('\n').map(line => line.trim().split(/\s+/)).filter(parts => parts[1] === 'device').map(parts => parts[0]!);
  if (requested && devices.includes(requested)) return requested;
  if (!requested && devices.length === 1) return devices[0]!;
  throw new Error('Specify --serial for one connected, authorized Android device');
}
export function waitFor(id: string): Command { return { extendedWaitUntil: { visible: { id }, timeout: 120000 } }; }
/** The container appears before the asynchronous local dashboard data is ready. */
export function homeReadyCommands(): Command[] {
  return [waitFor('home-dashboard'), { extendedWaitUntil: { visible: 'Start reviews', timeout: 120000 } }];
}
export function tap(text: string): Command { return { tapOn: text }; }
export function answerCommands(scenario: Scenario, id: number, prompt: 'meaning' | 'reading', wrong = false, overrideWrong = true): Command[] {
  const answer = scenario.answers[id]!;
  const romaji: Record<string, string> = { 'も': 'mo', 'な': 'na', 'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o' };
  const value = wrong ? 'incorrect invented comet' : prompt === 'meaning' ? answer.meaning : [...answer.reading!].map(c => romaji[c] ?? c).join('');
  return [waitFor(`study-answer-${id}-${prompt}`), { tapOn: { id: `study-answer-${id}-${prompt}` } },
    { inputText: value }, { hideKeyboard: {} }, tap('Submit answer'),
    ...(wrong && overrideWrong ? [tap('My answer was correct')] : [tap('Continue')])];
}
export function reviewCommands(scenario: Scenario, ids: readonly number[], override = false): Command[] {
  return ids.flatMap((id, index) => [...(override && index === 1 ? answerCommands(scenario, id, 'meaning', true, false) : []), ...answerCommands(scenario, id, 'meaning', override && index === 0),
    ...(scenario.answers[id]?.reading ? answerCommands(scenario, id, 'reading') : [])]);
}
export function lessonCommands(scenario: Scenario, id: number, traversalTimeout = 30000): Command[] {
  return [tap('Choose lessons'), { scrollUntilVisible: { element: { id: `lesson-subject-${id}` }, direction: 'DOWN', timeout: traversalTimeout, speed: traversalTimeout > 30000 ? 80 : 40, waitToSettleTimeoutMs: 500 } },
    { tapOn: { id: `lesson-subject-${id}` } }, tap('Begin selected lessons'), tap('Continue to quiz'),
    ...reviewCommands(scenario, [id]), tap('Finish lessons'), ...homeReadyCommands()];
}

/** Complete a real mistake and leave the final subject's reading half for wrap-up. */
export function wrapUpCommands(scenario: Scenario, ids: readonly number[]): Command[] {
  const last = ids.at(-1);
  if (ids.length !== 4 || last === undefined || !scenario.answers[last]?.reading)
    throw new Error('Wrap-up workload requires four subjects ending in a two-part review');
  return [tap('Start reviews'), ...answerCommands(scenario, ids[0]!, 'meaning', true, false),
    ...reviewCommands(scenario, ids.slice(0, -1)), ...answerCommands(scenario, last, 'meaning'),
    tap('Wrap up reviews'), ...answerCommands(scenario, last, 'reading'),
    { assertVisible: 'Reviews complete' }, { assertVisible: '.*75%.*' },
    { assertVisible: scenario.answers[ids[0]!]!.meaning }, tap('Finish reviews'), ...homeReadyCommands()];
}

/** Exercise incremental composition through real native text changes before the valid grade. */
export function readingInputCommands(scenario: Scenario, id: number): Command[] {
  if (!scenario.answers[id]?.reading) throw new Error('Reading input workload requires a reading');
  const scrollTo = (text: string): Command => ({ scrollUntilVisible: { element: { text }, direction: 'DOWN', timeout: 30000 } });
  return [tap('Choose lessons'), scrollTo(scenario.answers[id]!.meaning),
    { tapOn: { id: `lesson-subject-${id}` } }, tap('Begin selected lessons'),
    tap('Study settings'), scrollTo('Reading input: Convert to kana'), tap('Reading input: Convert to kana'),
    scrollTo('Save settings'), tap('Save settings'), scrollTo('Back to study'), tap('Back to study'), tap('Continue to quiz'),
    ...answerCommands(scenario, id, 'meaning'), waitFor(`study-answer-${id}-reading`),
    { tapOn: { id: `study-answer-${id}-reading` } },
    ...[...'annai'].map(character => ({ inputText: character })), { assertVisible: 'あんあい' }, { eraseText: {} },
    ...[...'konnichiha'].map(character => ({ inputText: character })), { assertVisible: 'こんいちは' }, { eraseText: {} },
    ...answerCommands(scenario, id, 'reading'), tap('Finish lessons'), ...homeReadyCommands()];
}

export function assertReviewJournal(
  journal: readonly { accepted: boolean; path: string; body: unknown }[], assignmentIds: readonly number[],
  expectedMeaningErrors: Readonly<Record<number, number>> = {},
): void {
  const writes = journal.filter(entry => entry.accepted && entry.path === '/v2/reviews');
  const actual = writes.map(entry => (entry.body as { review: { assignment_id: number } }).review.assignment_id).sort((a,b) => a-b);
  const expected = [...assignmentIds].sort((a,b) => a-b);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Review identities differ: expected ${expected}, accepted ${actual}`);
  for (const entry of writes) {
    const review = (entry.body as { review: { assignment_id: number; incorrect_meaning_answers: number; incorrect_reading_answers: number } }).review;
    if (review.incorrect_meaning_answers !== (expectedMeaningErrors[review.assignment_id] ?? 0) || review.incorrect_reading_answers !== 0)
      throw new Error('Unexpected review mistake payload; grade/override counters differ from expected');
  }
}

export function cancelLessonCommands(id: number): Command[] {
  return [tap('Choose lessons'), { scrollUntilVisible: { element: { id: `lesson-subject-${id}` }, direction: 'DOWN', timeout: 30000 } },
    { tapOn: { id: `lesson-subject-${id}` } }, { assertVisible: '1 of 1 selected' }, tap('Cancel lesson selection'), ...homeReadyCommands()];
}

/** A retry must retain its own completion time; distinct reviews need not share one. */
export function assertRetryTimestamps(journal: readonly { method: string; path: string; body: unknown }[]): void {
  const timestamps = new Map<number, string>();
  for (const entry of journal.filter(e => e.method === 'POST' && e.path === '/v2/reviews')) {
    const review = (entry.body as { review: { assignment_id: number; created_at: string } }).review;
    if (timestamps.has(review.assignment_id) && timestamps.get(review.assignment_id) !== review.created_at)
      throw new Error('Retry changed the durable completion timestamp');
    timestamps.set(review.assignment_id, review.created_at);
  }
}
