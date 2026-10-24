import type { AvailableAssignment } from '@/db/repositories/AssignmentRepository';
import type { ReviewOrder } from '@/features/settings/studySettings';

export function orderReviewItems<
  T extends AvailableAssignment & { readonly level: number },
>(items: readonly T[], order: ReviewOrder, random = Math.random): readonly T[] {
  const result = [...items];
  if (order === 'random') {
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j]!, result[i]!];
    }
    return result;
  }
  return result.sort((a, b) => {
    const time = (a.availableAt ?? '').localeCompare(b.availableAt ?? '');
    switch (order) {
      case 'newest-first':
        return -time || a.subjectId - b.subjectId;
      case 'lowest-level':
        return a.level - b.level || time || a.subjectId - b.subjectId;
      case 'highest-level':
        return b.level - a.level || time || a.subjectId - b.subjectId;
      case 'srs-ascending':
        return a.srsStage - b.srsStage || time || a.subjectId - b.subjectId;
      case 'srs-descending':
        return b.srsStage - a.srsStage || time || a.subjectId - b.subjectId;
      default:
        return time || a.subjectId - b.subjectId;
    }
  });
}
