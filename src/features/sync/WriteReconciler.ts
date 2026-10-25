import { ApiError } from '@/api/errors';
import type { WaniKaniApi } from '@/api/WaniKaniApi';
import type { AssignmentData, IdentifiedResource, ReviewStatisticData } from '@/api/types';
import type { Database } from '@/db/Database';
import type { OperationResolution, PendingProgressOperation } from './types';

interface ProgressSource {
  readonly assignment: IdentifiedResource<AssignmentData, 'assignment'>;
  readonly statistic: IdentifiedResource<ReviewStatisticData, 'review_statistic'> | null;
  readonly level: number;
}

/** Establish an opportunity from server state; transport success is not inferred. */
export class WriteReconciler {
  constructor(private readonly db: Database, private readonly api: WaniKaniApi) {}

  async reconcileProgress(operation: PendingProgressOperation, now: Date, signal?: AbortSignal): Promise<OperationResolution> {
    const attention = (reason: string): OperationResolution => ({ kind: 'attention', reason });
    const source = progressSource(operation.sourceJson);
    if (source === null || operation.operationKey === null) return attention('unknown-baseline');
    if (![operation.incorrectMeaningAnswers, operation.incorrectReadingAnswers]
      .every((value) => Number.isSafeInteger(value) && value >= 0)) return attention('invalid-counts');
    if (source.assignment.id !== operation.assignmentId || source.assignment.data.subject_id !== operation.subjectId)
      return attention('invalid-baseline');
    const reset = await this.db.first(
      `SELECT id FROM sync_resets WHERE confirmed_at IS NOT NULL
       AND julianday(confirmed_at) >= julianday(?) AND target_level <= ? LIMIT 1`, [operation.createdAt, source.level],
    );
    // A reset is a new opportunity, even when the account has re-levelled already.
    if (reset !== null) return attention('account-reset');
    const subject = await this.db.first<{ hidden: number }>('SELECT hidden_at IS NOT NULL AS hidden FROM subjects WHERE id = ?', [operation.subjectId]);
    const user = await this.db.first<{ max_level_granted: number }>('SELECT max_level_granted FROM user LIMIT 1');
    if (subject?.hidden || (user !== null && source.level > user.max_level_granted)) return attention('subject-unavailable');
    let assignment: IdentifiedResource<AssignmentData, 'assignment'>;
    try { assignment = await this.api.getAssignment(operation.assignmentId, signal); }
    catch (error) {
      if (error instanceof ApiError && error.status === 404) return attention('assignment-missing');
      throw error;
    }
    if (assignment.id !== operation.assignmentId || assignment.data.subject_id !== operation.subjectId)
      return attention('assignment-changed');
    const before = source.assignment.data;
    const after = assignment.data;
    if (after.hidden || after.unlocked_at === null) return attention('subject-unavailable');
    if (before.resurrected_at !== after.resurrected_at || before.unlocked_at !== after.unlocked_at)
      return attention('opportunity-changed');
    if (operation.kind === 'lesson_start') {
      if (after.started_at !== null) return { kind: 'superseded', receipt: { assignment }, reason: 'lesson-already-started' };
      if (before.started_at !== null || after.unlocked_at === null) return attention('lesson-unavailable');
    } else {
      const statistic = await this.api.findReviewStatistic(operation.subjectId, signal);
      const countersAdvanced = statistic !== null && counterTotal(statistic.data) >
        (source.statistic === null ? 0 : counterTotal(source.statistic.data));
      const cycleChanged = before.available_at !== after.available_at || after.burned_at !== null;
      if (countersAdvanced && cycleChanged)
        return { kind: 'superseded', receipt: { assignment, ...(statistic === null ? {} : { reviewStatistic: statistic }) }, reason: 'remote-progress-advanced' };
      if (before.srs_stage !== after.srs_stage || cycleChanged || countersAdvanced || after.started_at === null)
        return attention('opportunity-changed');
    }
    const skew = this.api.rateLimit.estimatedClockSkewMs;
    if (!Number.isFinite(Date.parse(operation.createdAt) + skew)) return attention('completion-time-invalid');
    const wire = operation.wireCreatedAt ?? new Date(Date.parse(operation.createdAt) + skew).toISOString();
    const time = Date.parse(wire);
    const earliest = Date.parse((operation.kind === 'review' ? before.available_at : before.unlocked_at) ?? '');
    if (!Number.isFinite(time) || !Number.isFinite(earliest) || time < earliest || time > now.getTime() + skew + 1_000)
      return attention('completion-time-invalid');
    return { kind: 'retry', wireCreatedAt: wire };
  }
}

function counterTotal(data: ReviewStatisticData): number {
  return data.meaning_correct + data.meaning_incorrect + data.reading_correct + data.reading_incorrect;
}

function progressSource(json: string | null): ProgressSource | null {
  if (json === null) return null;
  try {
    const value = JSON.parse(json) as ProgressSource;
    if (!Number.isInteger(value.level) || typeof value.assignment?.id !== 'number' ||
        typeof value.assignment.data?.srs_stage !== 'number' || !('statistic' in value)) return null;
    return value;
  } catch { return null; }
}
