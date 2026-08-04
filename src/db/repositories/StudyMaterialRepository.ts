import type { IdentifiedResource, StudyMaterialData } from '@/api/types';
import type { Database } from '../Database';

export class StudyMaterialRepository {
  constructor(private readonly db: Database) {}

  replaceStudyMaterials(
    resources: readonly IdentifiedResource<
      StudyMaterialData,
      'study_material'
    >[],
    cursor: string | null,
  ): Promise<void> {
    return this.db.transaction(async (tx) => {
      for (const resource of resources) {
        const data = resource.data;
        await tx.run(
          `INSERT INTO study_materials (
            id, subject_id, subject_type, meaning_note, reading_note,
            meaning_synonyms_json, hidden, data_updated_at, resource_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(subject_id) DO UPDATE SET
            id = excluded.id,
            subject_id = excluded.subject_id,
            subject_type = excluded.subject_type,
            meaning_note = excluded.meaning_note,
            reading_note = excluded.reading_note,
            meaning_synonyms_json = excluded.meaning_synonyms_json,
            hidden = excluded.hidden,
            data_updated_at = excluded.data_updated_at,
            resource_json = excluded.resource_json`,
          [
            resource.id,
            data.subject_id,
            data.subject_type,
            data.meaning_note,
            data.reading_note,
            JSON.stringify(data.meaning_synonyms),
            data.hidden,
            resource.data_updated_at,
            JSON.stringify(resource),
          ],
        );
        await tx.run(
          'UPDATE subjects_fts SET synonyms = ? WHERE subject_id = ?',
          [data.meaning_synonyms.join(' '), data.subject_id],
        );
      }
      await tx.run(
        'UPDATE sync_state SET study_materials_updated_at = ? WHERE id = 1',
        [cursor],
      );
    });
  }
}
