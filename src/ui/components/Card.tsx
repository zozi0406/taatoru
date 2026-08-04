import type { PropsWithChildren } from 'react';
import { View, type ViewProps } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

export function Card({
  children,
  style,
  ...props
}: PropsWithChildren<ViewProps>) {
  const theme = useTheme();
  return (
    <View
      {...props}
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderCurve: 'continuous',
          borderRadius: 16,
          borderWidth: 1,
          boxShadow:
            theme.scheme === 'dark'
              ? '0 1px 2px rgba(0, 0, 0, 0.24)'
              : '0 1px 2px rgba(20, 31, 45, 0.06)',
          gap: theme.spacing.sm,
          padding: theme.spacing.lg,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
