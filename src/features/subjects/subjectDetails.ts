import type { SubjectResource } from '@/api/types';
import type { Database } from '@/db/Database';
import { SUBJECT_WITHIN_GRANTED_LEVEL } from '@/db/subscription';
import type { SimilarKanjiSubject } from './similarKanji';
import { resolveSimilarKanji } from './similarKanji';

export interface RelatedSubject {
  readonly id: number;
  readonly object: SubjectResource['object'];
  readonly level: number;
  readonly characters: string | null;
  readonly primaryMeaning: string;
  readonly primaryReading: string | null;
}

export interface SubjectAssignmentDetails {
  readonly srsStage: number;
  readonly availableAt: string | null;
  readonly burnedAt: string | null;
  readonly passedAt: string | null;
  readonly startedAt: string | null;
}

export interface SubjectReviewStatistics {
  readonly meaningCorrect: number;
  readonly meaningIncorrect: number;
  readonly percentageCorrect: number;
  readonly readingCorrect: number;
  readonly readingIncorrect: number;
}

export interface SubjectStudyMaterial {
  readonly meaningNote: string | null;
  readonly meaningSynonyms: readonly string[];
  readonly readingNote: string | null;
}

export interface SubjectAudio {
  readonly pronunciation: string;
  readonly url: string;
  readonly voiceActorName: string;
}

export interface SubjectDetailsSnapshot {
  readonly subject: SubjectResource;
  readonly meanings: readonly string[];
  readonly readings: readonly string[];
  readonly assignment: SubjectAssignmentDetails | null;
  readonly reviewStatistics: SubjectReviewStatistics | null;
  readonly studyMaterial: SubjectStudyMaterial;
  readonly audio: readonly SubjectAudio[];
  readonly components: readonly RelatedSubject[];
  readonly amalgamations: readonly RelatedSubject[];
  readonly similarKanji: readonly SimilarKanjiSubject[];
}

interface SubjectDetailsOptions {
  readonly includeSimilarAboveLevel: boolean;
}

interface DetailsRow {
  readonly resourceJson: string;
  readonly srsStage: number | null;
  readonly availableAt: string | null;
  readonly burnedAt: string | null;
  readonly passedAt: string | null;
  readonly startedAt: string | null;
  readonly meaningCorrect: number | null;
  readonly meaningIncorrect: number | null;
  readonly percentageCorrect: number | null;
  readonly readingCorrect: number | null;
  readonly readingIncorrect: number | null;
  readonly meaningNote: string | null;
  readonly meaningSynonymsJson: string | null;
  readonly readingNote: string | null;
  readonly currentLevel: number | null;
}

interface RelatedRow {
  readonly id: number;
  readonly resourceJson: string;
}

interface AudioRow {
  readonly pronunciation: string;
  readonly url: string;
  readonly metadataJson: string;
}

export async function loadSubjectDetails(
  db: Database,
  subjectId: number,
  options: SubjectDetailsOptions,
): Promise<SubjectDetailsSnapshot> {
  const row = await db.first<DetailsRow>(
    `SELECT s.resource_json AS resourceJson,
            a.srs_stage AS srsStage,
            a.available_at AS availableAt,
            a.burned_at AS burnedAt,
            a.passed_at AS passedAt,
            a.started_at AS startedAt,
            rs.meaning_correct AS meaningCorrect,
            rs.meaning_incorrect AS meaningIncorrect,
            rs.percentage_correct AS percentageCorrect,
            rs.reading_correct AS readingCorrect,
            rs.reading_incorrect AS readingIncorrect,
            sm.meaning_note AS meaningNote,
            sm.meaning_synonyms_json AS meaningSynonymsJson,
            sm.reading_note AS readingNote,
            (SELECT level FROM user LIMIT 1) AS currentLevel
     FROM subjects s
     LEFT JOIN assignments a
       ON a.subject_id = s.id AND a.hidden = 0
     LEFT JOIN review_statistics rs
       ON rs.subject_id = s.id AND rs.hidden = 0
     LEFT JOIN study_materials sm
       ON sm.subject_id = s.id AND sm.hidden = 0
     WHERE s.id = ?
       AND s.hidden_at IS NULL
       AND ${SUBJECT_WITHIN_GRANTED_LEVEL}`,
    [subjectId],
  );
  if (row === null) {
    throw new Error(`Unknown subject ${subjectId}`);
  }
  const subject = parseSubject(row.resourceJson);
  const componentIds =
    'component_subject_ids' in subject.data
      ? subject.data.component_subject_ids
      : [];
  const amalgamationIds =
    'amalgamation_subject_ids' in subject.data
      ? subject.data.amalgamation_subject_ids
      : [];
  const similarIds =
    'visually_similar_subject_ids' in subject.data
      ? subject.data.visually_similar_subject_ids
      : [];
  const [components, amalgamations, similarKanji, audio] =
    await Promise.all([
      loadRelatedSubjects(db, componentIds),
      loadRelatedSubjects(db, amalgamationIds, true),
      resolveSimilarKanji(db, {
        ids: similarIds,
        currentLevel: row.currentLevel ?? subject.data.level,
        includeAboveLevel: options.includeSimilarAboveLevel,
      }),
      loadAudio(db, subjectId),
    ]);

  return {
    subject,
    meanings: [
      ...subject.data.meanings.map(({ meaning }) => meaning),
      ...subject.data.auxiliary_meanings
        .filter(({ type }) => type !== 'blacklist')
        .map(({ meaning }) => meaning),
    ],
    readings:
      'readings' in subject.data
        ? subject.data.readings.map(({ reading }) => reading)
        : subject.object === 'kana_vocabulary' &&
            subject.data.characters !== null
          ? [subject.data.characters]
          : [],
    assignment:
      row.srsStage === null
        ? null
        : {
            srsStage: row.srsStage,
            availableAt: row.availableAt,
            burnedAt: row.burnedAt,
            passedAt: row.passedAt,
            startedAt: row.startedAt,
          },
    reviewStatistics:
      row.percentageCorrect === null
        ? null
        : {
            meaningCorrect: row.meaningCorrect ?? 0,
            meaningIncorrect: row.meaningIncorrect ?? 0,
            percentageCorrect: row.percentageCorrect,
            readingCorrect: row.readingCorrect ?? 0,
            readingIncorrect: row.readingIncorrect ?? 0,
          },
    studyMaterial: {
      meaningNote: row.meaningNote,
      meaningSynonyms: parseStrings(row.meaningSynonymsJson),
      readingNote: row.readingNote,
    },
    audio,
    components,
    amalgamations,
    similarKanji,
  };
}

