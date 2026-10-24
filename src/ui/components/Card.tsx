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
          borderRadius: 22,
          borderWidth: 1,
          boxShadow:
            theme.scheme === 'dark'
              ? '0 4px 16px rgba(0, 0, 0, 0.12)'
              : '0 4px 18px rgba(44, 29, 74, 0.035)',
          gap: theme.spacing.sm,
          padding: 20,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
