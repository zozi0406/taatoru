import { migrateDatabase } from '@/db/migrate';
import { NodeTestDatabase } from '@/db/NodeTestDatabase';
import {
  DEFAULT_STUDY_SETTINGS,
  loadStudySettings,
  saveStudySettings,
} from '../studySettings';

test('persists study customization and respects legacy lesson keys', async () => {
  const db = await NodeTestDatabase.open();
  await migrateDatabase(db);
  try {
    await db.run(
      "INSERT INTO settings (key, value) VALUES ('lessons.prioritizeCurrentLevel', 'true')",
    );
    expect((await loadStudySettings(db)).prioritizeCurrentLevel).toBe(true);
    const settings = {
      ...DEFAULT_STUDY_SETTINGS,
      exactMatch: true,
      questionOrder: 'reading-first' as const,
      reviewOrder: 'srs-ascending' as const,
      lessonBatchSize: 3,
      reviewLimit: 15,
      lessonSubjectOrder: ['vocabulary', 'kanji', 'radical'] as const,
    };
    await saveStudySettings(db, settings);
    expect(await loadStudySettings(db)).toEqual(settings);
  } finally {
    await db.close();
  }
});

test('invalid persisted values use safe defaults instead of breaking sessions', async () => {
  const db = await NodeTestDatabase.open();
  await migrateDatabase(db);
  try {
    for (const [key, value] of [
      ['lessons.batchSize', '-1'],
      ['reviews.questionOrder', 'unknown'],
      ['lessons.subjectOrder', '["invalid"]'],
      ['reviews.reviewLimit', 'NaN'],
    ]) {
      await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [
        key!,
        value!,
      ]);
    }
    expect(await loadStudySettings(db)).toEqual(DEFAULT_STUDY_SETTINGS);
  } finally {
    await db.close();
  }
});
