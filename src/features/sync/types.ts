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

export interface AccountContext {
  readonly userId: string;
  readonly accountEpoch: number;
  readonly credentialRevision: number;
}

export interface SyncLease {
  readonly context: AccountContext;
  readonly ownerFence: number;
  readonly expiresAtMs: number;
}

export interface CredentialReservation {
  readonly transitionId: number;
  readonly credentialRevision: number;
  readonly credentialKey: string;
  readonly previousAccount: AccountContext | null;
}

export type RequestContext = SyncLease | CredentialReservation;
export type SyncTrigger = 'enqueue' | 'startup' | 'foreground' | 'reconnect'
  | 'manual' | 'credential-repair' | 'background';
export type PendingDeliveryState = 'queued' | 'in_flight' | 'uncertain' | 'rejected';

export interface QueueSummary {
  /** Total across all states, including future retries. */
  readonly pending: number;
  readonly uncertain: number;
  readonly rejected: number;
  readonly nextAttemptAt: string | null;
}
