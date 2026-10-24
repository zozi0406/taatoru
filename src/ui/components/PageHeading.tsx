import type { ReactNode } from 'react';
import { Layers3 } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

export function PageHeading({
  title,
  eyebrow,
  intro,
  accessory,
}: {
  readonly title: string;
  readonly eyebrow?: string;
  readonly intro?: ReactNode;
  readonly accessory?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.heading}>
      <View style={styles.row}>
        <View style={styles.titles}>
          {eyebrow === undefined ? null : (
            <Text
              style={[
                theme.typography.overline,
                { color: theme.colors.accent },
              ]}
            >
              {eyebrow}
            </Text>
          )}
          <Text
            accessibilityRole="header"
            selectable
            style={[theme.typography.screenTitle, { color: theme.colors.text }]}
          >
            {title}
          </Text>
        </View>
        {accessory}
      </View>
      {intro}
    </View>
  );
}

export function BrandWordmark() {
  const theme = useTheme();
  return (
    <View
      style={styles.brand}
      accessibilityLabel="Taatoru, WaniKani companion"
      accessible
    >
      <View style={[styles.mark, { backgroundColor: theme.colors.accent }]}>
        <Layers3
          size={22}
          color={theme.colors.accentForeground}
          strokeWidth={1.8}
        />
      </View>
      <Text style={[styles.wordmark, { color: theme.colors.text }]}>
        taatoru
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 10 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  titles: { flex: 1, gap: 6 },
  brand: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  mark: {
    alignItems: 'center',
    borderRadius: 12,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  wordmark: { fontSize: 23, fontWeight: '800', letterSpacing: -1 },
});
