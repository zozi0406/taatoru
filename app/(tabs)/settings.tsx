import { Text } from 'react-native';

import { Card } from '@/ui/components/Card';
import { Screen } from '@/ui/components/Screen';
import { useTheme } from '@/ui/theme/ThemeProvider';

export default function SettingsScreen() {
  const theme = useTheme();
  return (
    <Screen
      title="Settings"
      intro={
        <Text
          selectable
          style={[
            theme.typography.body,
            { color: theme.colors.textMuted },
          ]}
        >
          Manage synchronization, account access, and study preferences.
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
          WaniKani account
        </Text>
        <Text
          selectable
          style={[
            theme.typography.body,
            { color: theme.colors.textMuted },
          ]}
        >
          Credentials are stored securely on this device.
        </Text>
      </Card>
    </Screen>
  );
}
