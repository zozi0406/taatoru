import {
  StudyQuestion,
  type StudyQuestionProps,
} from '@/features/sessions/StudyQuestion';

export function LessonQuizStage(props: StudyQuestionProps) {
  return (
    <StudyQuestion
      {...props}
      title="Lesson quiz"
      exitLabel="Exit lesson session"
    />
  );
}
