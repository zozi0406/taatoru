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
        <Text
          style={[
            theme.typography.label,
            styles.title,
            { color: theme.colors.textMuted },
          ]}
        >
          {title}
        </Text>
        <Text
          accessibilityLabel={`${index} of ${total}`}
          style={[
            theme.typography.label,
            styles.count,
            { color: theme.colors.text },
          ]}
        >
          {index} / {total}
        </Text>
        {onSettings === undefined ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Study settings"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={onSettings}
            style={styles.control}
          >
            <Settings2 size={21} color={theme.colors.textMuted} />
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={exitLabel}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onExit}
          style={styles.control}
        >
          <X size={22} color={theme.colors.textMuted} />
        </Pressable>
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
    paddingLeft: 16,
    paddingRight: 8,
  },
  title: { flex: 1 },
  count: { fontVariant: ['tabular-nums'], marginHorizontal: 8 },
  control: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
