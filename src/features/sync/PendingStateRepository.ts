import type { DatabaseTransaction } from '@/db/Database';

/** Effective local state is reapplied inside the importing transaction. */
export async function applyPendingState(tx: DatabaseTransaction): Promise<void> {
  await tx.run(`INSERT INTO subject_progress (
      subject_id, assignment_id, subject_type, level, srs_stage, started_at
    ) SELECT p.subject_id, a.id, s.object, s.level,
      json_extract(p.projection_json, '$.srsStage'),
      CASE WHEN p.operation_kind = 'lesson_start' THEN p.created_at ELSE a.started_at END
    FROM pending_progress p JOIN subjects s ON s.id = p.subject_id
    LEFT JOIN assignments a ON a.subject_id = p.subject_id
    WHERE p.projection_json IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM subject_progress sp WHERE sp.subject_id = p.subject_id)`);
  await tx.run(`UPDATE subject_progress SET
      srs_stage = COALESCE((SELECT json_extract(p.projection_json, '$.srsStage')
        FROM pending_progress p WHERE p.subject_id = subject_progress.subject_id), srs_stage),
      available_at = NULL,
      last_mistake_at = COALESCE((SELECT json_extract(p.projection_json, '$.lastMistakeAt')
        FROM pending_progress p WHERE p.subject_id = subject_progress.subject_id), last_mistake_at)
    WHERE EXISTS(SELECT 1 FROM pending_progress p WHERE p.subject_id = subject_progress.subject_id)`);

  await tx.run(`INSERT INTO study_materials (id, subject_id, subject_type,
      meaning_note, reading_note, meaning_synonyms_json, hidden, data_updated_at, resource_json)
    SELECT -p.subject_id, p.subject_id, s.object, p.meaning_note, p.reading_note,
      p.meaning_synonyms_json, 0, p.created_at, '{"local":true}'
    FROM pending_study_materials p JOIN subjects s ON s.id = p.subject_id
    WHERE NOT EXISTS(SELECT 1 FROM study_materials sm WHERE sm.subject_id = p.subject_id)`);
  await tx.run(`UPDATE study_materials SET
      meaning_note = (SELECT p.meaning_note FROM pending_study_materials p
        WHERE p.subject_id = study_materials.subject_id),
      reading_note = (SELECT p.reading_note FROM pending_study_materials p
        WHERE p.subject_id = study_materials.subject_id),
      meaning_synonyms_json = (SELECT p.meaning_synonyms_json FROM pending_study_materials p
        WHERE p.subject_id = study_materials.subject_id)
    WHERE EXISTS(SELECT 1 FROM pending_study_materials p WHERE p.subject_id = study_materials.subject_id)`);
  await tx.run(`UPDATE subjects_fts SET synonyms = COALESCE((
    SELECT group_concat(j.value, ' ') FROM study_materials sm,
      json_each(sm.meaning_synonyms_json) j
    WHERE sm.subject_id = subjects_fts.subject_id AND sm.hidden = 0), '')`);
}

export const NO_ACTIVE_PENDING_PROGRESS = `NOT EXISTS (
  SELECT 1 FROM pending_progress p WHERE p.subject_id = a.subject_id
)`;