async function loadRelatedSubjects(
  db: Database,
  ids: readonly number[],
  sortByLevel = false,
): Promise<readonly RelatedSubject[]> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) {
    return [];
  }
  const rows = await db.all<RelatedRow>(
    `SELECT id, resource_json AS resourceJson
     FROM subjects s
     WHERE s.hidden_at IS NULL
       AND ${SUBJECT_WITHIN_GRANTED_LEVEL}
       AND s.id IN (${uniqueIds.map(() => '?').join(', ')})`,
    uniqueIds,
  );
  const byId = new Map(rows.map((row) => [row.id, parseSubject(row.resourceJson)]));
  const results = uniqueIds.flatMap((id) => {
    const subject = byId.get(id);
    return subject === undefined ? [] : [toRelatedSubject(subject)];
  });
  return sortByLevel
    ? results.sort(
        (left, right) => left.level - right.level || left.id - right.id,
      )
    : results;
}

async function loadAudio(
  db: Database,
  subjectId: number,
): Promise<readonly SubjectAudio[]> {
  const rows = await db.all<AudioRow>(
    `SELECT url,
            pronunciation,
            metadata_json AS metadataJson
     FROM audio_urls
     WHERE subject_id = ?
     ORDER BY voice_actor_id, content_type, url`,
    [subjectId],
  );
  const encountered = new Set<string>();
  return rows.flatMap((row) => {
    const voiceActorName = audioActorName(row.metadataJson);
    const key = `${row.pronunciation}\u0000${voiceActorName}`;
    if (encountered.has(key)) {
      return [];
    }
    encountered.add(key);
    return [{ ...row, voiceActorName }];
  });
}

function toRelatedSubject(subject: SubjectResource): RelatedSubject {
  const primaryMeaning =
    subject.data.meanings.find(({ primary }) => primary)?.meaning ??
    subject.data.meanings[0]?.meaning ??
    subject.data.slug;
  const primaryReading =
    'readings' in subject.data
      ? (subject.data.readings.find(({ primary }) => primary)?.reading ??
        subject.data.readings[0]?.reading ??
        null)
      : subject.object === 'kana_vocabulary'
        ? subject.data.characters
        : null;
  return {
    id: subject.id,
    object: subject.object,
    level: subject.data.level,
    characters: subject.data.characters,
    primaryMeaning,
    primaryReading,
  };
}

function parseSubject(resourceJson: string): SubjectResource {
  return JSON.parse(resourceJson) as SubjectResource;
}

function parseStrings(value: string | null): readonly string[] {
  if (value === null) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function audioActorName(metadataJson: string): string {
  try {
    const parsed: unknown = JSON.parse(metadataJson);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'voice_actor_name' in parsed &&
      typeof parsed.voice_actor_name === 'string'
    ) {
      return parsed.voice_actor_name;
    }
  } catch {
    //
  }
  return 'WaniKani voice actor';
}
