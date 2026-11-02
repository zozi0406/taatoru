import { createScenario, PRESETS } from '../scenarios/factory';
import { MockWorld } from '../scenarios/world';
import { checkAnswer } from '@/features/reviews/answerChecker';

const NOW = new Date('2026-11-01T12:00:00Z');

test.each(['smoke', 'daily', 'backlog', 'extreme'] as const)('%s has exact reachable workload and repeatable original content', (name) => {
  const scenario = createScenario(name, 42, NOW);
  expect(scenario).toEqual(createScenario(name, 42, NOW));
  expect(scenario.subjects).not.toEqual(createScenario(name, 43, NOW).subjects);
  const world = new MockWorld(scenario);
  expect(world.availableLessons()).toHaveLength(PRESETS[name].lessons);
  expect(world.dueReviews()).toHaveLength(PRESETS[name].reviews);
  for (const subject of scenario.subjects) {
    const answer = scenario.answers[subject.id]!;
    expect(checkAnswer({ subject, prompt: 'meaning', answer: answer.meaning }).verdict).toBe('correct');
    if (answer.reading) expect(checkAnswer({ subject, prompt: 'reading', answer: answer.reading }).verdict).toBe('correct');
    expect(subject.data.meaning_mnemonic).toContain('Synthetic');
  }
});

test('passing the last prerequisite unlocks dependents and subsequent demotion does not relock', () => {
  const world = new MockWorld(createScenario('prerequisite', 42, NOW));
  const [first, last] = world.scenario.targets;
  const dependent = world.scenario.dependentId!;
  expect(world.availableLessons().map(x => x.data.subject_id)).not.toContain(dependent);
  world.review(first!, 0, 0, NOW.toISOString());
  expect(world.availableLessons().map(x => x.data.subject_id)).not.toContain(dependent);
  world.review(last!, 0, 0, NOW.toISOString());
  expect(world.availableLessons().map(x => x.data.subject_id)).toContain(dependent);
  world.makeDue([first!]);
  world.review(first!, 1, 0, NOW.toISOString());
  expect(world.availableLessons().map(x => x.data.subject_id)).toContain(dependent);
});

test('ninth of ten kanji passes the level, preserves backlog and unlocks only eligible next content', () => {
  const world = new MockWorld(createScenario('level-up', 42, NOW));
  const backlog = world.availableLessons().map(x => x.id);
  expect(world.scenario.user.data.level).toBe(3);
  world.review(world.scenario.targets[0]!, 0, 0, NOW.toISOString());
  expect(world.scenario.user.data.level).toBe(4);
  expect(world.availableLessons().map(x => x.id)).toEqual(expect.arrayContaining(backlog));
  expect(world.availableLessons().every(x => world.subject(x.data.subject_id).data.level <= 4)).toBe(true);
});

test.each(['subscription-cap', 'final-level'] as const)('%s cannot advance beyond playable end', name => {
  const world = new MockWorld(createScenario(name, 42, NOW));
  const level = world.scenario.user.data.level;
  world.review(world.scenario.targets[0]!, 0, 0, NOW.toISOString());
  expect(world.scenario.user.data.level).toBe(level);
});

test('rejects an unavailable start and duplicate review without changing state', () => {
  const world = new MockWorld(createScenario('smoke', 42, NOW));
  const locked = world.scenario.assignments.find(a => a.data.unlocked_at === null)!;
  expect(() => world.start(locked.id, NOW.toISOString())).toThrow();
  const due = world.dueReviews()[0]!;
  world.review(due.id, 0, 0, NOW.toISOString());
  const after = JSON.stringify(world.scenario);
  expect(() => world.review(due.id, 0, 0, NOW.toISOString())).toThrow();
  expect(JSON.stringify(world.scenario)).toBe(after);
});

