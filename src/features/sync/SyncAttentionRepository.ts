import type { Database } from '@/db/Database';
import type { AssignmentData, IdentifiedResource, MaterialReceipt, ProgressReceipt } from '@/api/types';
import { applyPendingState } from './PendingStateRepository';
import { SyncRepository, TransactionDatabase } from './SyncRepository';

export interface SavedChange {
  readonly operationKey: string;
  readonly revision: number;
  readonly subjectId: number;
  readonly title: string;
  readonly kind: 'progress' | 'material' | 'history';
  readonly state: string;
  readonly reason: string | null;
  readonly conflictJson: string | null;
  readonly incorrectMeaningAnswers: number | null;
  readonly incorrectReadingAnswers: number | null;
}

export class SyncAttentionRepository {
  constructor(private readonly db: Database) {}

  list(): Promise<readonly SavedChange[]> {
    return this.db.all<SavedChange>(`WITH changes AS (
      SELECT operation_key, revision, subject_id, 'progress' AS kind, delivery_state, last_error_kind, conflict_json FROM pending_progress
      UNION ALL SELECT operation_key, revision, subject_id, 'material', delivery_state, last_error_kind, conflict_json FROM pending_study_materials
      UNION ALL SELECT d.operation_key, d.revision, d.subject_id, 'history', 'uncertain', 'older-upload-unresolved', d.payload_json
        FROM sync_dispatches d WHERE d.queue_kind = 'material'
          AND NOT EXISTS(SELECT 1 FROM pending_study_materials p WHERE p.operation_key = d.operation_key)
          AND d.revision = (SELECT MAX(x.revision) FROM sync_dispatches x WHERE x.operation_key = d.operation_key)
    ) SELECT c.operation_key AS operationKey, c.revision, c.subject_id AS subjectId,
      COALESCE(s.characters, s.slug, 'Subject ' || c.subject_id) AS title, c.kind, c.delivery_state AS state,
      c.last_error_kind AS reason, c.conflict_json AS conflictJson,
      p.incorrect_meaning_answers AS incorrectMeaningAnswers, p.incorrect_reading_answers AS incorrectReadingAnswers
      FROM changes c LEFT JOIN subjects s ON s.id = c.subject_id
      LEFT JOIN pending_progress p ON p.operation_key = c.operation_key ORDER BY c.subject_id`);
  }

  async resolve(change: SavedChange, choice: 'retry' | 'discard' | 'use-remote'): Promise<void> {
    if (change.kind === 'history') {
      await this.db.transaction(async (tx) => {
        const dispatch = await tx.first<{ payload_json: string }>('SELECT payload_json FROM sync_dispatches WHERE operation_key = ? AND revision = ?', [change.operationKey, change.revision]);
        const pending = await tx.first('SELECT subject_id FROM pending_study_materials WHERE subject_id = ?', [change.subjectId]);
        if (dispatch === null || pending !== null) throw new Error('Saved upload history changed');
        if (choice === 'retry') return;
        if (choice !== 'discard') throw new Error('WaniKani is authoritative for materials');
        await tx.run('DELETE FROM sync_dispatches WHERE operation_key = ?', [change.operationKey]);
      });
      return;
    }
    const table = change.kind === 'progress' ? 'pending_progress' : 'pending_study_materials';
    await this.db.transaction(async (tx) => {
      const row = await tx.first<{ conflict_json: string | null }>(`SELECT conflict_json FROM ${table} WHERE operation_key = ? AND revision = ?`,
        [change.operationKey, change.revision]);
      if (row === null) throw new Error('This saved change has changed. Reload and try again.');
      const repository = new SyncRepository(new TransactionDatabase(tx));
      const cursors = (await repository.getStateSnapshot()).cursors;
      if (choice === 'retry') {
        await tx.run(`UPDATE ${table} SET delivery_state = 'queued', next_attempt_at = NULL
          WHERE operation_key = ? AND revision = ?`, [change.operationKey, change.revision]);
      } else {
        await tx.run(`DELETE FROM ${table} WHERE operation_key = ? AND revision = ?`, [change.operationKey, change.revision]);
        if (change.kind === 'progress') {
          const observed = choice === 'use-remote' && row.conflict_json !== null
            ? (JSON.parse(row.conflict_json) as { remote?: ProgressReceipt }).remote : undefined;
          if (observed !== undefined) {
            if (observed.assignment.data.subject_id !== change.subjectId) throw new Error('Review identity changed');
            await repository.replaceAssignments([observed.assignment], cursors.assignments);
            if (observed.reviewStatistic !== undefined) await repository.replaceReviewStatistics([observed.reviewStatistic], cursors.reviewStatistics);
          } else {
            const resource = await tx.first<{ resource_json: string }>('SELECT resource_json FROM assignments WHERE subject_id = ?', [change.subjectId]);
            if (resource !== null) await repository.replaceAssignments(
              [JSON.parse(resource.resource_json) as IdentifiedResource<AssignmentData, 'assignment'>], cursors.assignments);
            else await tx.run('DELETE FROM subject_progress WHERE subject_id = ?', [change.subjectId]);
          }
        } else {
          const cached = await tx.first<{ resource_json: string; id: number }>('SELECT resource_json, id FROM study_materials WHERE subject_id = ?', [change.subjectId]);
          const conflict = row.conflict_json === null ? null : JSON.parse(row.conflict_json) as { remote: MaterialReceipt | null };
          const remote = conflict !== null ? conflict.remote : cached !== null && cached.id > 0 ? JSON.parse(cached.resource_json) as MaterialReceipt : null;
          await tx.run('DELETE FROM study_materials WHERE subject_id = ?', [change.subjectId]);
          await tx.run("UPDATE subjects_fts SET synonyms = '' WHERE subject_id = ?", [change.subjectId]);
          if (remote !== null) await repository.replaceStudyMaterials([remote], cursors.studyMaterials);
        }
        await tx.run('DELETE FROM sync_dispatches WHERE operation_key = ?', [change.operationKey]);
        const epoch = (await tx.first<{ account_epoch: number }>('SELECT account_epoch FROM sync_control WHERE id = 1'))!.account_epoch;
        await tx.run(`INSERT INTO sync_outcomes (account_epoch, operation_key, revision, outcome, reason, occurred_at)
          VALUES (?, ?, ?, 'discarded', 'user-confirmed-local-discard', ?)`, [epoch, change.operationKey, change.revision, new Date().toISOString()]);
      }
      await applyPendingState(tx);
    });
  }
}
