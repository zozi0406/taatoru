// Copyright 2026 David Sansome
// Copyright 2026 Taatoru contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Modified by Taatoru from Tsurukame's SearchResultViewController.swift at
// revision 8e18ddf7f12c44e91cb0ad63bab31af7440648ea.

import type { SubjectResource } from '@/api/types';
import type { Database } from '@/db/Database';
import { romajiToKana } from './kana';

export interface SubjectSearchResult {
  readonly id: number;
  readonly object: SubjectResource['object'];
  readonly level: number;
  readonly lessonPosition: number;
  readonly characters: string | null;
  readonly primaryMeaning: string;
  readonly primaryReading: string | null;
}

interface SearchRow {
  readonly id: number;
  readonly level: number;
  readonly lessonPosition: number;
  readonly resourceJson: string;
  readonly meaningSynonymsJson: string | null;
}

interface RankedResult {
  readonly exact: boolean;
  readonly result: SubjectSearchResult;
}

export async function searchSubjects(
  db: Database,
  queryValue: string,
  limit: number,
): Promise<readonly SubjectSearchResult[]> {
  const query = normalize(queryValue.trim());
  const safeLimit = Math.max(0, Math.floor(limit));
  if (query.length === 0 || safeLimit === 0) {
    return [];
  }

  const kana = romajiToKana(query);
  const queryContains = `%${escapeLike(query)}%`;
  const queryPrefix = `${escapeLike(query)}%`;
  const kanaContains = `%${escapeLike(kana.text)}%`;
  const kanaPrefix = `${escapeLike(kana.text)}%`;
  const rows = await db.all<SearchRow>(
    `SELECT s.id,
            s.level,
            s.lesson_position AS lessonPosition,
            s.resource_json AS resourceJson,
            sm.meaning_synonyms_json AS meaningSynonymsJson
     FROM subjects s
     LEFT JOIN study_materials sm
       ON sm.subject_id = s.id AND sm.hidden = 0
     WHERE s.hidden_at IS NULL
       AND (
         lower(COALESCE(s.characters, '')) LIKE ? ESCAPE '!'
         OR lower(COALESCE(s.characters, '')) LIKE ? ESCAPE '!'
         OR lower(s.meanings_text) LIKE ? ESCAPE '!'
         OR lower(s.readings_text) LIKE ? ESCAPE '!'
         OR lower(COALESCE(sm.meaning_synonyms_json, '')) LIKE ? ESCAPE '!'
       )
     ORDER BY s.level, s.lesson_position, s.id`,
    [
      queryPrefix,
      kanaPrefix,
      queryContains,
      kanaContains,
      queryContains,
    ],
  );
  const ranked: RankedResult[] = [];
  for (const row of rows) {
    const resource = parseSubject(row.resourceJson);
    if (resource === null) {
      continue;
    }
    const synonyms = parseStrings(row.meaningSynonymsJson);
    const match = matchSubject(resource, synonyms, query, kana);
    if (match !== null) {
      ranked.push({
        exact: match,
        result: toSearchResult(resource, row.lessonPosition),
      });
    }
  }

  ranked.sort((left, right) => {
    if (left.exact !== right.exact) {
      return left.exact ? -1 : 1;
    }
    return (
      left.result.level - right.result.level ||
      left.result.lessonPosition - right.result.lessonPosition ||
      left.result.id - right.result.id
    );
  });
  return ranked.slice(0, safeLimit).map(({ result }) => result);
}

function matchSubject(
  subject: SubjectResource,
  synonyms: readonly string[],
  query: string,
  kana: ReturnType<typeof romajiToKana>,
): boolean | null {
  const characters = normalize(subject.data.characters ?? '');
  const meanings = [
    ...subject.data.meanings.map(({ meaning }) => normalize(meaning)),
    ...subject.data.auxiliary_meanings.map(({ meaning }) => normalize(meaning)),
    ...synonyms.map(normalize),
  ];
  const readings =
    'readings' in subject.data
      ? subject.data.readings.map(({ reading }) => reading)
      : [subject.data.characters ?? ''];
  const exact =
    characters === query ||
    meanings.includes(query) ||
    (kana.complete && readings.includes(kana.text));
  const matches =
    exact ||
    characters.startsWith(query) ||
    meanings.some((meaning) => meaning.startsWith(query)) ||
    readings.some((reading) => reading.startsWith(kana.text));
  return matches ? exact : null;
}

function toSearchResult(
  subject: SubjectResource,
  lessonPosition: number,
): SubjectSearchResult {
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
    lessonPosition,
    characters: subject.data.characters,
    primaryMeaning,
    primaryReading,
  };
}

function parseSubject(value: string): SubjectResource | null {
  try {
    return JSON.parse(value) as SubjectResource;
  } catch {
    return null;
  }
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

function normalize(value: string): string {
  return value.trim().normalize('NFKC').toLowerCase();
}

function escapeLike(value: string): string {
  return value.replace(/[!%_]/g, (character) => `!${character}`);
}