test('11 kanji require 10 passes, not 9, and future levels stay gated', () => {
  const scenario = createScenario('level-up', 42, NOW);
  const source = scenario.subjects.find(s => s.object === 'kanji' && s.data.level === 3)!;
  scenario.subjects.push({ ...source, id: 3099 });
  const template = scenario.assignments.find(a => a.id === scenario.targets[0])!;
  scenario.assignments.push({ ...template, id: 103099, data: { ...template.data, subject_id: 3099 } });
  const world = new MockWorld(scenario);
  world.review(scenario.targets[0]!, 0, 0, NOW.toISOString());
  expect(scenario.user.data.level).toBe(3);
  expect(world.availableLessons().every(a => world.subject(a.data.subject_id).data.level <= 3)).toBe(true);
  world.review(103099, 0, 0, NOW.toISOString());
  expect(scenario.user.data.level).toBe(4);
});

test('subscription gate excludes above-cap subjects even with an unlock timestamp', () => {
  const scenario = createScenario('subscription-cap', 42, NOW);
  const future = scenario.assignments.find(a => Math.floor(a.data.subject_id / 1000) === 4)!;
  scenario.assignments = scenario.assignments.map(a => a.id === future.id ? { ...a, data: { ...a.data,
    unlocked_at: NOW.toISOString(), started_at: null, srs_stage: 0 } } : a);
  expect(new MockWorld(scenario).availableLessons().map(a => a.id)).not.toContain(future.id);
});

test.each(['smoke', 'daily', 'backlog', 'extreme'] as const)('%s has exact total future reviews', name => {
  const world = new MockWorld(createScenario(name, 42, NOW));
  const future = world.scenario.assignments.filter(a => a.data.srs_stage > 0 && a.data.srs_stage < 9 &&
    a.data.available_at !== null && a.data.available_at > NOW.toISOString());
  expect(future).toHaveLength(PRESETS[name].future);
});

test.each(['level-up', 'prerequisite', 'subscription-cap'] as const)('%s starts with coherent dependency gates', name => {
  const scenario = createScenario(name, 42, NOW);
  const passed = new Set(scenario.assignments.filter(a => a.data.passed_at !== null).map(a => a.data.subject_id));
  for (const a of scenario.assignments) {
    const subject = scenario.subjects.find(s => s.id === a.data.subject_id)!;
    const eligible = subject.data.level <= scenario.user.data.level && subject.data.level <= scenario.user.data.subscription.max_level_granted &&
      (!('component_subject_ids' in subject.data) || subject.data.component_subject_ids.every(id => passed.has(id)));
    expect(a.data.unlocked_at !== null).toBe(eligible);
  }
});

test('level transition unlocks only the three newly satisfied words and dependency-free next-level items', () => {
  const world = new MockWorld(createScenario('level-up', 42, NOW));
  const previous = new Set(world.availableLessons().map(a => a.data.subject_id));
  world.review(world.scenario.targets[0]!, 0, 0, NOW.toISOString());
  const newly = world.availableLessons().map(a => a.data.subject_id).filter(id => !previous.has(id)).sort((a,b) => a-b);
  expect(newly).toEqual([3029, 3039, 3049, 4001, 4002, 4003, 4004, 4005, 4006, 4007, 4008, 4009, 4010, 4053, 4054, 4055, 4056]);
});

test('first-level lesson can become Guru through review cycles and unlock only its dependent lessons', () => {
  const world = new MockWorld(createScenario('first-level', 42, NOW));
  expect(world.availableLessons().every(a => world.subject(a.data.subject_id).data.level === 1)).toBe(true);
  const radical = world.availableLessons().find(a => a.data.subject_type === 'radical')!;
  world.start(radical.id, NOW.toISOString());
  for (let cycle = 0; cycle < 4; cycle += 1) {
    world.makeDue([radical.id]);
    world.review(radical.id, 0, 0, NOW.toISOString());
  }
  expect(world.assignment(radical.id).data.srs_stage).toBe(5);
  expect(world.assignment(radical.id).data.passed_at).toBe(NOW.toISOString());
  expect(world.scenario.user.data.level).toBe(1);
  expect(world.availableLessons().every(a => world.subject(a.data.subject_id).data.level === 1)).toBe(true);
});

test('empty is a completed final-level account with no active or future workload', () => {
  const world = new MockWorld(createScenario('empty', 42, NOW));
  expect(world.availableLessons()).toEqual([]);
  expect(world.dueReviews()).toEqual([]);
  expect(world.scenario.user.data.level).toBe(60);
  expect(world.scenario.assignments.filter(a => a.data.available_at !== null)).toEqual([]);
});
