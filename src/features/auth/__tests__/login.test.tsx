import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Linking from 'expo-linking';
import * as Network from 'expo-network';
import { Pressable, Text } from 'react-native';

import type { WaniKaniApi } from '@/api/WaniKaniApi';
import { ApiError, NetworkError } from '@/api/errors';
import type { Resource, UserData } from '@/api/types';
import { migrateDatabase } from '@/db/migrate';
import { NodeTestDatabase } from '@/db/NodeTestDatabase';
import { ResourceRepository } from '@/db/repositories/ResourceRepository';
import type { SyncResult } from '@/features/sync/SyncEngine';
import { SyncRepository } from '@/features/sync/SyncRepository';
import { createSyncStore } from '@/features/sync/syncStore';
import { userFixture } from '@/fixtures/api';
import { renderApp } from '@/test/render';
import { ThemeProvider } from '@/ui/theme/ThemeProvider';
import {
  AccountChangeRequiredError,
  AuthManager,
  AuthProvider,
  EmptyTokenError,
  InitialSyncError,
  InvalidTokenError,
  useAuth,
} from '../AuthProvider';
import { LoginScreen } from '../LoginScreen';
import type { TokenStore } from '../tokenStore';

afterEach(() => {
  jest.restoreAllMocks();
});

test('rejects an empty token before making a request', async () => {
  const harness = await authHarness();
  try {
    await expect(harness.manager.login('   ')).rejects.toBeInstanceOf(
      EmptyTokenError,
    );
    expect(harness.apiFactory).not.toHaveBeenCalled();
    expect(harness.tokenStore.set).not.toHaveBeenCalled();
  } finally {
    await harness.db.close();
  }
});

test('validates, persists, and starts the first quick sync', async () => {
  const harness = await authHarness();
  try {
    await expect(harness.manager.login('  wk-token  ')).resolves.toEqual(
      userFixture,
    );
    expect(harness.apiFactory).toHaveBeenCalledWith('wk-token');
    expect(harness.api.getUser).toHaveBeenCalledTimes(1);
    expect(harness.tokenStore.setPending).toHaveBeenCalledWith('wk-token');
    expect(harness.tokenStore.set).toHaveBeenCalledWith('wk-token');
    expect(harness.tokenStore.removePending).toHaveBeenCalledTimes(1);
    expect(
      harness.tokenStore.setPending.mock.invocationCallOrder[0],
    ).toBeLessThan(harness.synchronize.mock.invocationCallOrder[0]!);
    expect(harness.tokenStore.set.mock.invocationCallOrder[0]).toBeLessThan(
      harness.tokenStore.removePending.mock.invocationCallOrder[0]!,
    );
    expect(harness.synchronize).toHaveBeenCalledWith('quick');
  } finally {
    await harness.db.close();
  }
});

test('does not authenticate or persist a token when the required initial sync fails', async () => {
  const harness = await authHarness();
  harness.synchronize.mockResolvedValueOnce({
    status: 'failed',
    error: {
      kind: 'network',
      message: 'Network request failed',
      status: null,
      safeUrl: null,
      retryAt: null,
      hibernating: false,
    },
  });
  try {
    await expect(harness.manager.login('new-token')).rejects.toThrow(
      'initial WaniKani sync',
    );
    expect(harness.tokenStore.setPending).toHaveBeenCalledWith('new-token');
    expect(harness.tokenStore.set).not.toHaveBeenCalled();
    expect(harness.tokenStore.removePending).not.toHaveBeenCalled();
    await expect(
      harness.db.first('SELECT id FROM user LIMIT 1'),
    ).resolves.toBeNull();
  } finally {
    await harness.db.close();
  }
});

test('does not authenticate when initial synchronization completes without caching the user', async () => {
  const harness = await authHarness();
  harness.synchronize.mockResolvedValueOnce({
    status: 'completed',
    updatedResources: 0,
  });
  try {
    await expect(harness.manager.login('new-token')).rejects.toThrow(
      'initial WaniKani sync',
    );
    expect(harness.tokenStore.set).not.toHaveBeenCalled();
  } finally {
    await harness.db.close();
  }
});

test('does not treat a partial user row from a failed first sync as an offline cache', async () => {
  const harness = await authHarness();
  harness.synchronize.mockImplementationOnce(async () => {
    await new ResourceRepository(harness.db).replaceUser(userFixture);
    return {
      status: 'failed',
      error: {
        kind: 'network',
        message: 'Network request failed',
        status: null,
        safeUrl: null,
        retryAt: null,
        hibernating: false,
      },
    };
  });
  try {
    await expect(harness.manager.login('new-token')).rejects.toThrow(
      'initial WaniKani sync',
    );
    harness.synchronize.mockResolvedValueOnce({
      status: 'skipped',
      reason: 'offline',
    });

    await expect(harness.manager.login('new-token')).rejects.toThrow(
      'initial WaniKani sync',
    );
    expect(harness.tokenStore.set).not.toHaveBeenCalled();
  } finally {
    await harness.db.close();
  }
});

