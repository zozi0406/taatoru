import { Text } from 'react-native';

import { Card } from '@/ui/components/Card';
import { Screen } from '@/ui/components/Screen';
import { SubjectChip } from '@/ui/components/SubjectChip';
import { useTheme } from '@/ui/theme/ThemeProvider';

export default function SearchScreen() {
  const theme = useTheme();
  return (
    <Screen
      title="Search"
      intro={
        <Text
          selectable
          style={[
            theme.typography.body,
            { color: theme.colors.textMuted },
          ]}
        >
          Find subjects by characters, readings, meanings, or synonyms.
        </Text>
      }
    >
      <Card style={{ gap: theme.spacing.md }}>
        <SubjectChip type="radical" />
        <SubjectChip type="kanji" />
        <SubjectChip type="vocabulary" />
        <SubjectChip type="kana_vocabulary" />
      </Card>
    </Screen>
  );
}
