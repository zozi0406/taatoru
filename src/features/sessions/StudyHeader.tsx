import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Settings2, X } from 'lucide-react-native';
import { useTheme } from '@/ui/theme/ThemeProvider';

/** The same compact navigation and progress vocabulary throughout study. */
export function StudyHeader({
  title,
  index,
  total,
  busy,
  exitLabel,
  onExit,
  onSettings,
}: {
  readonly title: string;
  readonly index: number;
  readonly total: number;
  readonly busy: boolean;
  readonly exitLabel: string;
  readonly onExit: () => void;
  readonly onSettings?: () => void;
}) {
  const theme = useTheme();
  return (
    <View>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel={exitLabel}
          disabled={busy} onPress={onExit} style={styles.control}>
          <X size={22} color={theme.colors.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
          <Text accessibilityRole="header" style={[theme.typography.sectionTitle, { color: theme.colors.text }]}>{title}</Text>
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>{index} of {total}</Text>
        </View>
        {onSettings === undefined ? <View style={styles.control} /> : (
          <Pressable accessibilityRole="button" accessibilityLabel="Study settings"
            disabled={busy} onPress={onSettings} style={styles.control}>
            <Settings2 size={21} color={theme.colors.text} />
          </Pressable>
        )}
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={`${title} progress`}
        accessibilityValue={{ min: 0, max: Math.max(1, total), now: index }}
        style={{ height: 3, backgroundColor: theme.colors.surfaceMuted }}
      >
        <View
          style={{
            height: 3,
            backgroundColor: theme.colors.accent,
            width: `${total ? Math.min(100, (index / total) * 100) : 0}%`,
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
  },
  control: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
