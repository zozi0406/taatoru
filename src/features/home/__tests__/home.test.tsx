import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderApp } from '@/test/render';
import { ThemeProvider } from '@/ui/theme/ThemeProvider';
import type { SyncResult } from '@/features/sync/SyncEngine';
import { HomeScreen } from '../HomeScreen';
import type { DashboardSnapshot } from '../dashboard';

const SNAPSHOT: DashboardSnapshot = {
  level: 8,
  lessonCount: 0,
  reviewCount: 12,
  nextReviewAt: '2026-07-29T12:00:00.000Z',
  reviewBuckets: [{ hoursFromNow: 0, count: 12, cumulative: 12 }],
  currentLevel: {
    radical: { locked: 0, lesson: 1, apprentice: 2, guru: 3 },
    kanji: { locked: 4, lesson: 5, apprentice: 6, guru: 7 },
    vocabulary: { locked: 8, lesson: 9, apprentice: 10, guru: 11 },
  },
  srs: {
    apprentice: 8,
    guru: 4,
    master: 3,
    enlightened: 2,
    burned: 1,
  },
  pendingWriteCount: 2,
  vacationActive: false,
  online: true,
  lastSyncAt: '2026-07-29T11:30:00.000Z',
};

test('renders counts and disables unavailable lesson actions', async () => {
  await renderHome();

  expect(await screen.findByText('12')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Start lessons' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Start reviews' })).toBeEnabled();
  expect(screen.getByText('2 changes waiting to upload')).toBeOnTheScreen();
  expect(screen.getByText(/^Last synchronized /)).toBeOnTheScreen();
  expect(screen.getByText(/^Next review /)).toBeOnTheScreen();
});

test('labels an offline local dashboard without calling it a sync failure', async () => {
  await renderHome({
    loadSnapshot: jest.fn(async () => ({ ...SNAPSHOT, online: false })),
  });

  expect(await screen.findByText('Offline')).toBeOnTheScreen();
  expect(
    screen.getByText('Offline — local data remains available'),
  ).toBeOnTheScreen();
  expect(screen.queryByText('Synchronization failed')).not.toBeOnTheScreen();
});

test('runs quick and full synchronization controls then reloads', async () => {
  const synchronize = jest.fn(async () => ({
    status: 'completed' as const,
    updatedResources: 3,
  }));
  const loadSnapshot = jest.fn(async () => SNAPSHOT);
  await renderHome({ loadSnapshot, synchronize });
  await screen.findByText('12');

  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Quick sync' }));
  });
  await waitFor(() => {
    expect(synchronize).toHaveBeenCalledWith('quick');
  });
  expect(loadSnapshot).toHaveBeenCalledTimes(2);

  await act(async () => {
    fireEvent(screen.getByTestId('home-dashboard'), 'refresh');
  });
  await waitFor(() => {
    expect(synchronize).toHaveBeenCalledWith('full');
  });
  expect(loadSnapshot).toHaveBeenCalledTimes(3);
});

test.each([
  [
    { status: 'skipped', reason: 'offline' } as const,
    'Offline — using local data',
  ],
  [
    {
      status: 'failed',
      error: {
        kind: 'api',
        message: 'WaniKani is unavailable',
        status: 503,
        safeUrl: 'https://api.wanikani.com/v2/subjects',
        retryAt: null,
        hibernating: false,
      },
    } as const,
    'WaniKani is unavailable',
  ],
])('reports an honest synchronization result', async (result, message) => {
  await renderHome({
    synchronize: jest.fn(async () => result),
  });
  await screen.findByText('12');

  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Quick sync' }));
  });

  expect(await screen.findByText(message)).toBeOnTheScreen();
});

test('explains hibernation as an account action and clears the notice after a successful retry', async () => {
  const synchronize = jest
    .fn()
    .mockResolvedValueOnce({
      status: 'failed',
      error: {
        kind: 'api',
        message: 'The user is hibernating',
        status: 403,
        safeUrl: null,
        retryAt: null,
        hibernating: true,
      },
    })
    .mockResolvedValueOnce({ status: 'completed', updatedResources: 3 });
  await renderHome({ synchronize });
  await screen.findByText('12');
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Quick sync' }));
  });

  expect(
    screen.getByText('WaniKani account needs attention'),
  ).toBeOnTheScreen();
  expect(screen.getByRole('link', { name: 'Open WaniKani' })).toBeOnTheScreen();
  expect(screen.queryByText('The user is hibernating')).not.toBeOnTheScreen();
  expect(screen.queryByText('Synchronization failed')).not.toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Start reviews' })).toBeEnabled();

  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  });
  expect(
    screen.queryByText('WaniKani account needs attention'),
  ).not.toBeOnTheScreen();
  expect(screen.getByText('Synchronization complete')).toBeOnTheScreen();
});

test('keeps unrelated permission errors distinct from account hibernation', async () => {
  await renderHome({
    synchronize: async () => ({
      status: 'failed',
      error: {
        kind: 'api',
        message: 'Token lacks permission',
        status: 403,
        safeUrl: null,
        retryAt: null,
        hibernating: false,
      },
    }),
  });
  await screen.findByText('12');
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Quick sync' }));
  });
  expect(screen.getByText('Token lacks permission')).toBeOnTheScreen();
  expect(screen.getByText('Synchronization failed')).toBeOnTheScreen();
  expect(
    screen.queryByRole('link', { name: 'Open WaniKani' }),
  ).not.toBeOnTheScreen();
});

async function renderHome({
  loadSnapshot = jest.fn(async () => SNAPSHOT),
  synchronize = jest.fn(async () => ({
    status: 'completed' as const,
    updatedResources: 0,
  })),
}: {
  readonly loadSnapshot?: () => Promise<DashboardSnapshot>;
  readonly synchronize?: (mode: 'quick' | 'full') => Promise<SyncResult>;
} = {}) {
  return renderApp(
    <ThemeProvider scheme="light">
      <HomeScreen
        loadSnapshot={loadSnapshot}
        synchronize={synchronize}
        onStartLessons={jest.fn()}
        onStartReviews={jest.fn()}
      />
    </ThemeProvider>,
  );
}
