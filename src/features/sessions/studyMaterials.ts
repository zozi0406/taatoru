import type { Database } from '@/db/Database';
import type { SubjectStudyMaterial } from '@/features/subjects/subjectDetails';
import { PendingWriteRepository } from '@/features/sync/PendingWriteRepository';

export async function loadStudyMaterials(
  db: Database,
  subjectIds: readonly number[],
): Promise<Readonly<Record<number, SubjectStudyMaterial>>> {
  if (subjectIds.length === 0) return {};
  const rows = await db.all<{
    subjectId: number;
    meaningNote: string | null;
    readingNote: string | null;
    synonymsJson: string;
  }>(
    `SELECT subject_id AS subjectId, meaning_note AS meaningNote, reading_note AS readingNote,
      meaning_synonyms_json AS synonymsJson FROM study_materials WHERE hidden = 0 AND subject_id IN (${subjectIds.map(() => '?').join(',')})`,
    subjectIds,
  );
  return Object.fromEntries(
    rows.map((row) => [
      row.subjectId,
      {
        meaningNote: row.meaningNote,
        readingNote: row.readingNote,
        meaningSynonyms: JSON.parse(row.synonymsJson) as string[],
      },
    ]),
  );
}

export async function addStudySynonym(
  db: Database,
  subjectId: number,
  synonym: string,
): Promise<void> {
  if (synonym.trim() === '') throw new Error('A synonym cannot be empty');
  const material = (await loadStudyMaterials(db, [subjectId]))[subjectId];
  const synonyms = material?.meaningSynonyms ?? [];
  const exists = synonyms.some(
    (value) => value.toLowerCase() === synonym.trim().toLowerCase(),
  );
  await new PendingWriteRepository(db).queueStudyMaterial({
    subjectId,
    meaningNote: material?.meaningNote ?? null,
    readingNote: material?.readingNote ?? null,
    meaningSynonyms: exists ? synonyms : [...synonyms, synonym.trim()],
    queuedAt: new Date(),
  });
}
