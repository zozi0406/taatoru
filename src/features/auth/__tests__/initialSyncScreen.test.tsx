import { fireEvent, screen } from '@testing-library/react-native';

import { renderApp } from '@/test/render';
import { ThemeProvider } from '@/ui/theme/ThemeProvider';

import { InitialSyncScreen } from '../InitialSyncScreen';
import type { InitialSyncState } from '../AuthProvider';

jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: function MockModal({
      children,
      visible,
    }: React.PropsWithChildren<{ visible: boolean }>) {
      return visible
        ? React.createElement(React.Fragment, null, children)
        : null;
    },
  };
});

const running: InitialSyncState = {
  status: 'running',
  phase: 'account-data',
  message: null,
  retryAt: null,
};

describe('InitialSyncScreen', () => {
  it('shows completed, active, and upcoming setup phases', async () => {
    await renderScreen(running);

    expect(screen.getByText('Preparing Taatoru')).toBeTruthy();
    expect(
      screen.getByLabelText('Account connected, completed'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Downloading subjects, completed')).toBeTruthy();
    expect(screen.getByLabelText('Syncing your progress, in progress')).toBeTruthy();
    expect(screen.getByLabelText('Building offline library, upcoming')).toBeTruthy();
  });

  it('offers a controlled retry when setup has connection issues', async () => {
    const onRetry = jest.fn(async () => undefined);
    const onUseDifferentToken = jest.fn(async () => undefined);
    await renderScreen(
      {
        ...running,
        status: 'connection-issues',
        message:
          'Taatoru could not reach WaniKani. It will continue when your connection returns.',
      },
      { onRetry, onUseDifferentToken },
    );

    expect(screen.getByText('Connection issues')).toBeTruthy();
    expect(
      screen.getByText(/automatically when your connection returns/i),
    ).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Retry now' }));
    await fireEvent.press(
      screen.getByRole('button', { name: 'Use a different API token' }),
    );

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onUseDifferentToken).toHaveBeenCalledTimes(1);
  });

  it('asks before restarting an interrupted setup', async () => {
    const onContinueInterrupted = jest.fn(async () => undefined);
    const onUseAnotherApiKey = jest.fn(async () => undefined);
    await renderScreen(
      {
        status: 'interrupted',
        phase: 'account-connected',
        message: null,
        retryAt: null,
      },
      { onContinueInterrupted, onUseAnotherApiKey },
    );

    expect(screen.getByText('Setup was interrupted')).toBeTruthy();
    expect(screen.getByText(/restart the download from the beginning/i)).toBeTruthy();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Continue syncing' }),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Use another API key' }),
    );

    expect(onContinueInterrupted).toHaveBeenCalledTimes(1);
    expect(onUseAnotherApiKey).toHaveBeenCalledTimes(1);
  });
});

function renderScreen(
  state: InitialSyncState,
  overrides: Partial<React.ComponentProps<typeof InitialSyncScreen>> = {},
) {
  const props: React.ComponentProps<typeof InitialSyncScreen> = {
    state,
    busy: false,
    onRetry: async () => undefined,
    onUseDifferentToken: async () => undefined,
    onContinueInterrupted: async () => undefined,
    onUseAnotherApiKey: async () => undefined,
    ...overrides,
  };
  return renderApp(
    <ThemeProvider scheme="light">
      <InitialSyncScreen {...props} />
    </ThemeProvider>,
  );
}