test('resumes from the cached user while startup synchronization is offline', async () => {
  const harness = await authHarness();
  try {
    await new ResourceRepository(harness.db).replaceUser(userFixture);
    await new SyncRepository(harness.db).markSyncCompleted(
      'quick',
      new Date('2026-07-29T12:00:00.000Z'),
    );
    harness.synchronize.mockResolvedValueOnce({
      status: 'skipped',
      reason: 'offline',
    });

    await expect(harness.manager.resume('stored-token')).resolves.toEqual(
      userFixture,
    );
    expect(harness.api.getUser).not.toHaveBeenCalled();
    expect(harness.apiFactory).toHaveBeenCalledWith('stored-token');
  } finally {
    await harness.db.close();
  }
});

test('does not persist an invalid token', async () => {
  const harness = await authHarness();
  harness.api.getUser.mockRejectedValueOnce(
    new ApiError('Unauthorized', { status: 401 }),
  );
  try {
    await expect(harness.manager.login('bad-token')).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
    expect(harness.tokenStore.set).not.toHaveBeenCalled();
    expect(harness.tokenStore.setPending).not.toHaveBeenCalled();
    expect(harness.synchronize).not.toHaveBeenCalled();
  } finally {
    await harness.db.close();
  }
});

test('same-account reauthentication preserves cached and pending data', async () => {
  const harness = await authHarness();
  try {
    await new ResourceRepository(harness.db).replaceUser(userFixture);
    await seedPending(harness.db);

    await harness.manager.login('replacement-token');

    expect(harness.clearAccount).not.toHaveBeenCalled();
    await expect(pendingCount(harness.db)).resolves.toBe(1);
  } finally {
    await harness.db.close();
  }
});

test('a different account requires explicit replacement before pending data is cleared', async () => {
  const otherUser = {
    ...userFixture,
    data: { ...userFixture.data, id: 'another-user-id' },
  } satisfies Resource<UserData, 'user'>;
  const harness = await authHarness(otherUser);
  try {
    await new ResourceRepository(harness.db).replaceUser(userFixture);
    await seedPending(harness.db);

    await expect(harness.manager.login('other-token')).rejects.toBeInstanceOf(
      AccountChangeRequiredError,
    );
    expect(harness.tokenStore.set).not.toHaveBeenCalled();
    await expect(pendingCount(harness.db)).resolves.toBe(1);

    await harness.manager.changeAccount('other-token');
    expect(harness.clearAccount).toHaveBeenCalledTimes(1);
    await expect(pendingCount(harness.db)).resolves.toBe(0);
    expect(harness.tokenStore.set).toHaveBeenCalledWith('other-token');
    expect(harness.synchronize).toHaveBeenCalledWith('quick');
  } finally {
    await harness.db.close();
  }
});

test('exposes interrupted setup without making a request on launch', async () => {
  const harness = await authHarness();
  harness.tokenStore.getPending.mockResolvedValueOnce('pending-token');
  const addNetworkListener = jest.spyOn(Network, 'addNetworkStateListener');
  try {
    await renderApp(
      <AuthProvider manager={harness.manager} tokenStore={harness.tokenStore}>
        <AuthStateProbe />
      </AuthProvider>,
    );

    expect((await screen.findByTestId('auth-state')).props.children).toContain(
      '"status":"interrupted"',
    );
    expect(harness.apiFactory).not.toHaveBeenCalled();
    expect(harness.synchronize).not.toHaveBeenCalled();
    expect(addNetworkListener).not.toHaveBeenCalled();
  } finally {
    await harness.db.close();
  }
});

