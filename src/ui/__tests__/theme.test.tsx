import {
  fireEvent,
  screen,
} from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderApp } from '@/test/render';
import { LoginScreen } from '@/features/auth/LoginScreen';
import { Card } from '../components/Card';
import { SubjectChip } from '../components/SubjectChip';
import { SyncStatus } from '../components/SyncStatus';
import { TAB_ITEMS } from '../navigation/tabs';
import {
  ThemeProvider,
  resolveColorScheme,
  useTheme,
} from '../theme/ThemeProvider';
import { darkColors, lightColors } from '../theme/colors';

test('provides semantic light and dark palettes', async () => {
  await renderApp(
    <>
      <ThemeProvider scheme="light">
        <ThemeProbe testID="light-theme" />
      </ThemeProvider>
      <ThemeProvider scheme="dark">
        <ThemeProbe testID="dark-theme" />
      </ThemeProvider>
    </>,
  );
  expect(screen.getByTestId('light-theme')).toHaveStyle({
    color: lightColors.text,
    backgroundColor: lightColors.canvas,
  });
  expect(screen.getByTestId('dark-theme')).toHaveStyle({
    color: darkColors.text,
    backgroundColor: darkColors.canvas,
  });
});

test('follows the system color scheme and defaults safely to light', () => {
  expect(resolveColorScheme('dark')).toBe('dark');
  expect(resolveColorScheme('light')).toBe('light');
  expect(resolveColorScheme(null)).toBe('light');
});

test('cards use restrained semantic surfaces', async () => {
  await renderApp(
    <ThemeProvider scheme="dark">
      <Card testID="card">
        <Text>Card content</Text>
      </Card>
    </ThemeProvider>,
  );

  expect(screen.getByTestId('card')).toHaveStyle({
    backgroundColor: darkColors.surface,
    borderColor: darkColors.border,
  });
});

test('applies the dark canvas to authentication', async () => {
  await renderApp(
    <ThemeProvider scheme="dark">
      <LoginScreen
        busy={false}
        error={null}
        requiresAccountChange={false}
        onLogin={jest.fn()}
        onChangeAccount={jest.fn()}
      />
    </ThemeProvider>,
  );

  expect(screen.getByTestId('login-screen')).toHaveStyle({
    backgroundColor: darkColors.canvas,
  });
});

test.each([
  ['radical', 'Radical'],
  ['kanji', 'Kanji'],
  ['vocabulary', 'Vocabulary'],
  ['kana_vocabulary', 'Kana vocabulary'],
] as const)('labels %s subjects without relying on color', async (type, label) => {
  await renderApp(
    <ThemeProvider scheme="light">
      <SubjectChip type={type} />
    </ThemeProvider>,
  );

  expect(screen.getByText(label)).toBeOnTheScreen();
  expect(screen.getByLabelText(`${label} subject`)).toBeOnTheScreen();
});

test('interactive status controls meet the 48dp target', async () => {
  const onPress = jest.fn();
  await renderApp(
    <ThemeProvider scheme="light">
      <SyncStatus
        state="failed"
        detail="Could not refresh"
        onPress={onPress}
      />
    </ThemeProvider>,
  );

  const control = screen.getByRole('button', {
    name: 'Synchronization failed. Could not refresh',
  });
  expect(control).toHaveStyle({ minHeight: 48 });
  fireEvent.press(control);
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('defines four static tabs with accessible names', () => {
  expect(TAB_ITEMS.map(({ route, label }) => ({ route, label }))).toEqual([
    { route: 'index', label: 'Home' },
    { route: 'search', label: 'Search' },
    { route: 'analytics', label: 'Analytics' },
    { route: 'settings', label: 'Settings' },
  ]);
  expect(new Set(TAB_ITEMS.map(({ label }) => label)).size).toBe(4);
});

function ThemeProbe({ testID }: { readonly testID: string }) {
  const theme = useTheme();
  return (
    <Text
      testID={testID}
      style={{
        backgroundColor: theme.colors.canvas,
        color: theme.colors.text,
      }}
    >
      Theme
    </Text>
  );
}
