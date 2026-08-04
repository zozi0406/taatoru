import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { SubjectResource } from '@/api/types';
import { minimumTouchTarget } from '@/ui/theme/spacing';
import { useTheme } from '@/ui/theme/ThemeProvider';
import { checkAnswer } from './answerChecker';
import { ReviewPrompt } from './ReviewPrompt';
import type { ReviewSessionSnapshot } from './ReviewSessionRepository';
import {
  reduceReview,
  type ReviewEvent,
  type ReviewTransition,
} from './reviewReducer';

interface ReviewSessionScreenProps {
  readonly initialSnapshot: ReviewSessionSnapshot;
  readonly onCommitTransition: (
    transition: ReviewTransition,
  ) => Promise<void>;
  readonly onExit: () => void;
  readonly onFinish: () => Promise<void>;
  readonly subjects: readonly SubjectResource[];
}

export function ReviewSessionScreen({
  initialSnapshot,
  onCommitTransition,
  onExit,
  onFinish,
  subjects,
}: ReviewSessionScreenProps) {
  const theme = useTheme();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [feedback, setFeedback] =
    useState<'correct' | 'incorrect' | 'retry' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const byId = new Map(subjects.map((subject) => [subject.id!, subject]));
  const types = Object.fromEntries(
    subjects.map((subject) => [subject.id!, subject.object]),
  );

  const transition = async (event: ReviewEvent) => {
    const result = reduceReview(snapshot, event, types);
    try {
      setError(null);
      await onCommitTransition(result);
      setSnapshot(result.snapshot);
    } catch {
      setError('Unable to preserve review progress.');
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
          Reviews complete
        </Text>
        <Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
          {snapshot.items.length} review
          {snapshot.items.length === 1 ? '' : 's'} recorded on this device.
        </Text>
        <Pressable
          accessibilityLabel="Finish reviews"
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
  if (subject === undefined || snapshot.currentPrompt === null) {
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
          This review subject is no longer available on this device.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ReviewPrompt
        key={`${subject.id}-${snapshot.currentPrompt}`}
        feedback={feedback}
        index={snapshot.queuePosition}
        onExit={onExit}
        onSubmit={(answer) => {
          const result = checkAnswer({
            answer,
            prompt: snapshot.currentPrompt!,
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
            type: result.verdict === 'correct' ? 'correct' : 'incorrect',
          });
        }}
        prompt={snapshot.currentPrompt}
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
