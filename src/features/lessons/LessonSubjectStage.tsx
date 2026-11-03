import { subjectColors } from '@/ui/theme/colors';
import { Pressable, ScrollView, Text, View } from 'react-native';
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
  readonly lessonSubjects: readonly (SubjectResource | undefined)[];
  readonly onSelect: (position: number) => void;
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
  lessonSubjects,
  onSelect,
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
      </ScrollView>
      {total > 1 && (
        <View style={{ backgroundColor: theme.colors.surface, borderTopWidth: 1, borderColor: theme.colors.border }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16 + Math.max(insets.left, insets.right), paddingVertical: 8, gap: 6 }}>
            {lessonSubjects.map((item, position) => item === undefined ? null : (
              <Pressable key={item.id} accessibilityRole="button"
                accessibilityLabel={`Lesson ${position + 1}: ${item.data.characters ?? item.data.slug}`}
                accessibilityState={{ selected: position === index, disabled: busy }}
                disabled={busy || position === index}
                onPress={() => onSelect(position)}
                style={{ minWidth: 48, minHeight: 48, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'center',
                  borderRadius: 10, borderWidth: 2, borderColor: position === index ? theme.colors.accent : 'transparent',
                  backgroundColor: theme.colors.surfaceMuted }}>
                <Text style={[theme.typography.label, { color: theme.scheme === 'light' ? subjectColors[item.object].background : theme.colors.text }]}>
                  {item.data.characters ?? item.data.slug}
                </Text>
              </Pressable>
            ))}
            {index + 1 < total && <StudyAction label="Start quiz" onPress={onQuiz} disabled={busy} />}
          </ScrollView>
        </View>
      )}
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
            quiet
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
