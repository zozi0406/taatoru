import type { Database } from '@/db/Database';
import { SUBJECT_WITHIN_GRANTED_LEVEL } from '@/db/subscription';

export interface SimilarKanjiSubject {
  readonly id: number;
  readonly level: number;
  readonly characters: string | null;
  readonly primaryMeaning: string;
}

interface SimilarKanjiOptions {
  readonly ids: readonly number[];
  readonly currentLevel: number;
  readonly includeAboveLevel: boolean;
}

interface SimilarKanjiRow {
  readonly id: number;
  readonly level: number;
  readonly characters: string | null;
  readonly resourceJson: string;
}

export async function resolveSimilarKanji(
  db: Database,
  options: SimilarKanjiOptions,
): Promise<readonly SimilarKanjiSubject[]> {
  const uniqueIds = [...new Set(options.ids)];
  if (uniqueIds.length === 0) {
    return [];
  }
  const placeholders = uniqueIds.map(() => '?').join(', ');
  const rows = await db.all<SimilarKanjiRow>(
    `SELECT id, level, characters, resource_json AS resourceJson
     FROM subjects s
     WHERE s.object = 'kanji'
       AND s.hidden_at IS NULL
       AND ${SUBJECT_WITHIN_GRANTED_LEVEL}
       AND s.id IN (${placeholders})`,
    uniqueIds,
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  const results: SimilarKanjiSubject[] = [];
  for (const id of uniqueIds) {
    const row = byId.get(id);
    if (
      row === undefined ||
      (!options.includeAboveLevel && row.level > options.currentLevel)
    ) {
      continue;
    }
    results.push({
      id: row.id,
      level: row.level,
      characters: row.characters,
      primaryMeaning: primaryMeaning(row.resourceJson),
    });
  }
  return results;
}

function primaryMeaning(resourceJson: string): string {
  try {
    const parsed: unknown = JSON.parse(resourceJson);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'data' in parsed &&
      typeof parsed.data === 'object' &&
      parsed.data !== null &&
      'meanings' in parsed.data &&
      Array.isArray(parsed.data.meanings)
    ) {
      const meanings = parsed.data.meanings.filter(
        (
          meaning,
        ): meaning is { readonly meaning: string; readonly primary?: boolean } =>
          typeof meaning === 'object' &&
          meaning !== null &&
          'meaning' in meaning &&
          typeof meaning.meaning === 'string',
      );
      return (
        meanings.find(({ primary }) => primary)?.meaning ??
        meanings[0]?.meaning ??
        ''
      );
    }
  } catch {
    //
  }
  return '';
}
