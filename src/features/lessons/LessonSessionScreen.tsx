import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { StudyAction } from '@/features/sessions/StudySubjectInformation';
import { useTheme } from '@/ui/theme/ThemeProvider';
import type { SubjectResource } from '@/api/types';
import {
  LessonAvailabilityChangedError,
  type LessonSessionSnapshot,
} from '@/features/sessions/SessionRepository';
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
  readonly restoring?: boolean;
  readonly initialSnapshot: LessonSessionSnapshot;
  readonly onCommitTransition: (transition: LessonTransition) => Promise<void>;
  readonly onExit: () => void;
  readonly onReload?: () => void;
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
  restoring = false,
  onCommitTransition,
  onExit,
  onReload,
  onFinish,
  onPlayAudio,
  subjects,
  settings = DEFAULT_STUDY_SETTINGS,
  studyMaterials = {},
  onAddSynonym,
  onSettings,
  onOpenSubject,
}: LessonSessionScreenProps) {
  const theme = useTheme();
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const presenting = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const playAudio = useStudyAudio(onPlayAudio);
  const [presentationBusy, setPresentationBusy] = useState(false);
  const [presentationError, setPresentationError] = useState<string | null>(
    null,
  );
  const types = Object.fromEntries(
    subjects.map((subject) => [subject.id, subject.object]),
  );
  const apply = async (type: Parameters<typeof reduceLesson>[1]['type'], afterPersist?: () => Promise<void>) => {
    if (!mounted.current) throw new Error('Lesson session is no longer active.');
    const result = reduceLesson(snapshot, { type }, types, settings);
    try {
      await onCommitTransition(result);
    } catch (failure) {
      if (failure instanceof LessonAvailabilityChangedError && mounted.current) {
        setAvailabilityError(failure.message);
      }
      throw failure;
    }
    if (!mounted.current) return;
    await afterPersist?.();
    if (!mounted.current) return;
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
    if (presenting.current || restoring) return;
    presenting.current = true;
    setPresentationBusy(true);
    setPresentationError(null);
    try {
      await apply(type);
    } catch {
      setPresentationError(
        'Unable to preserve lesson progress. Please try again.',
      );
    } finally {
      presenting.current = false;
      setPresentationBusy(false);
    }
  };
  if (availabilityError !== null) return (
    <View style={{
      flex: 1,
      justifyContent: 'center',
      padding: theme.spacing.xl,
      gap: theme.spacing.md,
      backgroundColor: theme.colors.canvas,
    }}>
      <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
        {availabilityError}
      </Text>
      {onReload === undefined ? null : (
        <StudyAction label="Reload lessons" onPress={onReload} />
      )}
      <StudyAction label="Return home" onPress={onExit} />
    </View>
  );
  if (snapshot.phase === 'complete')
    return (
      <StudyCompletion
        title="Lesson complete"
        count={snapshot.items.length}
        detail="New subjects added to Apprentice"
        finishLabel="Finish lessons"
        onFinish={async () => { if (!restoring) await onFinish(); }}
      />
    );
  const item = snapshot.items[snapshot.queuePosition];
  const subject = subjects.find(({ id }) => id === item?.subjectId);
  if (subject === undefined)
    return (
      <StudyCompletion
        title="Lesson needs attention"
        status="attention"
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
        busy={presentationBusy || restoring}
        error={presentationError}
        onExit={() => { if (!presenting.current && !restoring) onExit(); }}
        onSettings={onSettings === undefined ? undefined : () => { if (!presenting.current && !restoring) onSettings(); }}
        onOpenSubject={onOpenSubject === undefined ? undefined : (id) => { if (!presenting.current && !restoring) onOpenSubject(id); }}
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
      busy={actions.busy || restoring}
      error={actions.error}
      settings={settings}
      index={snapshot.quizState.completedSubjectIds.length}
      total={snapshot.items.length}
      subject={subject}
      prompt={prompt}
      onExit={() => { if (!restoring) actions.guard(onExit); }}
      onSettings={onSettings === undefined ? undefined : () => { if (!restoring) actions.guard(onSettings); }}
      onOpenSubject={onOpenSubject === undefined ? undefined : (id) => { if (!restoring) actions.guard(() => onOpenSubject(id)); }}
      onPlayAudio={playAudio}
      material={studyMaterials[subject.id]}
      onSubmit={(answer) =>
        !restoring && actions.submit(
          answer,
          prompt,
          subject,
          studyMaterials[subject.id]?.meaningSynonyms,
        )
      }
      onContinue={() => { if (!restoring) actions.continue(); }}
      onOverride={() => { if (!restoring) actions.override(); }}
      onSkip={() => { if (!restoring) actions.skip(); }}
      onRetrySave={() => { if (!restoring) actions.retrySave(); }}
      onAddSynonym={
        actions.addSynonym === undefined
          ? undefined
          : (answer) => { if (!restoring) actions.addSynonym!(subject.id, answer); }
      }
    />
  );
}
