import { Text } from 'react-native';

import { Card } from '@/ui/components/Card';
import { Screen } from '@/ui/components/Screen';
import { useTheme } from '@/ui/theme/ThemeProvider';

export default function AnalyticsScreen() {
  const theme = useTheme();
  return (
    <Screen
      title="Analytics"
      intro={
        <Text
          selectable
          style={[
            theme.typography.body,
            { color: theme.colors.textMuted },
          ]}
        >
          Understand your review workload and learning progress.
        </Text>
      }
    >
      <Card>
        <Text
          selectable
          style={[
            theme.typography.sectionTitle,
            { color: theme.colors.text },
          ]}
        >
          Learning overview
        </Text>
        <Text
          selectable
          style={[
            theme.typography.body,
            {
              color: theme.colors.textMuted,
              fontVariant: ['tabular-nums'],
            },
          ]}
        >
          0 reviews recorded locally
        </Text>
      </Card>
    </Screen>
  );
}
