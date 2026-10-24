import type { Database } from '@/db/Database';
import {
  type LessonSessionSnapshot,
  SessionRepository,
} from '@/features/sessions/SessionRepository';
import { loadLessonPickerItems } from './LessonPickerScreen';
import {
  buildAutomaticLessonQueue,
  type AutomaticLessonOptions,
} from './order';
import { loadStudySettings } from '@/features/settings/studySettings';

interface UserRow {
  readonly level: number;
  readonly resourceJson: string;
}

interface CountRow {
  readonly count: number;
}

export async function startAutomaticLessons(
  db: Database,
  now = new Date(),
): Promise<LessonSessionSnapshot | null> {
  const sessions = new SessionRepository(db);
  const existing = await sessions.loadLessonSession();
  if (existing !== null && existing.phase !== 'selection') return existing;
  const [candidates, options] = await Promise.all([
    loadLessonPickerItems(db),
    loadAutomaticLessonOptions(db),
  ]);
  const queue = buildAutomaticLessonQueue(candidates, options);
  return queue.length === 0 ? null : sessions.startLessonSession(queue, now);
}

export async function loadAutomaticLessonOptions(
  db: Database,
): Promise<AutomaticLessonOptions> {
  const [user, apprentice, preferences] = await Promise.all([
    db.first<UserRow>(
      `SELECT level, resource_json AS resourceJson FROM user LIMIT 1`,
    ),
    db.first<CountRow>(
      `SELECT COUNT(*) AS count
       FROM subject_progress
       WHERE srs_stage BETWEEN 1 AND 4`,
    ),
    loadStudySettings(db),
  ]);
  if (user === null) {
    throw new Error('Automatic lessons require a cached user');
  }
  return {
    apprenticeCount: apprentice?.count ?? 0,
    apprenticeLimit: preferences.apprenticeLimit ?? Number.POSITIVE_INFINITY,
    batchSize: preferences.lessonBatchSize,
    currentLevel: user.level,
    prioritizeCurrentLevel: preferences.prioritizeCurrentLevel,
    showKanaVocabulary: preferences.showKanaVocabulary,
    subjectOrder: preferences.lessonSubjectOrder,
  };
}
