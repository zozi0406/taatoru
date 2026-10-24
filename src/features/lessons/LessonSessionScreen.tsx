import { useState } from 'react';
import type { SubjectResource } from '@/api/types';
import type { LessonSessionSnapshot } from '@/features/sessions/SessionRepository';
import {
  DEFAULT_STUDY_SETTINGS,
  type StudySettings,
} from '@/features/settings/studySettings';
import type { SubjectStudyMaterial } from '@/features/subjects/subjectDetails';
import { useStudyAnswer } from '@/features/sessions/useStudyAnswer';
import { StudyCompletion } from '@/features/sessions/StudyCompletion';
import { useStudyAudio } from '@/features/sessions/useStudyAudio';
import { reduceLesson, type LessonTransition } from './lessonReducer';
import { LessonQuizStage } from './LessonQuizStage';
import { LessonSubjectStage } from './LessonSubjectStage';

interface LessonSessionScreenProps {
  readonly initialSnapshot: LessonSessionSnapshot;
  readonly onCommitTransition: (transition: LessonTransition) => Promise<void>;
  readonly onExit: () => void;
  readonly onFinish: () => Promise<void>;
  readonly onPlayAudio?: (url: string) => void;
  readonly subjects: readonly SubjectResource[];
  readonly settings?: StudySettings;
  readonly studyMaterials?: Readonly<Record<number, SubjectStudyMaterial>>;
  readonly onAddSynonym?: (subjectId: number, synonym: string) => Promise<void>;
  readonly onSettings?: () => void;
  readonly onOpenSubject?: (id: number) => void;
}

export function LessonSessionScreen({
  initialSnapshot,
  onCommitTransition,
  onExit,
  onFinish,
  onPlayAudio,
  subjects,
  settings = DEFAULT_STUDY_SETTINGS,
  studyMaterials = {},
  onAddSynonym,
  onSettings,
  onOpenSubject,
}: LessonSessionScreenProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const playAudio = useStudyAudio(onPlayAudio);
  const [presentationBusy, setPresentationBusy] = useState(false);
  const [presentationError, setPresentationError] = useState<string | null>(
    null,
  );
  const types = Object.fromEntries(
    subjects.map((subject) => [subject.id, subject.object]),
  );
  const apply = async (type: Parameters<typeof reduceLesson>[1]['type']) => {
    const result = reduceLesson(snapshot, { type }, types, settings);
    await onCommitTransition(result);
    setSnapshot(result.snapshot);
    const current = subjects.find(
      ({ id }) => id === snapshot.items[snapshot.queuePosition]?.subjectId,
    );
    if (
      type === 'correct' &&
      snapshot.quizState.currentPrompt === 'reading' &&
      settings.autoplay &&
      current !== undefined &&
      'pronunciation_audios' in current.data
    ) {
      const audio = current.data.pronunciation_audios[0];
      if (audio !== undefined) playAudio(audio.url);
    }
  };
  const actions = useStudyAnswer({
    settings,
    kind: 'lesson',
    onAddSynonym,
    apply,
  });
  const present = async (type: Parameters<typeof reduceLesson>[1]['type']) => {
    if (presentationBusy) return;
    setPresentationBusy(true);
    setPresentationError(null);
    try {
      await apply(type);
    } catch {
      setPresentationError(
        'Unable to preserve lesson progress. Please try again.',
      );
    } finally {
      setPresentationBusy(false);
    }
  };
  if (snapshot.phase === 'complete')
    return (
      <StudyCompletion
        title="Lesson complete"
        count={snapshot.items.length}
        detail="new subjects added to Apprentice"
        finishLabel="Finish lessons"
        onFinish={onFinish}
      />
    );
  const item = snapshot.items[snapshot.queuePosition];
  const subject = subjects.find(({ id }) => id === item?.subjectId);
  if (subject === undefined)
    return (
      <StudyCompletion
        title="Lesson needs attention"
        count={0}
        detail="This subject is no longer available. Return home to refresh your library."
        finishLabel="Return home"
        onFinish={async () => onExit()}
      />
    );
  if (snapshot.phase === 'presentation')
    return (
      <LessonSubjectStage
        key={subject.id}
        index={snapshot.queuePosition}
        total={snapshot.items.length}
        subject={subject}
        material={studyMaterials[subject.id]}
        onPlayAudio={playAudio}
        busy={presentationBusy}
        error={presentationError}
        onExit={onExit}
        onSettings={onSettings}
        onOpenSubject={onOpenSubject}
        onNext={() => {
          void present('advance-presentation');
        }}
        onPrevious={() => {
          void present('previous-presentation');
        }}
        onQuiz={() => {
          void present('start-quiz');
        }}
      />
    );
  const prompt = snapshot.quizState.currentPrompt;
  if (prompt === null) return null;
  return (
    <LessonQuizStage
      key={`${subject.id}-${prompt}-${actions.revision}`}
      feedback={actions.feedback}
      busy={actions.busy}
      error={actions.error}
      settings={settings}
      index={snapshot.quizState.completedSubjectIds.length}
      total={snapshot.items.length}
      subject={subject}
      prompt={prompt}
      onExit={onExit}
      onSettings={onSettings}
      onOpenSubject={onOpenSubject}
      onPlayAudio={playAudio}
      material={studyMaterials[subject.id]}
      onSubmit={(answer) =>
        actions.submit(
          answer,
          prompt,
          subject,
          studyMaterials[subject.id]?.meaningSynonyms,
        )
      }
      onContinue={actions.continue}
      onOverride={actions.override}
      onSkip={actions.skip}
      onRetrySave={actions.retrySave}
      onAddSynonym={
        actions.addSynonym === undefined
          ? undefined
          : (answer) => actions.addSynonym!(subject.id, answer)
      }
    />
  );
}
