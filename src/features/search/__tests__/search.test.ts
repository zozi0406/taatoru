import type { Resource, SubjectResource, UserData } from '@/api/types';
import { migrateDatabase } from '@/db/migrate';
import { NodeTestDatabase } from '@/db/NodeTestDatabase';
import { ResourceRepository } from '@/db/repositories/ResourceRepository';
import { StudyMaterialRepository } from '@/db/repositories/StudyMaterialRepository';
import { SubjectRepository } from '@/db/repositories/SubjectRepository';
import {
  kanaVocabularyFixture,
  kanjiFixture,
  studyMaterialFixture,
  userFixture,
  vocabularyFixture,
} from '@/fixtures/api';
import { romajiToKana } from '../kana';
import { searchSubjects } from '../search';

test.each([
  ['hitotsu', 'ひとつ'],
  ['gakkou', 'がっこう'],
  ['kanji', 'かんじ'],
  ['ryuu', 'りゅう'],
  ["shin'you", 'しんよう'],
  ['maccha', 'まっちゃ'],
] as const)('converts %s to hiragana', (romaji, kana) => {
  expect(romajiToKana(romaji)).toEqual({ text: kana, complete: true });
});

test('finds local subjects and ranks exact matches before stable level order', async () => {
  const db = await searchDatabase();
  try {
    await expect(searchSubjects(db, '一', 50)).resolves.toEqual([
      expect.objectContaining({ id: 201 }),
      expect.objectContaining({ id: 301 }),
      expect.objectContaining({ id: 302 }),
    ]);
    await expect(searchSubjects(db, 'one', 50)).resolves.toEqual([
      expect.objectContaining({ id: 201 }),
      expect.objectContaining({ id: 301 }),
      expect.objectContaining({ id: 302 }),
    ]);
  } finally {
    await db.close();
  }
});

test('matches romaji readings and user synonyms without a network request', async () => {
  const db = await searchDatabase();
  try {
    await expect(searchSubjects(db, 'hitotsu', 50)).resolves.toEqual([
      expect.objectContaining({ id: 301, primaryReading: 'ひとつ' }),
    ]);
    await expect(searchSubjects(db, 'single', 50)).resolves.toEqual([
      expect.objectContaining({ id: 201, primaryMeaning: 'One' }),
    ]);
    await expect(searchSubjects(db, 'oyatsu', 50)).resolves.toEqual([
      expect.objectContaining({
        id: kanaVocabularyFixture.id,
        object: 'kana_vocabulary',
        primaryReading: 'おやつ',
      }),
    ]);
  } finally {
    await db.close();
  }
});

test('returns nothing for empty queries and applies the result cap', async () => {
  const db = await searchDatabase();
  try {
    await expect(searchSubjects(db, '   ', 1)).resolves.toEqual([]);
    await expect(searchSubjects(db, '%', 50)).resolves.toEqual([]);
    const results = await searchSubjects(db, 'one', 2);
    expect(results).toHaveLength(2);
    expect(results.map(({ id }) => id)).toEqual([201, 301]);
  } finally {
    await db.close();
  }
});

test('limits search results to max_level_granted', async () => {
  const db = await searchDatabase();
  try {
    const users = new ResourceRepository(db);
    await users.replaceUser(userWithMaxLevel(3));
    await expect(searchSubjects(db, 'one', 50)).resolves.toEqual([
      expect.objectContaining({ id: 201 }),
      expect.objectContaining({ id: 301 }),
    ]);

    await users.replaceUser(userWithMaxLevel(60));
    await expect(searchSubjects(db, 'one', 50)).resolves.toEqual([
      expect.objectContaining({ id: 201 }),
      expect.objectContaining({ id: 301 }),
      expect.objectContaining({ id: 302 }),
    ]);
  } finally {
    await db.close();
  }
});

async function searchDatabase(): Promise<NodeTestDatabase> {
  const db = await NodeTestDatabase.open();
  await migrateDatabase(db);
  await new ResourceRepository(db).replaceUser(userFixture);
  await new SubjectRepository(db).replaceSubjects(
    [
      kanjiFixture,
      kanaVocabularyFixture,
      { ...vocabularyFixture, data: { ...vocabularyFixture.data, level: 2 } },
      subject(vocabularyFixture, 302, 4, '一人', 'One Person', 'ひとり'),
    ],
    null,
  );
  await new StudyMaterialRepository(db).replaceStudyMaterials(
    [studyMaterialFixture],
    null,
  );
  return db;
}

function subject(
  source: SubjectResource,
  id: number,
  level: number,
  characters: string,
  meaning: string,
  reading: string,
): SubjectResource {
  if (source.object !== 'vocabulary') {
    throw new Error('Expected a vocabulary fixture');
  }
  return {
    ...source,
    id,
    data: {
      ...source.data,
      characters,
      level,
      lesson_position: id,
      meanings: [
        { meaning, primary: true, accepted_answer: true },
      ],
      pronunciation_audios: source.data.pronunciation_audios.map((audio) => ({
        ...audio,
        url: `${audio.url}?subject=${id}`,
      })),
      readings: [
        { reading, primary: true, accepted_answer: true },
      ],
      slug: characters,
    },
  };
}

function userWithMaxLevel(
  maxLevelGranted: number,
): Resource<UserData, 'user'> {
  const fullAccess = maxLevelGranted === 60;
  return {
    ...userFixture,
    data: {
      ...userFixture.data,
      subscription: {
        ...userFixture.data.subscription,
        active: fullAccess,
        max_level_granted: maxLevelGranted,
        period_ends_at: fullAccess
          ? userFixture.data.subscription.period_ends_at
          : null,
        type: fullAccess ? 'recurring' : 'free',
      },
    },
  };
}
