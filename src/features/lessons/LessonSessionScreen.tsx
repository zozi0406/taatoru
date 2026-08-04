import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { SubjectResource } from '@/api/types';
import type { LessonSessionSnapshot } from '@/features/sessions/SessionRepository';
import { checkAnswer } from '@/features/reviews/answerChecker';
import { minimumTouchTarget } from '@/ui/theme/spacing';
import { useTheme } from '@/ui/theme/ThemeProvider';
import {
  reduceLesson,
  type LessonEvent,
  type LessonTransition,
} from './lessonReducer';
import { LessonQuizStage } from './LessonQuizStage';
import { LessonSubjectStage } from './LessonSubjectStage';

interface LessonSessionScreenProps {
  readonly initialSnapshot: LessonSessionSnapshot;
  readonly onCommitTransition: (
    transition: LessonTransition,
  ) => Promise<void>;
  readonly onExit: () => void;
  readonly onFinish: () => Promise<void>;
  readonly onPlayAudio?: (url: string) => void;
  readonly subjects: readonly SubjectResource[];
}

export function LessonSessionScreen({
  initialSnapshot,
  onCommitTransition,
  onExit,
  onFinish,
  onPlayAudio,
  subjects,
}: LessonSessionScreenProps) {
  const theme = useTheme();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [feedback, setFeedback] =
    useState<'correct' | 'incorrect' | 'retry' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const byId = new Map(subjects.map((subject) => [subject.id!, subject]));
  const types = Object.fromEntries(
    subjects.map((subject) => [subject.id!, subject.object]),
  );

  const transition = async (event: LessonEvent) => {
    const result = reduceLesson(snapshot, event, types);
    try {
      await onCommitTransition(result);
      setSnapshot(result.snapshot);
    } catch {
      setError('Unable to preserve lesson progress.');
    }
  };

  if (snapshot.phase === 'complete') {
    return (
      <View
        style={{
          alignItems: 'center',
          backgroundColor: theme.colors.canvas,
          flex: 1,
          gap: theme.spacing.xl,
          justifyContent: 'center',
          padding: theme.spacing.xl,
        }}
      >
        <Text
          accessibilityRole="header"
          style={[theme.typography.screenTitle, { color: theme.colors.text }]}
        >
          Lesson complete
        </Text>
        <Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
          {snapshot.items.length} new subject
          {snapshot.items.length === 1 ? '' : 's'} added to Apprentice.
        </Text>
        <Pressable
          accessibilityLabel="Finish lessons"
          accessibilityRole="button"
          onPress={() => void onFinish()}
          style={{
            alignItems: 'center',
            backgroundColor: theme.colors.accent,
            borderRadius: 14,
            justifyContent: 'center',
            minHeight: minimumTouchTarget,
            paddingHorizontal: theme.spacing.xl,
          }}
        >
          <Text
            style={[
              theme.typography.label,
              { color: theme.colors.accentForeground },
            ]}
          >
            Finish
          </Text>
        </Pressable>
      </View>
    );
  }

  const item = snapshot.items[snapshot.queuePosition];
  const subject = item === undefined ? undefined : byId.get(item.subjectId);
  if (subject === undefined) {
    return (
      <View
        style={{
          backgroundColor: theme.colors.canvas,
          flex: 1,
          justifyContent: 'center',
          padding: theme.spacing.xl,
        }}
      >
        <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
          This lesson subject is no longer available on this device.
        </Text>
      </View>
    );
  }
  if (snapshot.phase === 'presentation') {
    return (
      <LessonSubjectStage
        index={snapshot.queuePosition}
        onExit={onExit}
        onNext={() => void transition({ type: 'advance-presentation' })}
        onPlayAudio={onPlayAudio}
        subject={subject}
        total={snapshot.items.length}
      />
    );
  }
  const prompt = snapshot.quizState.currentPrompt;
  if (prompt === null) {
    return null;
  }
  return (
    <View style={{ flex: 1 }}>
      <LessonQuizStage
        key={`${subject.id}-${prompt}`}
        feedback={feedback}
        index={snapshot.queuePosition}
        onExit={onExit}
        onSubmit={(answer) => {
          const result = checkAnswer({
            answer,
            prompt,
            subject,
          });
          if (result.verdict === 'retry') {
            setFeedback('retry');
            return;
          }
          setFeedback(
            result.verdict === 'correct' ? 'correct' : 'incorrect',
          );
          void transition({
            type:
              result.verdict === 'correct' ? 'correct' : 'incorrect',
          });
        }}
        prompt={prompt}
        subject={subject}
        total={snapshot.items.length}
      />
      {error === null ? null : (
        <Text
          accessibilityRole="alert"
          style={{
            backgroundColor: theme.colors.dangerSurface,
            color: theme.colors.danger,
            padding: theme.spacing.md,
          }}
        >
          {error}
        </Text>
      )}
    </View>
  );
}
