import type {
  IdentifiedResource,
  SubjectData,
  SubjectObject,
} from '@/api/types';
import type { Database } from '../Database';

export class SubjectRepository {
  constructor(private readonly db: Database) {}

  replaceSubjects(
    resources: readonly IdentifiedResource<SubjectData, SubjectObject>[],
    cursor: string | null,
  ): Promise<void> {
    return this.db.transaction(async (tx) => {
      for (const resource of resources) {
        const data = resource.data;
        const readings =
          'readings' in data
            ? data.readings.map(({ reading }) => reading)
            : [];
        const meanings = [
          ...data.meanings.map(({ meaning }) => meaning),
          ...data.auxiliary_meanings.map(({ meaning }) => meaning),
        ];
        await tx.run(
          `INSERT INTO subjects (
            id, object, level, lesson_position, slug, characters,
            meanings_text, readings_text, hidden_at,
            visually_similar_subject_ids_json, data_updated_at, resource_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            object = excluded.object,
            level = excluded.level,
            lesson_position = excluded.lesson_position,
            slug = excluded.slug,
            characters = excluded.characters,
            meanings_text = excluded.meanings_text,
            readings_text = excluded.readings_text,
            hidden_at = excluded.hidden_at,
            visually_similar_subject_ids_json =
              excluded.visually_similar_subject_ids_json,
            data_updated_at = excluded.data_updated_at,
            resource_json = excluded.resource_json`,
          [
            resource.id,
            resource.object,
            data.level,
            data.lesson_position,
            data.slug,
            data.characters,
            meanings.join(' '),
            readings.join(' '),
            data.hidden_at,
            JSON.stringify(
              'visually_similar_subject_ids' in data
                ? data.visually_similar_subject_ids
                : [],
            ),
            resource.data_updated_at,
            JSON.stringify(resource),
          ],
        );
        await tx.run('DELETE FROM subjects_fts WHERE subject_id = ?', [
          resource.id,
        ]);
        await tx.run(
          `INSERT INTO subjects_fts (
            subject_id, characters, readings, meanings, synonyms
          ) VALUES (?, ?, ?, ?, '')`,
          [resource.id, data.characters ?? '', readings.join(' '), meanings.join(' ')],
        );
        await tx.run('DELETE FROM audio_urls WHERE subject_id = ?', [
          resource.id,
        ]);
        if ('pronunciation_audios' in data) {
          for (const audio of data.pronunciation_audios) {
            await tx.run(
              `INSERT INTO audio_urls (
                url, subject_id, voice_actor_id, content_type, pronunciation,
                metadata_json
              ) VALUES (?, ?, ?, ?, ?, ?)`,
              [
                audio.url,
                resource.id,
                audio.metadata.voice_actor_id,
                audio.content_type,
                audio.metadata.pronunciation,
                JSON.stringify(audio.metadata),
              ],
            );
          }
        }
      }
      await tx.run(
        'UPDATE sync_state SET subjects_updated_at = ? WHERE id = 1',
        [cursor],
      );
    });
  }
}
