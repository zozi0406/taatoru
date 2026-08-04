import type { PropsWithChildren, ReactNode } from 'react';
import {
  ScrollView,
  Text,
  View,
  type ScrollViewProps,
} from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

interface ScreenProps extends PropsWithChildren<ScrollViewProps> {
  readonly title: string;
  readonly intro?: ReactNode;
}

export function Screen({
  children,
  contentContainerStyle,
  intro,
  title,
  ...props
}: ScreenProps) {
  const theme = useTheme();
  return (
    <ScrollView
      {...props}
      contentInsetAdjustmentBehavior="automatic"
      style={[{ backgroundColor: theme.colors.canvas }, props.style]}
      contentContainerStyle={[
        {
          flexGrow: 1,
          gap: theme.spacing.xl,
          padding: theme.spacing.xl,
        },
        contentContainerStyle,
      ]}
    >
      <View style={{ gap: theme.spacing.sm }}>
        <Text
          accessibilityRole="header"
          selectable
          style={[
            theme.typography.screenTitle,
            { color: theme.colors.text },
          ]}
        >
          {title}
        </Text>
        {intro}
      </View>
      {children}
    </ScrollView>
  );
}
