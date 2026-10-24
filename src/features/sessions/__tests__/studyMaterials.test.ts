import { NodeTestDatabase } from '@/db/NodeTestDatabase';
import { migrateDatabase } from '@/db/migrate';
import { SubjectRepository } from '@/db/repositories/SubjectRepository';
import { StudyMaterialRepository } from '@/db/repositories/StudyMaterialRepository';
import { kanjiFixture, studyMaterialFixture } from '@/fixtures/api';
import { addStudySynonym, loadStudyMaterials } from '../studyMaterials';

test('adding a synonym preserves notes and queues one study-material write', async () => {
  const db = await NodeTestDatabase.open();
  await migrateDatabase(db);
  try {
    await new SubjectRepository(db).replaceSubjects([kanjiFixture], null);
    await new StudyMaterialRepository(db).replaceStudyMaterials(
      [studyMaterialFixture],
      null,
    );
    const before = (await loadStudyMaterials(db, [kanjiFixture.id]))[
      kanjiFixture.id
    ]!;
    await addStudySynonym(db, kanjiFixture.id, 'Unity');
    await addStudySynonym(db, kanjiFixture.id, 'unity');
    expect(
      (await loadStudyMaterials(db, [kanjiFixture.id]))[kanjiFixture.id],
    ).toEqual({
      ...before,
      meaningSynonyms: [...before.meaningSynonyms, 'Unity'],
    });
    expect(
      await db.first('SELECT COUNT(*) AS count FROM pending_study_materials'),
    ).toEqual({ count: 1 });
    expect(
      await db.first('SELECT COUNT(*) AS count FROM pending_progress'),
    ).toEqual({ count: 0 });
  } finally {
    await db.close();
  }
});
