import { Text, View } from 'react-native';

import type { SubjectObject } from '@/api/types';
import { subjectColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';

const LABELS: Readonly<Record<SubjectObject, string>> = {
  radical: 'Radical',
  kanji: 'Kanji',
  vocabulary: 'Vocabulary',
  kana_vocabulary: 'Kana vocabulary',
};

interface SubjectChipProps {
  readonly type: SubjectObject;
}

export function SubjectChip({ type }: SubjectChipProps) {
  const theme = useTheme();
  const label = LABELS[type];
  const colors = subjectColors[type];
  return (
    <View
      accessible
      accessibilityLabel={`${label} subject`}
      style={{
        alignSelf: 'flex-start',
        backgroundColor: colors.background,
        borderCurve: 'continuous',
        borderRadius: 999,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
      }}
    >
      <Text style={[theme.typography.caption, { color: colors.foreground }]}>
        {label}
      </Text>
    </View>
  );
}
