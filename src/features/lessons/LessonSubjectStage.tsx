import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SubjectResource } from '@/api/types';
import type { SubjectStudyMaterial } from '@/features/subjects/subjectDetails';
import {
  StudyAction,
  StudySubjectHero,
  StudySubjectInformation,
} from '@/features/sessions/StudySubjectInformation';
import { minimumTouchTarget } from '@/ui/theme/spacing';
import { useTheme } from '@/ui/theme/ThemeProvider';

interface LessonSubjectStageProps {
  readonly index: number;
  readonly total: number;
  readonly subject: SubjectResource;
  readonly onExit: () => void;
  readonly onNext: () => void;
  readonly onPrevious: () => void;
  readonly onQuiz: () => void;
  readonly onPlayAudio?: (url: string) => void;
  readonly onSettings?: () => void;
  readonly onOpenSubject?: (id: number) => void;
  readonly busy: boolean;
  readonly error: string | null;
  readonly material?: SubjectStudyMaterial;
}

export function LessonSubjectStage({
  index,
  total,
  subject,
  onExit,
  onNext,
  onPrevious,
  onQuiz,
  onPlayAudio,
  onSettings,
  busy,
  error,
  material,
  onOpenSubject,
}: LessonSubjectStageProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const meaning =
    subject.data.meanings.find(({ primary }) => primary)?.meaning ??
    subject.data.slug;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.canvas,
        paddingTop: insets.top,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16 + insets.left,
          paddingRight: 16 + insets.right,
          gap: 12,
        }}
      >
        <Text
          style={[
            theme.typography.label,
            { flex: 1, color: theme.colors.textMuted },
          ]}
        >
          Lesson {index + 1} of {total}
        </Text>
        {onSettings === undefined ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Study settings"
            disabled={busy}
            onPress={onSettings}
            style={{ minHeight: minimumTouchTarget, justifyContent: 'center' }}
          >
            <Text style={{ color: theme.colors.accent }}>Settings</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Exit lesson session"
          disabled={busy}
          onPress={onExit}
          style={{
            minHeight: minimumTouchTarget,
            paddingHorizontal: 12,
            justifyContent: 'center',
          }}
        >
          <Text
            style={[theme.typography.label, { color: theme.colors.accent }]}
          >
            Exit
          </Text>
        </Pressable>
      </View>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          padding: 16,
          paddingLeft: 16 + insets.left,
          paddingRight: 16 + insets.right,
          gap: 18,
        }}
      >
        <StudySubjectHero subject={subject} />
        <Text
          selectable
          accessibilityRole="header"
          style={[
            theme.typography.screenTitle,
            { color: theme.colors.text, textAlign: 'center' },
          ]}
        >
          {meaning}
        </Text>
        {error === null ? null : (
          <Text
            accessibilityRole="alert"
            style={[theme.typography.body, { color: theme.colors.danger }]}
          >
            {error}
          </Text>
        )}
        <StudySubjectInformation
          subject={subject}
          material={material}
          onPlayAudio={onPlayAudio}
          onOpenSubject={onOpenSubject}
        />
        {index + 1 < total ? (
          <StudyAction label="Start quiz" onPress={onQuiz} disabled={busy} />
        ) : null}
      </ScrollView>
      <View
        style={{
          padding: 16,
          paddingLeft: 16 + insets.left,
          paddingRight: 16 + insets.right,
          paddingBottom: 12 + insets.bottom,
          flexDirection: 'row',
          gap: 12,
          borderTopWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        }}
      >
        <View style={{ flex: 1 }}>
          <StudyAction
            label="Previous"
            accessibilityLabel="Previous lesson subject"
            onPress={onPrevious}
            disabled={busy || index === 0}
          />
        </View>
        <View style={{ flex: 1 }}>
          <StudyAction
            label={index + 1 === total ? 'Start quiz' : 'Next'}
            accessibilityLabel={
              index + 1 === total ? 'Continue to quiz' : 'Next lesson subject'
            }
            onPress={onNext}
            disabled={busy}
            primary
          />
        </View>
      </View>
    </View>
  );
}
