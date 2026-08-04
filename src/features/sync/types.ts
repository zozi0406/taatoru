export interface PendingWriteBudget {
  readonly requestsRemaining: number;
  readonly assignmentUnits: number;
  readonly subjectUnits: number;
  readonly fixedUnits: number;
  readonly progressIds: readonly number[];
  readonly studyMaterialIds: readonly number[];
}

export interface SelectedPendingWrites {
  readonly progressIds: readonly number[];
  readonly studyMaterialIds: readonly number[];
}

export interface RecentMistake {
  readonly subjectId: number;
  readonly mistakenAt: string;
}

export type ProgressOperationKind = 'lesson_start' | 'review';

export interface SrsProjectionInput {
  readonly kind: ProgressOperationKind;
  readonly currentSrsStage: number;
  readonly incorrectMeaningAnswers: number;
  readonly incorrectReadingAnswers: number;
  readonly now: Date;
}

export interface SrsProjection {
  readonly srsStage: number;
  readonly lastMistakeAt: string | null;
}
