import type { Database } from '@/db/Database';
import { DerivedRepository } from '@/db/repositories/DerivedRepository';
import { loadStudySettings } from '@/features/settings/studySettings';
import { firstStudyPrompt } from '@/features/sessions/studyScheduler';
import type { SubjectObject } from '@/api/types';
import { orderReviewItems } from './reviewOrder';
import {
  ReviewSessionRepository,
  type ReviewSessionSnapshot,
} from './ReviewSessionRepository';

export async function startReviewSession(
  db: Database,
  now = new Date(),
): Promise<ReviewSessionSnapshot | null> {
  const [available, settings, levels] = await Promise.all([
    new DerivedRepository(db).getAvailableReviews(now),
    loadStudySettings(db),
    db.all<{ id: number; level: number }>('SELECT id, level FROM subjects'),
  ]);
  const byId = new Map(levels.map(({ id, level }) => [id, level]));
  const ordered = orderReviewItems(
    available.map((item) => ({
      ...item,
      level: byId.get(item.subjectId) ?? 0,
    })),
    settings.reviewOrder,
  );
  const items = ordered
    .slice(0, settings.reviewLimit ?? undefined)
    .map(({ assignmentId, subjectId }) => ({ assignmentId, subjectId }));
  if (items.length === 0) return null;
  const repository = new ReviewSessionRepository(db);
  const started = await repository.startReviewSession(items, now);
  return repository.saveReviewSession(
    {
      ...started,
      questionProgress: {},
      currentPrompt: firstStudyPrompt(
        ordered[0]?.subjectType as SubjectObject,
        settings.questionOrder,
        items[0]?.subjectId,
      ),
    },
    now,
  );
}
