import type { MaterialReceipt, SubjectResource } from '../../src/api/types';
import { prerequisites, resource, type Assignment, type Scenario } from './factory';

export class MockValidationError extends Error {
  constructor(message: string, readonly status = 422) { super(message); }
}

/** Authoritative fake account state. No app projection code is used as its oracle. */
export class MockWorld {
  private watermark: number;
  constructor(readonly scenario: Scenario, private readonly clock: () => number = () => Date.parse(scenario.now)) {
    this.watermark = Date.parse(scenario.now);
  }
  private stamp(): string { this.watermark = Math.max(this.watermark + 1, this.clock()); return new Date(this.watermark).toISOString(); }
  subject(id: number): SubjectResource {
    const subject = this.scenario.subjects.find(s => s.id === id);
    if (!subject) throw new MockValidationError('Unknown subject', 404);
    return subject;
  }
  assignment(id: number): Assignment {
    const assignment = this.scenario.assignments.find(a => a.id === id);
    if (!assignment) throw new MockValidationError('Unknown assignment', 404);
    return assignment;
  }
  private eligible(a: Assignment): boolean {
    const subject = this.subject(a.data.subject_id);
    return !a.data.hidden && subject.data.hidden_at === null &&
      subject.data.level <= Math.min(this.scenario.user.data.level, this.scenario.user.data.subscription.max_level_granted);
  }
  availableLessons(): Assignment[] {
    return this.scenario.assignments.filter(a => this.eligible(a) && a.data.unlocked_at !== null && a.data.started_at === null);
  }
  dueReviews(): Assignment[] {
    return this.scenario.assignments.filter(a => this.eligible(a) && a.data.srs_stage > 0 && a.data.srs_stage < 9 &&
      a.data.started_at !== null && a.data.available_at !== null && Date.parse(a.data.available_at) <= this.clock());
  }
  start(id: number, startedAt: string): Assignment {
    const a = this.assignment(id);
    if (!this.availableLessons().includes(a)) throw new MockValidationError('Assignment is not an available lesson');
    this.validateTime(startedAt, a.data.unlocked_at!);
    const stamp = this.stamp();
    const next = { ...a, data_updated_at: stamp, data: { ...a.data, started_at: startedAt, srs_stage: 1,
      available_at: new Date(this.clock() + 14_400_000).toISOString() } };
    this.replaceAssignment(next);
    return next;
  }
  review(id: number, meaning: number, reading: number, createdAt: string): { assignment: Assignment; reviewStatistic: Scenario['reviewStatistics'][number] } {
    const a = this.assignment(id);
    if (![meaning, reading].every(n => Number.isSafeInteger(n) && n >= 0)) throw new MockValidationError('Invalid error counts');
    if (!this.dueReviews().includes(a)) throw new MockValidationError('Assignment is not a due review');
    this.validateTime(createdAt, a.data.available_at!);
    const s = this.subject(a.data.subject_id);
    if (!('readings' in s.data) && reading !== 0) throw new MockValidationError('Subject has no reading question');
    const stamp = this.stamp();
    // Deliberately simple, documented test rule; not WaniKani's exact mistake penalty.
    const stage = meaning + reading > 0 ? Math.max(1, a.data.srs_stage - 1) : Math.min(9, a.data.srs_stage + 1);
    const next = { ...a, data_updated_at: stamp, data: { ...a.data, srs_stage: stage,
      passed_at: a.data.passed_at ?? (stage >= 5 ? createdAt : null), burned_at: stage === 9 ? createdAt : null,
      available_at: stage === 9 ? null : new Date(this.clock() + 14_400_000).toISOString() } };
    this.replaceAssignment(next);
    const previous = this.scenario.reviewStatistics.find(x => x.data.subject_id === s.id);
    const data = previous?.data ?? { subject_id: s.id, subject_type: s.object, created_at: stamp, hidden: false,
      meaning_correct: 0, meaning_incorrect: 0, meaning_current_streak: 0, meaning_max_streak: 0,
      reading_correct: 0, reading_incorrect: 0, reading_current_streak: 0, reading_max_streak: 0, percentage_correct: 100 };
    const correct = data.meaning_correct + 1 + data.reading_correct + ('readings' in s.data ? 1 : 0);
    const incorrect = data.meaning_incorrect + meaning + data.reading_incorrect + reading;
    const statistic = resource(previous?.id ?? 200_000 + s.id, 'review_statistic', { ...data,
      percentage_correct: Math.round(100 * correct / (correct + incorrect)),
      meaning_correct: data.meaning_correct + 1, meaning_incorrect: data.meaning_incorrect + meaning,
      reading_correct: data.reading_correct + ('readings' in s.data ? 1 : 0), reading_incorrect: data.reading_incorrect + reading,
      meaning_current_streak: meaning ? 0 : data.meaning_current_streak + 1,
      reading_current_streak: reading ? 0 : data.reading_current_streak + ('readings' in s.data ? 1 : 0),
      meaning_max_streak: Math.max(data.meaning_max_streak, meaning ? 0 : data.meaning_current_streak + 1),
      reading_max_streak: Math.max(data.reading_max_streak, reading ? 0 : data.reading_current_streak + ('readings' in s.data ? 1 : 0)),
    }, stamp);
    this.scenario.reviewStatistics = [...this.scenario.reviewStatistics.filter(x => x.id !== statistic.id), statistic];
    this.propagate(stamp);
    return { assignment: next, reviewStatistic: statistic };
  }
  private validateTime(timestamp: string, earliest: string): void {
    const time = Date.parse(timestamp);
    if (!Number.isFinite(time) || time < Date.parse(earliest) || time > this.clock() + 1000) throw new MockValidationError('Invalid completion time');
  }
  private replaceAssignment(a: Assignment): void {
    this.scenario.assignments = this.scenario.assignments.map(x => x.id === a.id ? a : x);
  }
  private propagate(stamp: string): void {
    const level = this.scenario.user.data.level;
    const kanji = this.scenario.subjects.filter(s => s.object === 'kanji' && s.data.level === level && !s.data.hidden_at);
    const passed = new Set(this.scenario.assignments.filter(a => a.data.passed_at !== null).map(a => a.data.subject_id));
    if (kanji.length && kanji.filter(k => passed.has(k.id)).length >= Math.ceil(kanji.length * .9)) {
      this.scenario.levelProgressions = this.scenario.levelProgressions.map(p => p.data.level === level && p.data.passed_at === null ?
        { ...p, data_updated_at: stamp, data: { ...p.data, passed_at: stamp } } : p);
      const max = Math.min(60, this.scenario.user.data.subscription.max_level_granted,
        Math.max(...this.scenario.subjects.map(s => s.data.level)));
      if (level < max) {
        this.scenario.user = { ...this.scenario.user, data_updated_at: stamp, data: { ...this.scenario.user.data, level: level + 1 } };
        this.scenario.levelProgressions.push(resource(300_000 + level + 1, 'level_progression', {
          level: level + 1, created_at: stamp, unlocked_at: stamp, started_at: stamp, passed_at: null, completed_at: null, abandoned_at: null,
        }, stamp));
      }
    }
    this.scenario.assignments = this.scenario.assignments.map(a => {
      const s = this.subject(a.data.subject_id);
      return a.data.unlocked_at === null && this.eligible(a) && prerequisites(s).every(id => passed.has(id)) ?
        { ...a, data_updated_at: stamp, data: { ...a.data, unlocked_at: stamp } } : a;
    });
  }
  makeDue(ids: readonly number[]): void {
    for (const id of ids) {
      const a = this.assignment(id);
      if (!a.data.started_at || a.data.burned_at) throw new MockValidationError('Only started, unburned assignments can become due');
      this.replaceAssignment({ ...a, data_updated_at: this.stamp(), data: { ...a.data, available_at: new Date(this.clock() - 1000).toISOString() } });
    }
  }
  material(subjectId: number, fields: { meaning_note: string | null; reading_note: string | null; meaning_synonyms: string[] }, id?: number): MaterialReceipt {
    const subject = this.subject(subjectId);
    if (![fields.meaning_note, fields.reading_note].every(v => v === null || typeof v === 'string') ||
      !Array.isArray(fields.meaning_synonyms) || !fields.meaning_synonyms.every(v => typeof v === 'string')) throw new MockValidationError('Invalid study material');
    const previous = this.scenario.studyMaterials.find(m => m.data.subject_id === subjectId);
    if (id === undefined && previous) throw new MockValidationError('Study material already exists');
    if (id !== undefined && previous?.id !== id) throw new MockValidationError('Unknown study material', 404);
    const stamp = this.stamp();
    const material = resource(previous?.id ?? 400_000 + subjectId, 'study_material', {
      ...fields, subject_id: subjectId, subject_type: subject.object, created_at: previous?.data.created_at ?? stamp, hidden: false,
    }, stamp);
    this.scenario.studyMaterials = [...this.scenario.studyMaterials.filter(m => m.id !== material.id), material];
    return material;
  }
  resources() {
    const collection = <T>(data: readonly T[]) => ({ object: 'collection' as const, url: 'http://127.0.0.1:8787/v2/fixtures',
      data, data_updated_at: new Date(this.watermark).toISOString(), total_count: data.length,
      pages: { next_url: null, previous_url: null, per_page: 1000 } });
    return { user: this.scenario.user, subjects: collection(this.scenario.subjects),
      assignments: collection(this.scenario.assignments.filter(a => a.data.unlocked_at !== null)),
      studyMaterials: collection(this.scenario.studyMaterials), reviewStatistics: collection(this.scenario.reviewStatistics),
      levelProgressions: collection(this.scenario.levelProgressions), voiceActors: collection<never>([]) };
  }
}
