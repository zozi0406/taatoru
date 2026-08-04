import type { SubjectResource } from '@/api/types';
import { migrateDatabase } from '@/db/migrate';
import { NodeTestDatabase } from '@/db/NodeTestDatabase';
import { SubjectRepository } from '@/db/repositories/SubjectRepository';
import { kanjiFixture } from '@/fixtures/api';
import { resolveSimilarKanji } from '../similarKanji';

test('uses only API-provided similar subject ids in API order', async () => {
  const db = await NodeTestDatabase.open();
  await migrateDatabase(db);
  try {
    await new SubjectRepository(db).replaceSubjects(
      [
        kanji(9, 5, '九'),
        kanji(3, 8, '三'),
        kanji(1_000, 9, '千'),
        kanji(77, 2, '似'),
      ],
      null,
    );

    await expect(
      resolveSimilarKanji(db, {
        ids: [9, 3, 9, 1_000],
        currentLevel: 8,
        includeAboveLevel: false,
      }),
    ).resolves.toEqual([
      expect.objectContaining({ id: 9 }),
      expect.objectContaining({ id: 3 }),
    ]);
  } finally {
    await db.close();
  }
});

test('can include API-provided subjects above the current level', async () => {
  const db = await NodeTestDatabase.open();
  await migrateDatabase(db);
  try {
    await new SubjectRepository(db).replaceSubjects(
      [kanji(9, 5, '九'), kanji(1_000, 9, '千')],
      null,
    );

    await expect(
      resolveSimilarKanji(db, {
        ids: [9, 1_000],
        currentLevel: 8,
        includeAboveLevel: true,
      }),
    ).resolves.toEqual([
      expect.objectContaining({ id: 9 }),
      expect.objectContaining({ id: 1_000 }),
    ]);
  } finally {
    await db.close();
  }
});

function kanji(id: number, level: number, characters: string): SubjectResource {
  return {
    ...kanjiFixture,
    id,
    data: {
      ...kanjiFixture.data,
      characters,
      level,
      lesson_position: id,
      slug: characters,
    },
  };
}