test('restarts interrupted setup after clearing the incomplete cache', async () => {
  const harness = await authHarness();
  harness.tokenStore.getPending.mockResolvedValue('pending-token');
  await new ResourceRepository(harness.db).replaceUser(userFixture);
  await harness.db.run(
    "INSERT INTO settings (key, value) VALUES ('theme', 'dark')",
  );
  harness.synchronize.mockImplementationOnce(async () => {
    const state = await new SyncRepository(harness.db).getStateSnapshot();
    expect(Object.values(state.cursors)).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
    await new ResourceRepository(harness.db).replaceUser(userFixture);
    await new SyncRepository(harness.db).markSyncCompleted(
      'quick',
      new Date('2026-08-04T12:00:00.000Z'),
    );
    return { status: 'completed', updatedResources: 1 };
  });
  try {
    await expect(harness.manager.continueInterruptedSetup()).resolves.toEqual(
      userFixture,
    );

    expect(harness.clearAccount.mock.invocationCallOrder[0]).toBeLessThan(
      harness.api.getUser.mock.invocationCallOrder[0]!,
    );
    await expect(
      harness.db.first('SELECT value FROM settings WHERE key = ?', ['theme']),
    ).resolves.toEqual({ value: 'dark' });
  } finally {
    await harness.db.close();
  }
});

test('using another API key clears partial data and the pending credential', async () => {
  const harness = await authHarness();
  await new ResourceRepository(harness.db).replaceUser(userFixture);
  await harness.db.run(
    "INSERT INTO settings (key, value) VALUES ('theme', 'dark')",
  );
  try {
    await harness.manager.useAnotherApiKey();

    expect(harness.apiFactory).not.toHaveBeenCalled();
    expect(harness.clearAccount.mock.invocationCallOrder[0]).toBeLessThan(
      harness.tokenStore.removePending.mock.invocationCallOrder[0]!,
    );
    await expect(
      harness.db.first('SELECT id FROM user LIMIT 1'),
    ).resolves.toBeNull();
    await expect(
      harness.db.first('SELECT value FROM settings WHERE key = ?', ['theme']),
    ).resolves.toEqual({ value: 'dark' });
  } finally {
    await harness.db.close();
  }
});

test('reports real synchronization phases during initial setup', async () => {
  const harness = await authHarness();
  const report = jest.fn();
  harness.synchronize.mockImplementationOnce(async () => {
    harness.syncStore.setState({ isSyncing: true, phase: 'phase-one' });
    harness.syncStore.setState({ isSyncing: true, phase: 'phase-two' });
    await new ResourceRepository(harness.db).replaceUser(userFixture);
    await new SyncRepository(harness.db).markSyncCompleted(
      'quick',
      new Date('2026-08-04T12:00:00.000Z'),
    );
    harness.syncStore.setState({ isSyncing: true, phase: 'finalizing' });
    return { status: 'completed', updatedResources: 1 };
  });
  try {
    await harness.manager.login('new-token', report);

    expect(report.mock.calls.map(([state]) => state.phase)).toEqual(
      expect.arrayContaining([
        'account-connected',
        'subjects',
        'account-data',
        'offline-library',
      ]),
    );
  } finally {
    await harness.db.close();
  }
});

test.each([
  [
    'offline',
    { status: 'skipped', reason: 'offline' } as const,
    'connection-issues',
    null,
  ],
  [
    'network',
    {
      status: 'failed',
      error: {
        kind: 'network',
        message: 'Could not reach WaniKani',
        status: null,
        safeUrl: null,
        retryAt: null,
        hibernating: false,
      },
    } as const,
    'connection-issues',
    null,
  ],
  [
    'rate limited API',
    {
      status: 'failed',
      error: {
        kind: 'api',
        message: 'Try later',
        status: 429,
        safeUrl: null,
        retryAt: '2026-08-04T12:01:00.000Z',
        hibernating: false,
      },
    } as const,
    'attention',
    '2026-08-04T12:01:00.000Z',
  ],
])(
  'classifies %s initial-sync failure safely',
  async (_label, result, expectedStatus, retryAt) => {
    const harness = await authHarness();
    const report = jest.fn();
    harness.synchronize.mockResolvedValueOnce(result);
    try {
      const failure = await harness.manager
        .login('new-token', report)
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(InitialSyncError);
      expect(failure).toMatchObject({ retryAt });
      expect(report).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: expectedStatus, retryAt }),
      );
    } finally {
      await harness.db.close();
    }
  },
);

test('retries initial sync when setup starts offline and connectivity returns', async () => {
  const harness = await authHarness();
  harness.tokenStore.getPending.mockResolvedValue('pending-token');
  harness.synchronize.mockResolvedValueOnce({
    status: 'skipped',
    reason: 'offline',
  });
  jest.spyOn(Network, 'getNetworkStateAsync').mockResolvedValue({
    isConnected: false,
    isInternetReachable: false,
  });
  let networkListener: ((state: Network.NetworkState) => void) | null = null;
  jest
    .spyOn(Network, 'addNetworkStateListener')
    .mockImplementation((listener) => {
      networkListener = listener;
      return { remove: jest.fn() };
    });
  try {
    await renderApp(
      <AuthProvider manager={harness.manager} tokenStore={harness.tokenStore}>
        <AuthStateProbe />
      </AuthProvider>,
    );
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Test continue' }));
    });
    await waitFor(() =>
      expect(screen.getByTestId('auth-state').props.children).toContain(
        'connection-issues',
      ),
    );
    expect(networkListener).not.toBeNull();

    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-04T12:00:00.000Z'));
    await act(async () => {
      networkListener?.({ isConnected: true, isInternetReachable: true });
      networkListener?.({ isConnected: true, isInternetReachable: true });
      await jest.advanceTimersByTimeAsync(2_000);
    });

    expect(harness.synchronize).toHaveBeenCalledTimes(2);
  } finally {
    jest.useRealTimers();
    await harness.db.close();
  }
});

