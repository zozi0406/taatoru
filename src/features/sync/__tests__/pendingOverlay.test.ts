import { AssignmentRepository } from '@/db/repositories/AssignmentRepository';
import { DerivedRepository } from '@/db/repositories/DerivedRepository';
import { StudyMaterialRepository } from '@/db/repositories/StudyMaterialRepository';
import { SubjectRepository } from '@/db/repositories/SubjectRepository';
import { assignmentFixture, kanjiFixture, studyMaterialFixture } from '@/fixtures/api';
import { loadSubjectDetails } from '@/features/subjects/subjectDetails';
import { SYNC_NOW, syncDatabase, syncResources } from '@/test/sync/fixtures';
import { PendingWriteRepository } from '../PendingWriteRepository';
import { SyncRepository } from '../SyncRepository';

test.each(['quick', 'full'] as const)('%s refresh preserves unuploaded review and effective SRS state', async (mode) => {
  const db = await syncDatabase();
  try {
    await new PendingWriteRepository(db).completeReview({
      assignmentId: 501, subjectId: 201, completedAt: SYNC_NOW,
      incorrectMeaningAnswers: 0, incorrectReadingAnswers: 0,
    });
    if (mode === 'quick') await new AssignmentRepository(db).replaceAssignments([assignmentFixture], null);
    else await new SyncRepository(db).replaceFullRefresh(syncResources(), SYNC_NOW);
    expect(await new DerivedRepository(db).getAvailableReviews(SYNC_NOW)).toEqual([]);
    expect(await db.first('SELECT srs_stage FROM subject_progress WHERE subject_id = 201'))
      .toEqual({ srs_stage: 3 });
    expect(await db.first('SELECT COUNT(*) AS n FROM pending_progress')).toEqual({ n: 1 });
    const details = await loadSubjectDetails(db, 201, { includeSimilarAboveLevel: false });
    expect(details.assignment).toMatchObject({ srsStage: 3, availableAt: null });
  } finally { await db.close(); }
});

test.each(['material', 'subject', 'full'] as const)('%s refresh retains pending notes and searchable synonyms', async (mode) => {
  const db = await syncDatabase();
  try {
    await new PendingWriteRepository(db).queueStudyMaterial({
      subjectId: 201, meaningNote: 'local note', readingNote: null,
      meaningSynonyms: ['singleton'], queuedAt: SYNC_NOW,
    });
    if (mode === 'material') await new StudyMaterialRepository(db).replaceStudyMaterials([studyMaterialFixture], null);
    else if (mode === 'subject') await new SubjectRepository(db).replaceSubjects([kanjiFixture], null);
    else await new SyncRepository(db).replaceFullRefresh(syncResources(), SYNC_NOW);
    expect(await db.first('SELECT meaning_note FROM study_materials WHERE subject_id = 201'))
      .toEqual({ meaning_note: 'local note' });
    expect(await db.all(`SELECT subject_id FROM subjects_fts WHERE subjects_fts MATCH 'singleton'`))
      .toEqual([{ subject_id: 201 }]);
  } finally { await db.close(); }
});
