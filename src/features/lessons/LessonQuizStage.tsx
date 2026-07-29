import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { SubjectResource } from '@/api/types';
import type { LessonPrompt } from '@/features/sessions/SessionRepository';
import { minimumTouchTarget } from '@/ui/theme/spacing';
import { subjectColors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme/ThemeProvider';

interface LessonQuizStageProps {
  readonly feedback: 'correct' | 'incorrect' | null;
  readonly index: number;
  readonly onExit: () => void;
  readonly onSubmit: (answer: string) => void;
  readonly prompt: LessonPrompt;
  readonly subject: SubjectResource;
  readonly total: number;
}

export function LessonQuizStage({
  feedback,
  index,
  onExit,
  onSubmit,
  prompt,
  subject,
  total,
}: LessonQuizStageProps) {
  const theme = useTheme();
  const colors = subjectColors[subject.object];
  const [answer, setAnswer] = useState('');
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ backgroundColor: colors.background, flex: 1 }}
    >
      <View
        style={{
          flex: 1,
          gap: theme.spacing.xl,
          justifyContent: 'space-between',
          padding: theme.spacing.xl,
        }}
      >
        <View
          style={{
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'space-between',
          }}
        >
          <Text style={[theme.typography.label, { color: colors.foreground }]}>
            {index + 1} of {total}
          </Text>
          <Pressable
            accessibilityLabel="Exit lesson session"
            accessibilityRole="button"
            onPress={onExit}
            style={{ justifyContent: 'center', minHeight: minimumTouchTarget }}
          >
            <Text style={[theme.typography.label, { color: colors.foreground }]}>
              Exit
            </Text>
          </Pressable>
        </View>
        <View style={{ alignItems: 'center', gap: theme.spacing.lg }}>
          <Text
            selectable
            style={{
              color: colors.foreground,
              fontSize: 92,
              fontWeight: '500',
              lineHeight: 112,
            }}
          >
            {subject.data.characters ?? '◻︎'}
          </Text>
          <View
            style={{
              backgroundColor: '#17202A',
              borderRadius: 12,
              paddingHorizontal: theme.spacing.xl,
              paddingVertical: theme.spacing.md,
            }}
          >
            <Text
              accessibilityRole="header"
              style={[
                theme.typography.sectionTitle,
                { color: '#FFFFFF', textTransform: 'capitalize' },
              ]}
            >
              {prompt === 'meaning' ? 'Meaning' : 'Reading'}
            </Text>
          </View>
          {feedback === null ? null : (
            <Text
              accessibilityLiveRegion="assertive"
              style={[
                theme.typography.sectionTitle,
                { color: colors.foreground },
              ]}
            >
              {feedback === 'correct' ? 'Correct' : 'Try again'}
            </Text>
          )}
        </View>
        <View style={{ gap: theme.spacing.sm }}>
          <TextInput
            accessibilityLabel={`${prompt === 'meaning' ? 'Meaning' : 'Reading'} answer`}
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setAnswer}
            onSubmitEditing={() => onSubmit(answer)}
            placeholder={`Enter the ${prompt}`}
            placeholderTextColor={theme.colors.textMuted}
            returnKeyType="done"
            style={[
              theme.typography.body,
              {
                backgroundColor: theme.colors.surface,
                borderRadius: 14,
                color: theme.colors.text,
                minHeight: minimumTouchTarget,
                paddingHorizontal: theme.spacing.lg,
              },
            ]}
            value={answer}
          />
          <Pressable
            accessibilityLabel="Submit answer"
            accessibilityRole="button"
            disabled={answer.trim().length === 0}
            onPress={() => onSubmit(answer)}
            style={{
              alignItems: 'center',
              backgroundColor: theme.colors.surface,
              borderRadius: 14,
              justifyContent: 'center',
              minHeight: minimumTouchTarget,
              opacity: answer.trim().length === 0 ? 0.5 : 1,
            }}
          >
            <Text style={[theme.typography.label, { color: theme.colors.accent }]}>
              Check answer
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
