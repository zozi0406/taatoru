import type { AssignmentData, IdentifiedResource, LevelProgressionData, MaterialReceipt, Resource,
  ReviewStatisticData, SubjectObject, SubjectResource, UserData } from '../../src/api/types';

export const PRESETS = {
  'first-level': { lessons: 8, reviews: 0, future: 0, level: 1 },
  smoke: { lessons: 8, reviews: 12, future: 8, level: 3 },
  daily: { lessons: 20, reviews: 80, future: 40, level: 10 },
  backlog: { lessons: 80, reviews: 300, future: 100, level: 20 },
  extreme: { lessons: 200, reviews: 1000, future: 200, level: 30 },
  empty: { lessons: 0, reviews: 0, future: 0, level: 60 },
  prerequisite: { lessons: 0, reviews: 2, future: 0, level: 3 },
  'level-up': { lessons: 8, reviews: 1, future: 0, level: 3 },
  'subscription-cap': { lessons: 8, reviews: 1, future: 0, level: 3 },
  'final-level': { lessons: 8, reviews: 1, future: 0, level: 60 },
} as const;
export type ScenarioName = keyof typeof PRESETS;
export type Assignment = IdentifiedResource<AssignmentData, 'assignment'>;
export type Statistic = IdentifiedResource<ReviewStatisticData, 'review_statistic'>;
export interface Scenario {
  name: ScenarioName; seed: number; now: string; runId: string;
  user: Resource<UserData, 'user'>; subjects: SubjectResource[]; assignments: Assignment[];
  reviewStatistics: Statistic[]; studyMaterials: MaterialReceipt[];
  levelProgressions: IdentifiedResource<LevelProgressionData, 'level_progression'>[];
  answers: Record<number, { meaning: string; reading?: string }>;
  targets: number[]; dependentId?: number;
}

export function resource<T, K extends 'assignment' | 'review_statistic' | 'study_material' | 'level_progression'>(
  id: number, object: K, data: T, timestamp: string,
): IdentifiedResource<T, K> {
  return { id, object, data, data_updated_at: timestamp, url: `http://127.0.0.1:8787/v2/${object}s/${id}` };
}

/** Original invented labels and readings; the API types are the only content dependency. */
export function createCatalog(levels: number, seed: number, timestamp: string): SubjectResource[] {
  if (!Number.isInteger(levels) || levels < 1 || levels > 60 || !Number.isSafeInteger(seed)) throw new Error('Invalid catalog options');
  const result: SubjectResource[] = [];
  const symbols = ['◇', '△', '○', '□', '☆'];
  for (let level = 1; level <= levels; level += 1) {
    const types: SubjectObject[] = [
      ...Array<SubjectObject>(10).fill('radical'), ...Array<SubjectObject>(10).fill('kanji'),
      ...Array<SubjectObject>(32).fill('vocabulary'), ...Array<SubjectObject>(4).fill('kana_vocabulary'),
    ];
    types.forEach((object, index) => {
      const id = level * 1000 + index + 1;
      const meaning = `test lantern ${seed} ${id}`;
      const reading = `も${['あ', 'い', 'う', 'え', 'お'][(id + Math.abs(seed)) % 5]}な`;
      const common = {
        auxiliary_meanings: [], characters: object === 'radical' ? symbols[index % symbols.length]! : reading,
        created_at: timestamp, document_url: `http://127.0.0.1:8787/synthetic/${id}`, hidden_at: null,
        lesson_position: index, level, meaning_mnemonic: `Synthetic lantern ${id}: imagine a paper moon in an invented workshop.`,
        meanings: [{ meaning, primary: true, accepted_answer: true }], slug: `synthetic-${seed}-${id}`, spaced_repetition_system_id: 1,
      };
      const base = { id, object, url: `http://127.0.0.1:8787/v2/subjects/${id}`, data_updated_at: timestamp };
      if (object === 'radical') result.push({ ...base, object, data: { ...common, amalgamation_subject_ids: [], character_images: [] } });
      if (object === 'kanji') result.push({ ...base, object, data: { ...common,
        component_subject_ids: [level * 1000 + (index - 10) % 10 + 1, level * 1000 + (index - 9) % 10 + 1],
        amalgamation_subject_ids: [], meaning_hint: null, reading_hint: null, reading_mnemonic: 'Synthetic spoken lantern rhythm.',
        readings: [{ reading, primary: true, accepted_answer: true, type: 'onyomi' }], visually_similar_subject_ids: [],
      } });
      if (object === 'vocabulary') result.push({ ...base, object, data: { ...common,
        component_subject_ids: [level * 1000 + (index - 20) % 10 + 11], context_sentences: [], parts_of_speech: ['noun'],
        pronunciation_audios: [], reading_mnemonic: 'Synthetic workshop rhyme.', readings: [{ reading, primary: true, accepted_answer: true }],
      } });
      if (object === 'kana_vocabulary') result.push({ ...base, object, data: { ...common, context_sentences: [], parts_of_speech: ['noun'], pronunciation_audios: [] } });
    });
  }
  return result.map(subject => {
    if (!('amalgamation_subject_ids' in subject.data)) return subject;
    const ids = result.filter(other => 'component_subject_ids' in other.data && other.data.component_subject_ids.includes(subject.id)).map(other => other.id);
    return { ...subject, data: { ...subject.data, amalgamation_subject_ids: ids } } as SubjectResource;
  });
}

