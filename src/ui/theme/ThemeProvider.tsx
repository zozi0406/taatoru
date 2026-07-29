import {
  createContext,
  type PropsWithChildren,
  use,
  useMemo,
} from 'react';
import { useColorScheme } from 'react-native';

import {
  darkColors,
  lightColors,
  type ThemeColors,
} from './colors';
import { spacing } from './spacing';
import { typography } from './typography';

export type ColorScheme = 'dark' | 'light';

export interface TaatoruTheme {
  readonly scheme: ColorScheme;
  readonly colors: ThemeColors;
  readonly spacing: typeof spacing;
  readonly typography: typeof typography;
}

const ThemeContext = createContext<TaatoruTheme | null>(null);

interface ThemeProviderProps extends PropsWithChildren {
  readonly scheme?: ColorScheme;
}

export function ThemeProvider({
  children,
  scheme: schemeOverride,
}: ThemeProviderProps) {
  const systemScheme = useColorScheme();
  const scheme = schemeOverride ?? resolveColorScheme(systemScheme);
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const value = useMemo<TaatoruTheme>(
    () => ({ scheme, colors, spacing, typography }),
    [colors, scheme],
  );

  return (
    <ThemeContext value={value}>{children}</ThemeContext>
  );
}

export function useTheme(): TaatoruTheme {
  const theme = use(ThemeContext);
  if (theme === null) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return theme;
}

export function resolveColorScheme(
  scheme: ReturnType<typeof useColorScheme> | null | undefined,
): ColorScheme {
  return scheme === 'dark' ? 'dark' : 'light';
}
