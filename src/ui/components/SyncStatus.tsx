import { Pressable, Text, View } from 'react-native';

import { minimumTouchTarget } from '../theme/spacing';
import { useTheme } from '../theme/ThemeProvider';

export type SyncStatusState =
  | 'idle'
  | 'syncing'
  | 'completed'
  | 'failed'
  | 'offline';

const LABELS: Readonly<Record<SyncStatusState, string>> = {
  idle: 'Ready to synchronize',
  syncing: 'Synchronizing',
  completed: 'Synchronization complete',
  failed: 'Synchronization failed',
  offline: 'Offline',
};

interface SyncStatusProps {
  readonly state: SyncStatusState;
  readonly detail?: string;
  readonly onPress?: () => void;
}

export function SyncStatus({
  state,
  detail,
  onPress,
}: SyncStatusProps) {
  const theme = useTheme();
  const label = LABELS[state];
  const accessibilityLabel =
    detail === undefined ? label : `${label}. ${detail}`;
  const content = (
    <>
      <Text
        selectable
        style={[
          theme.typography.label,
          {
            color:
              state === 'failed'
                ? theme.colors.danger
                : theme.colors.text,
          },
        ]}
      >
        {label}
      </Text>
      {detail === undefined ? null : (
        <Text
          selectable
          style={[
            theme.typography.caption,
            { color: theme.colors.textMuted },
          ]}
        >
          {detail}
        </Text>
      )}
    </>
  );
  const style = {
    backgroundColor:
      state === 'failed'
        ? theme.colors.dangerSurface
        : theme.colors.surfaceMuted,
    borderCurve: 'continuous' as const,
    borderRadius: 12,
    gap: theme.spacing.xs,
    justifyContent: 'center' as const,
    minHeight: minimumTouchTarget,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  };

  return onPress === undefined ? (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={style}
    >
      {content}
    </View>
  ) : (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={style}
    >
      {content}
    </Pressable>
  );
}