export function prerequisites(subject: SubjectResource): readonly number[] {
  return 'component_subject_ids' in subject.data ? subject.data.component_subject_ids : [];
}

export function createScenario(name: ScenarioName = 'daily', seed = 42, now = new Date()): Scenario {
  const preset = Object.hasOwn(PRESETS, name) ? PRESETS[name] : undefined;
  if (!preset || !Number.isFinite(now.getTime())) throw new Error('Unknown scenario or invalid reference time');
  const timestamp = new Date(now.getTime() - 86_400_000).toISOString();
  const subjects = createCatalog(Math.min(60, preset.level + 2), seed, timestamp);
  const cap = name === 'subscription-cap' ? preset.level : 60;
  const user: Resource<UserData, 'user'> = { object: 'user', url: 'http://127.0.0.1:8787/v2/user', data_updated_at: timestamp,
    data: { id: 'synthetic-account', username: 'Synthetic lantern keeper', level: preset.level,
      profile_url: 'http://127.0.0.1:8787/synthetic', started_at: timestamp, current_vacation_started_at: null,
      subscription: { active: true, type: 'lifetime', max_level_granted: cap, period_ends_at: null },
      preferences: { default_voice_actor_id: 1, extra_study_autoplay_audio: false, lessons_autoplay_audio: false,
        lessons_batch_size: 1, lessons_presentation_order: 'ascending_level_then_subject', reviews_autoplay_audio: false,
        reviews_display_srs_indicator: true, reviews_presentation_order: 'lower_levels_first' } } };
  const scenario: Scenario = { name, seed, now: now.toISOString(), runId: `${name}-${seed}-${now.toISOString()}`, user,
    subjects, assignments: [], reviewStatistics: [], studyMaterials: [], levelProgressions: [], answers: {}, targets: [] };
  const passed = new Set(subjects.filter(s => s.data.level < preset.level ||
    (s.data.level === preset.level && s.object === 'radical' && s.id % 1000 <= 5)).map(s => s.id));
  const eligible = subjects.filter(s => s.data.level <= preset.level && prerequisites(s).every(id => passed.has(id)));
  const transition = ['level-up', 'subscription-cap', 'final-level'].includes(name);
  const lessonPool = eligible.filter(s => (s.data.level === preset.level || s.object === 'vocabulary' || s.object === 'kana_vocabulary') &&
    (!transition || s.object === 'vocabulary' || s.object === 'kana_vocabulary'));
  const lessons = new Set<number>();
  for (let index = 0; lessons.size < preset.lessons; index += 1) {
    const type = (['radical', 'kanji', 'vocabulary', 'kana_vocabulary'] as const)[index % 4]!;
    const next = lessonPool.find(s => s.object === type && !lessons.has(s.id) && !(s.object === 'radical' && passed.has(s.id)));
    if (next) lessons.add(next.id);
    if (index > subjects.length * 4) throw new Error('Requested lessons are not reachable');
  }
  const reviewPool = eligible.filter(s => !lessons.has(s.id) && s.data.level < preset.level);
  const reviewOrder: SubjectResource[] = [];
  const remaining = [...reviewPool];
  for (let index = 0; remaining.length; index += 1) {
    const type = (['radical', 'kanji', 'vocabulary', 'kana_vocabulary'] as const)[index % 4]!;
    const at = remaining.findIndex(subject => subject.object === type);
    if (at >= 0) reviewOrder.push(...remaining.splice(at, 1));
  }
  const dueIds = new Set(reviewOrder.slice(0, preset.reviews).map(s => s.id));
  const futureIds = new Set(reviewOrder.slice(preset.reviews, preset.reviews + preset.future).map(s => s.id));
  if (dueIds.size !== preset.reviews) throw new Error('Requested reviews are not reachable');
  const historicalPasses = new Set<number>();
  for (const s of subjects) {
    const unlocked = s.data.level <= preset.level && prerequisites(s).every(id => historicalPasses.has(id));
    const studied = unlocked && !lessons.has(s.id);
    const stage = studied ? (dueIds.has(s.id) || futureIds.has(s.id) ? 5 : 9) : 0;
    if (stage >= 5) historicalPasses.add(s.id);
    scenario.assignments.push(resource(100_000 + s.id, 'assignment', {
      subject_id: s.id, subject_type: s.object, created_at: timestamp, hidden: false,
      unlocked_at: unlocked ? timestamp : null, started_at: studied ? timestamp : null,
      passed_at: stage >= 5 ? timestamp : null, burned_at: stage === 9 ? timestamp : null, resurrected_at: null, srs_stage: stage,
      available_at: studied && stage < 9 ? (dueIds.has(s.id) ? timestamp : new Date(now.getTime() + (futureIds.has(s.id) ? 3_600_000 : 172_800_000)).toISOString()) : null,
    }, timestamp));
    scenario.answers[s.id] = { meaning: s.data.meanings[0]!.meaning,
      ...('readings' in s.data ? { reading: s.data.readings[0]!.reading } : {}) };
    if (studied) scenario.reviewStatistics.push(resource(200_000 + s.id, 'review_statistic', {
      subject_id: s.id, subject_type: s.object, created_at: timestamp, hidden: false,
      meaning_correct: 1, meaning_incorrect: 0, meaning_current_streak: 1, meaning_max_streak: 1,
      reading_correct: 'readings' in s.data ? 1 : 0, reading_incorrect: 0, reading_current_streak: 1, reading_max_streak: 1, percentage_correct: 100,
    }, timestamp));
  }
  for (let level = 1; level <= preset.level; level += 1) scenario.levelProgressions.push(resource(300_000 + level, 'level_progression', {
    level, created_at: timestamp, unlocked_at: timestamp, started_at: timestamp,
    passed_at: level < preset.level ? timestamp : null, completed_at: null, abandoned_at: null,
  }, timestamp));
  if (transition) {
    // Current kanji could only have been studied after their radicals first passed.
    scenario.assignments = scenario.assignments.map(a => a.data.subject_type === 'radical' && Math.floor(a.data.subject_id / 1000) === preset.level ?
      { ...a, data: { ...a.data, started_at: timestamp, passed_at: timestamp, burned_at: timestamp, srs_stage: 9, available_at: null } } : a);
    const kanji = scenario.assignments.filter(a => a.data.subject_type === 'kanji' && Math.floor(a.data.subject_id / 1000) === preset.level);
    scenario.assignments = scenario.assignments.map(a => {
      if (!kanji.includes(a)) return a;
      const index = kanji.indexOf(a);
      return { ...a, data: { ...a.data, unlocked_at: timestamp, started_at: timestamp, srs_stage: index < 8 ? 5 : 4,
        passed_at: index < 8 ? timestamp : null, burned_at: null, available_at: index === 8 ? timestamp : new Date(now.getTime() + 172_800_000).toISOString() } };
    });
    // Remove the general preset due item: the targeted stage-4 kanji is this scenario's only review.
    scenario.assignments = scenario.assignments.map(a => dueIds.has(a.data.subject_id) ? { ...a, data: { ...a.data, available_at: new Date(now.getTime() + 172_800_000).toISOString() } } : a);
    scenario.targets = [kanji[8]!.id];
  }
  if (name === 'prerequisite') {
    const radicals = scenario.assignments.filter(a => a.data.subject_type === 'radical' && Math.floor(a.data.subject_id / 1000) === preset.level).slice(5, 7);
    scenario.targets = radicals.map(a => a.id);
    scenario.dependentId = preset.level * 1000 + 16;
    scenario.assignments = scenario.assignments.map(a => radicals.includes(a) ? { ...a, data: { ...a.data, unlocked_at: timestamp,
      started_at: timestamp, passed_at: null, burned_at: null, srs_stage: 4, available_at: timestamp } } : { ...a, data: { ...a.data,
      available_at: a.data.started_at === null ? null : new Date(now.getTime() + 172_800_000).toISOString() } });
  }
  // Apply scenario-specific histories before deriving dependent locks. Non-workload history is burned.
  for (const subject of subjects) {
    const index = scenario.assignments.findIndex(a => a.data.subject_id === subject.id);
    const a = scenario.assignments[index]!;
    const canUnlock = subject.data.level <= Math.min(preset.level, cap) && prerequisites(subject).every(id =>
      scenario.assignments.some(p => p.data.subject_id === id && p.data.passed_at !== null));
    if (!canUnlock) scenario.assignments[index] = { ...a, data: { ...a.data, unlocked_at: null, started_at: null,
      passed_at: null, burned_at: null, available_at: null, srs_stage: 0 } };
    else if (a.data.unlocked_at === null) scenario.assignments[index] = { ...a, data: { ...a.data,
      unlocked_at: timestamp, started_at: lessons.has(subject.id) ? null : timestamp,
      passed_at: lessons.has(subject.id) ? null : timestamp, burned_at: lessons.has(subject.id) ? null : timestamp,
      available_at: null, srs_stage: lessons.has(subject.id) ? 0 : 9 } };
  }
  scenario.reviewStatistics = scenario.reviewStatistics.filter(statistic => scenario.assignments.some(a =>
    a.data.subject_id === statistic.data.subject_id && a.data.started_at !== null));
  // Targeted current-level review cases need stable statistic identity too.
  for (const id of scenario.targets) {
    const a = scenario.assignments.find(x => x.id === id)!;
    if (!scenario.reviewStatistics.some(s => s.data.subject_id === a.data.subject_id)) scenario.reviewStatistics.push(resource(200_000 + a.data.subject_id,
      'review_statistic', { subject_id: a.data.subject_id, subject_type: a.data.subject_type, created_at: timestamp, hidden: false,
        meaning_correct: 3, meaning_incorrect: 0, meaning_current_streak: 3, meaning_max_streak: 3,
        reading_correct: a.data.subject_type === 'kanji' ? 3 : 0, reading_incorrect: 0, reading_current_streak: 3, reading_max_streak: 3, percentage_correct: 100 }, timestamp));
  }
  return scenario;
}
