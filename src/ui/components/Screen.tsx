import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { useScreenPadding } from '../theme/useScreenPadding';
import { PageHeading } from './PageHeading';

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
  const screenPadding = useScreenPadding();
  return (
    <ScrollView
      {...props}
      contentInsetAdjustmentBehavior="automatic"
      style={[{ backgroundColor: theme.colors.canvas }, props.style]}
      contentContainerStyle={[
        {
          flexGrow: 1,
          gap: theme.spacing.xl,
          ...screenPadding,
        },
        contentContainerStyle,
      ]}
    >
      <PageHeading
        title={title}
        eyebrow="TAATORU / YOUR STUDY SPACE"
        intro={intro}
      />
      {children}
    </ScrollView>
  );
}