test('shows setup attention when a pending credential is no longer valid', async () => {
  const harness = await authHarness();
  harness.tokenStore.getPending.mockResolvedValue('revoked-token');
  harness.api.getUser.mockRejectedValueOnce(
    new ApiError('Unauthorized', { status: 401 }),
  );
  try {
    await renderApp(
      <AuthProvider manager={harness.manager} tokenStore={harness.tokenStore}>
        <AuthStateProbe />
      </AuthProvider>,
    );
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Test continue' }));
    });

    await waitFor(() =>
      expect(screen.getByTestId('auth-state').props.children).toContain(
        'attention',
      ),
    );
  } finally {
    await harness.db.close();
  }
});

test('keeps connection-issue guidance when manual retry cannot revalidate offline', async () => {
  const harness = await authHarness();
  harness.tokenStore.getPending.mockResolvedValue('pending-token');
  harness.synchronize.mockResolvedValueOnce({
    status: 'skipped',
    reason: 'offline',
  });
  jest
    .spyOn(Network, 'addNetworkStateListener')
    .mockReturnValue({ remove: jest.fn() });
  try {
    await renderApp(
      <AuthProvider manager={harness.manager} tokenStore={harness.tokenStore}>
        <AuthStateProbe />
      </AuthProvider>,
    );
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Test continue' }));
    });
    await waitFor(() =>
      expect(screen.getByTestId('auth-state').props.children).toContain(
        'connection-issues',
      ),
    );
    harness.api.getUser.mockRejectedValueOnce(
      new NetworkError('Network request failed'),
    );

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Test retry' }));
    });
    await waitFor(() => expect(harness.api.getUser).toHaveBeenCalledTimes(2));

    expect(screen.getByTestId('auth-state').props.children).toContain(
      'connection-issues',
    );
    expect(screen.getByTestId('auth-state').props.children).not.toContain(
      '"status":"attention"',
    );
  } finally {
    await harness.db.close();
  }
});

test('guides a new user through WaniKani token creation', async () => {
  await renderLoginScreen();

  expect(
    screen.getByText(/never sees your WaniKani password/i),
  ).toBeOnTheScreen();
  expect(screen.getByText(/1\. Sign in to WaniKani/i)).toBeOnTheScreen();
  expect(
    screen.getByText(/2\. Create a token named Taatoru/i),
  ).toBeOnTheScreen();
  expect(screen.getByText(/3\. Copy the token/i)).toBeOnTheScreen();
});

test('opens the official WaniKani token page', async () => {
  const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValueOnce(true);
  await renderLoginScreen();

  await act(async () => {
    fireEvent.press(
      screen.getByRole('link', { name: 'Open WaniKani API Tokens' }),
    );
  });

  expect(openUrl).toHaveBeenCalledWith(
    'https://www.wanikani.com/settings/personal_access_tokens',
  );
});

test('shows the official address when the browser cannot open', async () => {
  jest
    .spyOn(Linking, 'openURL')
    .mockRejectedValueOnce(new Error('no browser handler'));
  await renderLoginScreen();

  await act(async () => {
    fireEvent.press(
      screen.getByRole('link', { name: 'Open WaniKani API Tokens' }),
    );
  });

  expect(screen.getByRole('alert')).toHaveTextContent(
    /https:\/\/www\.wanikani\.com\/settings\/personal_access_tokens/,
  );
});

test('masks token input and submits its value', async () => {
  const onLogin = jest.fn(async () => undefined);
  await renderApp(
    <ThemeProvider scheme="light">
      <LoginScreen
        busy={false}
        error={null}
        requiresAccountChange={false}
        onLogin={onLogin}
        onChangeAccount={jest.fn()}
      />
    </ThemeProvider>,
  );

  const input = screen.getByLabelText('WaniKani API token');
  expect(input.props.secureTextEntry).toBe(true);
  await act(async () => {
    fireEvent.changeText(input, 'secret-token');
  });
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Connect account' }));
  });
  expect(onLogin).toHaveBeenCalledWith('secret-token');
});

