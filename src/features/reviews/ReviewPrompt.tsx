import {
  StudyQuestion,
  type StudyQuestionProps,
} from '@/features/sessions/StudyQuestion';

export function ReviewPrompt(props: StudyQuestionProps) {
  return (
    <StudyQuestion {...props} title="Reviews" exitLabel="Exit review session" />
  );
}
