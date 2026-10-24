import type { SubjectObject } from '@/api/types';
import type {
  StudySettings,
  QuestionOrder,
} from '@/features/settings/studySettings';
import type { ReviewPrompt } from '@/features/reviews/types';

export interface StudyQuestionProgress {
  readonly answeredMeaningSubjectIds?: readonly number[];
  readonly answeredReadingSubjectIds?: readonly number[];
}

interface StudyItem {
  readonly assignmentId: number;
  readonly subjectId: number;
}

export function firstStudyPrompt(
  type: SubjectObject | undefined,
  order: QuestionOrder,
  subjectId = 0,
): ReviewPrompt {
  if (type !== 'kanji' && type !== 'vocabulary') return 'meaning';
  return order === 'reading-first' || (order === 'mixed' && subjectId % 2 === 1)
    ? 'reading'
    : 'meaning';
}

/** Keep completed subjects before position; rotate only the unfinished active pool. */
export function advanceStudyQuestion<T extends StudyItem>({
  items,
  position,
  prompt,
  progress,
  types,
  options,
  event,
}: {
  readonly items: readonly T[];
  readonly position: number;
  readonly prompt: ReviewPrompt | null;
  readonly progress: StudyQuestionProgress;
  readonly types: Readonly<Record<number, SubjectObject>>;
  readonly options: Pick<
    StudySettings,
    'questionOrder' | 'reviewBatchSize' | 'incorrectAnswerDelay'
  >;
  readonly event: 'correct' | 'retry' | 'skip';
}) {
  const current = items[position];
  const meanings = new Set(progress.answeredMeaningSubjectIds ?? []);
  const readings = new Set(progress.answeredReadingSubjectIds ?? []);
  const updatedItems = [...items];
  let completedSubjectId: number | null = null;
  if (current !== undefined && prompt !== null) {
    if (event === 'skip') {
      meanings.delete(current.subjectId);
      readings.delete(current.subjectId);
    } else if (event === 'correct') {
      (prompt === 'meaning' ? meanings : readings).add(current.subjectId);
    }
    const hasReading =
      types[current.subjectId] === 'kanji' ||
      types[current.subjectId] === 'vocabulary';
    const complete =
      meanings.has(current.subjectId) &&
      (!hasReading || readings.has(current.subjectId));
    if (complete) {
      completedSubjectId = current.subjectId;
      position += 1;
    } else if (event !== 'correct' || options.questionOrder === 'mixed') {
      const delay =
        event === 'skip'
          ? items.length
          : event === 'retry'
            ? options.incorrectAnswerDelay
            : options.reviewBatchSize - 1;
      updatedItems.splice(position, 1);
      updatedItems.splice(
        Math.min(updatedItems.length, position + Math.max(0, delay)),
        0,
        current,
      );
    }
  }
  const next = updatedItems[position];
  let nextPrompt: ReviewPrompt | null = null;
  if (next !== undefined) {
    nextPrompt = meanings.has(next.subjectId)
      ? 'reading'
      : readings.has(next.subjectId)
        ? 'meaning'
        : firstStudyPrompt(
            types[next.subjectId],
            options.questionOrder,
            next.subjectId,
          );
  }
  return {
    items: updatedItems,
    position,
    prompt: nextPrompt,
    completedSubjectId,
    progress: {
      answeredMeaningSubjectIds: [...meanings],
      answeredReadingSubjectIds: [...readings],
    },
  };
}
