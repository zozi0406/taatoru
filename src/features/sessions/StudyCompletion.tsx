import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { CheckCircle2, ChevronRight, CircleAlert } from 'lucide-react-native';
import type { SubjectResource } from '@/api/types';
import { radicalImageSource } from '@/features/media/radicalImages';
import { SubjectGlyph } from '@/ui/components/SubjectGlyph';
import { useTheme } from '@/ui/theme/ThemeProvider';
import { useScreenPadding } from '@/ui/theme/useScreenPadding';
import { StudyAction } from './StudySubjectInformation';

export function StudyCompletion({
  title,
  count,
  detail,
  finishLabel,
  onFinish,
  children,
  accuracy,
  status = 'complete',
}: {
  readonly children?: ReactNode;
  readonly title: string;
  readonly count: number;
  readonly detail: string;
  readonly finishLabel: string;
  readonly onFinish: () => Promise<void>;
  readonly status?: 'complete' | 'attention';
  readonly accuracy?: { readonly correct: number; readonly total: number };
}) {
  const theme = useTheme();
  const padding = useScreenPadding();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const working = useRef(false);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.canvas }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        ...padding,
        flexGrow: 1,
        gap: 24,
      }}
    >
      <View
        style={{
          alignSelf: 'flex-start',
          padding: 12,
          borderRadius: 18,
          backgroundColor:
            status === 'complete'
              ? theme.colors.successSurface
              : theme.colors.surfaceMuted,
        }}
      >
        {status === 'complete' ? (
          <CheckCircle2 color={theme.colors.success} size={28} />
        ) : (
          <CircleAlert color={theme.colors.textMuted} size={28} />
        )}
      </View>
      <Text
        accessibilityRole="header"
        style={[theme.typography.screenTitle, { color: theme.colors.text }]}
      >
        {title}
      </Text>
      {status === 'complete' ? (
        <View
          style={{
            padding: 20,
            borderRadius: 18,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border,
            gap: 16,
          }}
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24 }}>
            <View style={{ flexGrow: 1, gap: 4 }}>
              <Text
                style={[
                  theme.typography.screenTitle,
                  { color: theme.colors.text, fontVariant: ['tabular-nums'] },
                ]}
              >
                {count}
              </Text>
              <Text
                style={[
                  theme.typography.caption,
                  { color: theme.colors.textMuted },
                ]}
              >
                Completed
              </Text>
            </View>
            {accuracy === undefined || accuracy.total === 0 ? null : (
              <View style={{ flexGrow: 1, gap: 4 }}>
                <Text
                  style={[
                    theme.typography.screenTitle,
                    { color: theme.colors.text, fontVariant: ['tabular-nums'] },
                  ]}
                >
                  {Math.round((accuracy.correct / accuracy.total) * 100)}%
                </Text>
                <Text
                  style={[
                    theme.typography.caption,
                    { color: theme.colors.textMuted },
                  ]}
                >
                  Accuracy
                </Text>
              </View>
            )}
          </View>
          <Text
            style={[theme.typography.body, { color: theme.colors.textMuted }]}
          >
            {detail}.
          </Text>
        </View>
      ) : null}
      {status === 'attention' ? (
        <Text
          style={[theme.typography.body, { color: theme.colors.textMuted }]}
        >
          {detail}
        </Text>
      ) : null}
      {children}
      {error ? (
        <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
          Could not finish this session. Please try again.
        </Text>
      ) : null}
      <StudyAction
        label={finishLabel}
        primary
        disabled={busy}
        onPress={() => {
          if (working.current) return;
          working.current = true;
          setBusy(true);
          setError(false);
          void onFinish()
            .catch(() => setError(true))
            .finally(() => {
              working.current = false;
              setBusy(false);
            });
        }}
      />
    </ScrollView>
  );
}

/** Keep the Japanese subject recognizable when revisiting a missed answer. */
export function StudyResultSubject({
  subject,
  meaning,
  onPress,
}: {
  readonly subject?: SubjectResource;
  readonly meaning: string;
  readonly onPress?: () => void;
}) {
  const theme = useTheme();
  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 14,
        borderRadius: 14,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      {subject === undefined ? null : (
        <SubjectGlyph
          characters={subject.data.characters}
          type={subject.object}
          image={radicalImageSource(subject)}
        />
      )}
      <Text
        style={[theme.typography.label, { flex: 1, color: theme.colors.text }]}
      >
        {meaning}
      </Text>
      {onPress === undefined ? null : (
        <ChevronRight size={20} color={theme.colors.textMuted} />
      )}
    </View>
  );
  return onPress === undefined ? (
    content
  ) : (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Review missed subject: ${meaning}`}
      onPress={onPress}
    >
      {content}
    </Pressable>
  );
}