test('submits an explicitly confirmed account replacement separately', async () => {
  const onLogin = jest.fn(async () => undefined);
  const onChangeAccount = jest.fn(async () => undefined);
  await renderApp(
    <ThemeProvider scheme="light">
      <LoginScreen
        busy={false}
        error="This token belongs to a different WaniKani account."
        requiresAccountChange
        onLogin={onLogin}
        onChangeAccount={onChangeAccount}
      />
    </ThemeProvider>,
  );

  await act(async () => {
    fireEvent.changeText(
      screen.getByLabelText('WaniKani API token'),
      'replacement-token',
    );
  });
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Replace account' }));
  });

  expect(onChangeAccount).toHaveBeenCalledWith('replacement-token');
  expect(onLogin).not.toHaveBeenCalled();
});

test('explains hibernation during sign-in without asking for a password', async () => {
  await renderApp(
    <ThemeProvider scheme="light">
      <LoginScreen
        busy={false}
        error="The user is hibernating"
        requiresAccountChange={false}
        onLogin={jest.fn()}
        onChangeAccount={jest.fn()}
      />
    </ThemeProvider>,
  );
  expect(
    screen.getByText('WaniKani account needs attention'),
  ).toBeOnTheScreen();
  expect(screen.getByRole('link', { name: 'Open WaniKani' })).toBeOnTheScreen();
  expect(screen.queryByText('The user is hibernating')).not.toBeOnTheScreen();
  expect(screen.getByLabelText('WaniKani API token')).toBeOnTheScreen();
});

async function renderLoginScreen() {
  return renderApp(
    <ThemeProvider scheme="light">
      <LoginScreen
        busy={false}
        error={null}
        requiresAccountChange={false}
        onLogin={jest.fn()}
        onChangeAccount={jest.fn()}
      />
    </ThemeProvider>,
  );
}

async function authHarness(user = userFixture) {
  const db = await NodeTestDatabase.open();
  await migrateDatabase(db);
  const tokenStore = {
    get: jest.fn<Promise<string | null>, []>(async () => null),
    set: jest.fn(async (_token: string) => undefined),
    remove: jest.fn(async () => undefined),
    getPending: jest.fn<Promise<string | null>, []>(async () => null),
    setPending: jest.fn(async (_token: string) => undefined),
    removePending: jest.fn(async () => undefined),
  } satisfies jest.Mocked<TokenStore>;
  const api = {
    getUser: jest.fn(async () => user),
  } as unknown as WaniKaniApi & {
    getUser: jest.MockedFunction<WaniKaniApi['getUser']>;
  };
  const apiFactory = jest.fn(() => api);
  const syncStore = createSyncStore();
  const synchronize = jest.fn<Promise<SyncResult>, []>(async () => {
    await new ResourceRepository(db).replaceUser(user);
    await new SyncRepository(db).markSyncCompleted(
      'quick',
      new Date('2026-07-29T12:00:00.000Z'),
    );
    return {
      status: 'completed',
      updatedResources: 0,
    };
  });
  const clearAccount = jest.fn(async () => {
    await new SyncRepository(db).clearForLogout();
  });
  const manager = new AuthManager({
    db,
    tokenStore,
    apiFactory,
    syncFactory: () => ({ store: syncStore, synchronize }),
    clearAccount,
  });
  return {
    api,
    apiFactory,
    clearAccount,
    db,
    manager,
    synchronize,
    syncStore,
    tokenStore,
  };
}

async function seedPending(db: NodeTestDatabase): Promise<void> {
  await db.run(
    `INSERT INTO pending_progress (
      subject_id, assignment_id, operation_kind, created_at, payload_json
    ) VALUES (999, 999, 'lesson_start', '2026-07-29T12:00:00.000Z', '{}')`,
  );
}

async function pendingCount(db: NodeTestDatabase): Promise<number> {
  return (
    (
      await db.first<{ count: number }>(
        'SELECT COUNT(*) AS count FROM pending_progress',
      )
    )?.count ?? 0
  );
}

function AuthStateProbe() {
  const auth = useAuth();
  return (
    <>
      <Text testID="auth-state">{JSON.stringify(auth)}</Text>
      <Pressable
        accessibilityLabel="Test continue"
        accessibilityRole="button"
        onPress={() => void auth.continueInterruptedSetup()}
      />
      <Pressable
        accessibilityLabel="Test retry"
        accessibilityRole="button"
        onPress={() => void auth.retryInitialSync()}
      />
    </>
  );
}
