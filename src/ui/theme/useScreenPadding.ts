import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing } from './spacing';

/** iOS adjusts scroll insets automatically; Android needs explicit edge protection. */
export function useScreenPadding() {
  const insets = useSafeAreaInsets();
  return {
    padding: spacing.xl,
    paddingTop: spacing.xl + (Platform.OS === 'ios' ? 0 : insets.top),
    paddingLeft: spacing.xl + insets.left,
    paddingRight: spacing.xl + insets.right,
    paddingBottom: spacing.xl + (Platform.OS === 'ios' ? 0 : insets.bottom),
  };
}
