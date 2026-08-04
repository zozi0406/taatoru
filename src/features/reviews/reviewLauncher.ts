import type { Database } from '@/db/Database';
import { DerivedRepository } from '@/db/repositories/DerivedRepository';
import {
  ReviewSessionRepository,
  type ReviewSessionSnapshot,
} from './ReviewSessionRepository';

const REVIEW_SESSION_LIMIT = 50;

export async function startReviewSession(
  db: Database,
  now = new Date(),
): Promise<ReviewSessionSnapshot | null> {
  const available = await new DerivedRepository(db).getAvailableReviews(now);
  const items = available
    .slice(0, REVIEW_SESSION_LIMIT)
    .map(({ assignmentId, subjectId }) => ({ assignmentId, subjectId }));
  return items.length === 0
    ? null
    : new ReviewSessionRepository(db).startReviewSession(items, now);
}
