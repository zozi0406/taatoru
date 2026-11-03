import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SubjectResource } from '@/api/types';
import type { SubjectStudyMaterial } from '@/features/subjects/subjectDetails';
import {
  StudyAction,
  StudySubjectHero,
  StudySubjectInformation,
} from '@/features/sessions/StudySubjectInformation';
import { StudyHeader } from '@/features/sessions/StudyHeader';
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
      <View style={{ paddingLeft: insets.left, paddingRight: insets.right }}>
        <StudyHeader
          title="Lessons"
          index={index + 1}
          total={total}
          busy={busy}
          exitLabel="Exit lesson session"
          onExit={onExit}
          onSettings={onSettings}
        />
      </View>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          padding: 16,
          paddingLeft: 16 + insets.left,
          paddingRight: 16 + insets.right,
          gap: 14,
        }}
      >
        <StudySubjectHero subject={subject} />
        <Text
          selectable
          accessibilityRole="header"
          style={[
            theme.typography.sectionTitle,
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
          presentation
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
