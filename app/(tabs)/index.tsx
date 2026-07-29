import { Text } from 'react-native';

import { Card } from '@/ui/components/Card';
import { Screen } from '@/ui/components/Screen';
import { SyncStatus } from '@/ui/components/SyncStatus';
import { useTheme } from '@/ui/theme/ThemeProvider';

export default function HomeScreen() {
  const theme = useTheme();
  return (
    <Screen
      title="Home"
      intro={
        <Text
          selectable
          style={[
            theme.typography.body,
            { color: theme.colors.textMuted },
          ]}
        >
          Your lessons, reviews, and next study window at a glance.
        </Text>
      }
    >
      <SyncStatus state="completed" detail="Local library is ready" />
      <Card>
        <Text
          selectable
          style={[
            theme.typography.sectionTitle,
            { color: theme.colors.text },
          ]}
        >
          Study queue
        </Text>
        <Text
          selectable
          style={[
            theme.typography.body,
            { color: theme.colors.textMuted },
          ]}
        >
          Available lessons and reviews will appear here.
        </Text>
      </Card>
    </Screen>
  );
}
