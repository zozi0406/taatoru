import type {
  AssignmentData,
  CollectionPage,
  LevelProgressionData,
  Resource,
  ReviewStatisticData,
  StudyMaterialData,
  SubjectData,
  SubjectObject,
  UserData,
  VoiceActorData,
} from './types';

export interface RateLimitSnapshot {
  readonly limit: 60;
  readonly requestsInServerMinute: number;
  readonly requestsRemaining: number;
  readonly resetAfterMs: number;
  readonly estimatedClockSkewMs: number;
}

export interface StartAssignmentInput {
  readonly assignmentId: number;
  readonly startedAt?: Date;
  readonly signal?: AbortSignal;
}

interface CreateReviewFields {
  readonly incorrectMeaningAnswers: number;
  readonly incorrectReadingAnswers: number;
  readonly createdAt?: Date;
  readonly signal?: AbortSignal;
}

export type CreateReviewInput = CreateReviewFields &
  (
    | {
        readonly assignmentId: number;
        readonly subjectId?: never;
      }
    | {
        readonly assignmentId?: never;
        readonly subjectId: number;
      }
  );

export interface StudyMaterialInput {
  readonly subjectId: number;
  readonly studyMaterialId?: number;
  readonly meaningNote: string | null;
  readonly readingNote: string | null;
  readonly meaningSynonyms: readonly string[];
  readonly signal?: AbortSignal;
}

export interface WaniKaniApi {
  getUser(signal?: AbortSignal): Promise<Resource<UserData, 'user'>>;
  getSubjects(
    updatedAfter: string | null,
    signal?: AbortSignal,
  ): Promise<CollectionPage<SubjectData, SubjectObject>>;
  getAssignments(
    updatedAfter: string | null,
    signal?: AbortSignal,
  ): Promise<CollectionPage<AssignmentData, 'assignment'>>;
  getStudyMaterials(
    updatedAfter: string | null,
    signal?: AbortSignal,
  ): Promise<CollectionPage<StudyMaterialData, 'study_material'>>;
  getLevelProgressions(
    signal?: AbortSignal,
  ): Promise<CollectionPage<LevelProgressionData, 'level_progression'>>;
  getVoiceActors(
    updatedAfter: string | null,
    signal?: AbortSignal,
  ): Promise<CollectionPage<VoiceActorData, 'voice_actor'>>;
  getReviewStatistics(
    updatedAfter: string | null,
    signal?: AbortSignal,
  ): Promise<CollectionPage<ReviewStatisticData, 'review_statistic'>>;
  startAssignment(input: StartAssignmentInput): Promise<void>;
  createReview(input: CreateReviewInput): Promise<void>;
  upsertStudyMaterial(input: StudyMaterialInput): Promise<void>;
  readonly rateLimit: RateLimitSnapshot;
}
