import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import SettingsRoute from '../../../../app/(tabs)/settings';
import { NodeTestDatabase } from '@/db/NodeTestDatabase';
import { migrateDatabase } from '@/db/migrate';
import { renderApp } from '@/test/render';
import { ThemeProvider } from '@/ui/theme/ThemeProvider';
import {
  DEFAULT_STUDY_SETTINGS,
  loadStudySettings,
  saveStudySettings,
} from '../studySettings';

let mockDatabase: NodeTestDatabase;
let mockFocus: () => void = () => undefined;
jest.mock('@/app/AppProviders', () => ({
  useAppServices: () => ({ db: mockDatabase }),
}));
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => {
    // Model a navigation focus event; production uses the native navigator.
    const React = jest.requireActual<typeof import('react')>('react');
    React.useEffect(() => {
      mockFocus = callback;
      callback();
    }, [callback]);
  },
}));
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ play: jest.fn(), seekTo: jest.fn() }),
}));

test('returning to Settings loads modal changes before saving a new draft', async () => {
  const db = await NodeTestDatabase.open();
  mockDatabase = db;
  await migrateDatabase(db);
  try {
    const rendered = await renderApp(
      <ThemeProvider scheme="light">
        <SettingsRoute />
      </ThemeProvider>,
    );
    await screen.findByRole('radio', {
      name: 'Question order: Meaning → Reading',
      checked: true,
    });
    await saveStudySettings(db, {
      ...DEFAULT_STUDY_SETTINGS,
      questionOrder: 'reading-first',
    });
    await act(async () => {
      mockFocus();
    });
    await waitFor(() =>
      expect(
        screen.getByRole('radio', {
          name: 'Question order: Reading → Meaning',
        }),
      ).toBeChecked(),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Save settings' }),
    );
    await screen.findByText('Settings saved.');
    expect((await loadStudySettings(db)).questionOrder).toBe('reading-first');
    await rendered.unmount();
  } finally {
    await db.close();
  }
});
