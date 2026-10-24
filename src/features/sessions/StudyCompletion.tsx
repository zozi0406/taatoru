import { useRef, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useTheme } from '@/ui/theme/ThemeProvider';
import { useScreenPadding } from '@/ui/theme/useScreenPadding';
import { StudyAction } from './StudySubjectInformation';

export function StudyCompletion({
  title,
  count,
  detail,
  finishLabel,
  onFinish,
}: {
  readonly title: string;
  readonly count: number;
  readonly detail: string;
  readonly finishLabel: string;
  readonly onFinish: () => Promise<void>;
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
        justifyContent: 'center',
        gap: 20,
      }}
    >
      <Text
        accessibilityRole="header"
        style={[theme.typography.screenTitle, { color: theme.colors.text }]}
      >
        {title}
      </Text>
      <Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
        {count > 0 ? `${count} ` : ''}
        {detail}.
      </Text>
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
