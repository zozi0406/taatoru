import { assignmentFixture, collectionPage, kanjiFixture, reviewStatisticFixture,
  studyMaterialFixture, userFixture } from '@/fixtures/api';
import type { WaniKaniApi, CreateReviewInput, StartAssignmentInput, StudyMaterialInput } from '@/api/WaniKaniApi';
import type { MaterialReceipt, ProgressReceipt } from '@/api/types';

/** Controlled server state, shared by Node and Android fixture runners. */
export class FixtureSyncApi implements WaniKaniApi {
  assignment = assignmentFixture;
  statistic = reviewStatisticFixture;
  material: MaterialReceipt | null = studyMaterialFixture;
  user = userFixture;
  reviews: CreateReviewInput[] = [];
  materialWrites: StudyMaterialInput[] = [];
  rateLimit = { limit: 60 as const, requestsRemaining: 60, requestsInServerMinute: 0,
    resetAfterMs: 0, estimatedClockSkewMs: 0 };
  async getUser() { return this.user; }
  async getAssignment() { return this.assignment; }
  async getResets() { return collectionPage<import('@/api/types').ResetData, 'reset'>([]); }
  async getSubjects() { return collectionPage([kanjiFixture]); }
  async getAssignments() { return collectionPage([this.assignment]); }
  async getStudyMaterials() { return collectionPage(this.material === null ? [] : [this.material]); }
  async getLevelProgressions() { return collectionPage<import('@/api/types').LevelProgressionData, 'level_progression'>([]); }
  async getVoiceActors() { return collectionPage<import('@/api/types').VoiceActorData, 'voice_actor'>([]); }
  async getReviewStatistics() { return collectionPage([this.statistic]); }
  async findStudyMaterial() { return this.material; }
  async findReviewStatistic() { return this.statistic; }
  async startAssignment(input: StartAssignmentInput): Promise<ProgressReceipt> {
    this.assignment = { ...this.assignment, data_updated_at: '2026-10-24T14:00:00.000000Z', data: {
      ...this.assignment.data, srs_stage: 1, started_at: input.startedAt?.toISOString() ?? '2026-10-24T14:00:00Z',
      available_at: '2026-10-24T18:00:00Z',
    } };
    return { assignment: this.assignment };
  }
  async createReview(input: CreateReviewInput): Promise<ProgressReceipt> {
    this.reviews.push(input);
    this.assignment = { ...this.assignment, data_updated_at: '2026-10-24T14:00:00.000000Z',
      data: { ...this.assignment.data, srs_stage: 3, available_at: '2026-10-25T14:00:00.000000Z' } };
    this.statistic = { ...this.statistic, data_updated_at: '2026-10-24T14:00:00.000000Z',
      data: { ...this.statistic.data, meaning_correct: 9, reading_correct: 10 } };
    return { assignment: this.assignment, reviewStatistic: this.statistic };
  }
  async upsertStudyMaterial(input: StudyMaterialInput): Promise<MaterialReceipt> {
    this.materialWrites.push(input);
    this.material = { ...studyMaterialFixture, data_updated_at: '2026-10-24T14:00:00.000000Z',
      data: { ...studyMaterialFixture.data, meaning_note: input.meaningNote,
        reading_note: input.readingNote, meaning_synonyms: input.meaningSynonyms } };
    return this.material;
  }
}
