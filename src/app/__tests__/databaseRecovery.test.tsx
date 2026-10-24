import { fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { AppProviders } from '../AppProviders';
import { ExpoDatabase } from '@/db/ExpoDatabase';
import { migrateDatabase } from '@/db/migrate';
import { NodeTestDatabase } from '@/db/NodeTestDatabase';
import { renderApp } from '@/test/render';
import { ThemeProvider } from '@/ui/theme/ThemeProvider';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('expo-notifications', () => ({}));
jest.mock('@/features/auth/AuthProvider', () => ({
  AuthManager: jest.fn(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ status: 'unauthenticated' }),
}));
jest.mock('@/features/notifications/backgroundTask', () => ({
  registerReviewBackgroundTask: jest.fn(async () => undefined),
}));
jest.mock('@/db/migrate', () => ({ migrateDatabase: jest.fn() }));

test('a failed database bootstrap releases its connection and can recover from Retry', async () => {
  const first = await NodeTestDatabase.open();
  const second = await NodeTestDatabase.open();
  const close = jest.spyOn(first, 'close');
  const open = jest
    .spyOn(ExpoDatabase, 'open')
    .mockResolvedValueOnce(first as unknown as ExpoDatabase)
    .mockResolvedValueOnce(second as unknown as ExpoDatabase);
  const realMigrate =
    jest.requireActual<typeof import('@/db/migrate')>(
      '@/db/migrate',
    ).migrateDatabase;
  jest
    .mocked(migrateDatabase)
    .mockRejectedValueOnce(new Error('database is locked'))
    .mockImplementation(realMigrate);
  try {
    const rendered = await renderApp(
      <ThemeProvider scheme="light">
        <AppProviders>
          <Text>Library ready</Text>
        </AppProviders>
      </ThemeProvider>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Unable to open your local library/,
    );
    expect(close).toHaveBeenCalledTimes(1);
    await fireEvent.press(
      screen.getByRole('button', { name: 'Retry opening Taatoru' }),
    );
    expect(await screen.findByText('Library ready')).toBeVisible();
    expect(open).toHaveBeenCalledTimes(2);
    await rendered.unmount();
  } finally {
    jest.restoreAllMocks();
  }
});
