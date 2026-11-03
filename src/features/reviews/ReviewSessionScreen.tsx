import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { useTheme } from '@/ui/theme/ThemeProvider';
import type { SubjectResource } from '@/api/types';
import {
  DEFAULT_STUDY_SETTINGS,
  type StudySettings,
} from '@/features/settings/studySettings';
import type { SubjectStudyMaterial } from '@/features/subjects/subjectDetails';
import { useStudyAnswer } from '@/features/sessions/useStudyAnswer';
import {
  StudyCompletion,
  StudyResultSubject,
} from '@/features/sessions/StudyCompletion';
import { useStudyAudio } from '@/features/sessions/useStudyAudio';
import { ReviewPrompt } from './ReviewPrompt';
import type { ReviewSessionSnapshot } from './ReviewSessionRepository';
import { reduceReview, type ReviewTransition } from './reviewReducer';

interface ReviewSessionScreenProps {
  readonly initialSnapshot: ReviewSessionSnapshot;
  readonly onCommitTransition: (transition: ReviewTransition) => Promise<void>;
  readonly onExit: () => void;
  readonly onFinish: () => Promise<void>;
  readonly subjects: readonly SubjectResource[];
  readonly settings?: StudySettings;
  readonly studyMaterials?: Readonly<Record<number, SubjectStudyMaterial>>;
  readonly onAddSynonym?: (subjectId: number, synonym: string) => Promise<void>;
  readonly onReload?: () => Promise<void>;
  readonly onSettings?: () => void;
  readonly onOpenSubject?: (id: number) => void;
  readonly onPlayAudio?: (url: string) => void;
}

export function ReviewSessionScreen({
  initialSnapshot,
  onCommitTransition,
  onExit,
  onFinish,
  subjects,
  settings = DEFAULT_STUDY_SETTINGS,
  studyMaterials = {},
  onAddSynonym,
  onReload,
  onSettings,
  onPlayAudio,
  onOpenSubject,
}: ReviewSessionScreenProps) {
  const theme = useTheme();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const playAudio = useStudyAudio(onPlayAudio);
  const types = Object.fromEntries(
    subjects.map((subject) => [subject.id, subject.object]),
  );
  const actions = useStudyAnswer({
    settings,
    kind: 'review',
    onAddSynonym,
    apply: async (type, afterPersist) => {
      const result = reduceReview(snapshot, { type }, types, settings);
      await onCommitTransition(result);
      if (!mounted.current) return;
      await afterPersist?.();
      if (!mounted.current) return;
      setSnapshot(result.snapshot);
      const current = subjects.find(
        ({ id }) => id === snapshot.items[snapshot.queuePosition]?.subjectId,
      );
      if (
        type === 'correct' &&
        snapshot.currentPrompt === 'reading' &&
        settings.autoplay &&
        current !== undefined &&
        'pronunciation_audios' in current.data
      ) {
        const audio = current.data.pronunciation_audios[0];
        if (audio !== undefined) playAudio(audio.url);
      }
    },
  });
  const completed = snapshot.items.slice(0, snapshot.queuePosition);
  const missed = completed.filter(
    ({ subjectId }) =>
      (snapshot.incorrectMeaningBySubject[subjectId] ?? 0) +
        (snapshot.incorrectReadingBySubject[subjectId] ?? 0) >
      0,
  );
  const correct = completed.length - missed.length;
  if (snapshot.phase === 'complete')
    return (
      <StudyCompletion
        title="Reviews complete"
        count={snapshot.queuePosition}
        detail="Review progress saved on this device"
        accuracy={{ correct, total: completed.length }}
        finishLabel="Finish reviews"
        onFinish={onFinish}
      >
        <Text style={[theme.typography.body, { color: theme.colors.text }]}>
          {completed.length === 0
            ? 'No reviews completed. Untouched reviews remain due.'
            : `${correct} of ${completed.length} subjects correct`}
        </Text>
        {missed.length === 0 ? null : (
          <Text style={[theme.typography.label, { color: theme.colors.text }]}>
            Missed subjects
          </Text>
        )}
        {missed.map(({ subjectId }) => {
          const subject = subjects.find(({ id }) => id === subjectId);
          const meaning =
            subject?.data.meanings.find(({ primary }) => primary)?.meaning ??
            `Subject ${subjectId}`;
          return (
            <StudyResultSubject
              key={subjectId}
              subject={subject}
              meaning={meaning}
              onPress={
                onOpenSubject === undefined
                  ? undefined
                  : () => onOpenSubject(subjectId)
              }
            />
          );
        })}
      </StudyCompletion>
    );
  const item = snapshot.items[snapshot.queuePosition];
  const subject = subjects.find(({ id }) => id === item?.subjectId);
  if (subject === undefined || snapshot.currentPrompt === null)
    return (
      <StudyCompletion
        title="Review needs attention"
        status="attention"
        count={0}
        detail="This subject is no longer available. Return home to refresh your library."
        finishLabel="Return home"
        onFinish={async () => onExit()}
      />
    );
  return (
    <ReviewPrompt
      key={`${subject.id}-${snapshot.currentPrompt}-${actions.revision}`}
      feedback={actions.feedback}
      busy={actions.busy}
      error={actions.error}
      settings={settings}
      index={snapshot.queuePosition}
      total={snapshot.items.length}
      subject={subject}
      prompt={snapshot.currentPrompt}
      onExit={() => actions.guard(onExit)}
      onSettings={
        onSettings === undefined ? undefined : () => actions.guard(onSettings)
      }
      onOpenSubject={
        onOpenSubject === undefined
          ? undefined
          : (id) => actions.guard(() => onOpenSubject(id))
      }
      onPlayAudio={playAudio}
      onSubmit={(answer) =>
        actions.submit(
          answer,
          snapshot.currentPrompt!,
          subject,
          studyMaterials[subject.id]?.meaningSynonyms,
        )
      }
      wrappingUp={snapshot.wrappingUp}
      onWrapUp={() => {
        if (
          actions.error !== null ||
          (actions.feedback !== null && actions.feedback.verdict !== 'retry')
        )
          return;
        void actions.perform(async () => {
          const result = reduceReview(
            snapshot,
            { type: 'wrap-up' },
            types,
            settings,
          );
          await onCommitTransition(result);
          if (mounted.current) setSnapshot(result.snapshot);
        });
      }}
      onContinue={actions.continue}
      onOverride={actions.override}
      onSkip={actions.skip}
      onRetrySave={actions.retrySave}
      onReload={
        onReload === undefined
          ? undefined
          : () => {
              void onReload();
            }
      }
      material={studyMaterials[subject.id]}
      onAddSynonym={
        actions.addSynonym === undefined
          ? undefined
          : (answer) => actions.addSynonym!(subject.id, answer)
      }
    />
  );
}
