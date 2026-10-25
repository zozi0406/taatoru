import type { DatabaseTransaction } from '@/db/Database';

/** Control counters deliberately survive teardown so old callbacks stay fenced. */
export async function clearAccountData(tx: DatabaseTransaction): Promise<void> {
  for (const table of [
    'assignments', 'pending_progress', 'pending_study_materials',
    'study_materials', 'review_statistics', 'audio_urls', 'subject_progress',
    'subjects_fts', 'subjects', 'voice_actors', 'level_progressions', 'user',
    'recent_mistakes', 'sync_errors', 'active_sessions', 'sync_dispatches', 'sync_outcomes',
  ]) await tx.run(`DELETE FROM ${table}`);
  await tx.run(`UPDATE sync_state SET
    assignments_updated_at = NULL, study_materials_updated_at = NULL,
    subjects_updated_at = NULL, voice_actors_updated_at = NULL,
    review_statistics_updated_at = NULL, last_full_sync_at = NULL, last_sync_at = NULL
    WHERE id = 1`);
}
