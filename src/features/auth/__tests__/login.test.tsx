import {
  act,
  fireEvent,
  screen,
} from '@testing-library/react-native';
import * as Linking from 'expo-linking';

import type { WaniKaniApi } from '@/api/WaniKaniApi';
import { ApiError } from '@/api/errors';
import type { Resource, UserData } from '@/api/types';
import { migrateDatabase } from '@/db/migrate';
import { NodeTestDatabase } from '@/db/NodeTestDatabase';
import { ResourceRepository } from '@/db/repositories/ResourceRepository';
import type { SyncResult } from '@/features/sync/SyncEngine';
import { SyncRepository } from '@/features/sync/SyncRepository';
import { userFixture } from '@/fixtures/api';
import { renderApp } from '@/test/render';
import { ThemeProvider } from '@/ui/theme/ThemeProvider';
import {
  AccountChangeRequiredError,
  AuthManager,
  EmptyTokenError,
  InvalidTokenError,
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
    expect(harness.tokenStore.set).toHaveBeenCalledWith('wk-token');
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
    await expect(
      harness.manager.login('new-token'),
    ).rejects.toThrow('initial WaniKani sync');
    expect(harness.tokenStore.set).not.toHaveBeenCalled();
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
    await expect(
      harness.manager.login('new-token'),
    ).rejects.toThrow('initial WaniKani sync');
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
    await expect(
      harness.manager.login('new-token'),
    ).rejects.toThrow('initial WaniKani sync');
    harness.synchronize.mockResolvedValueOnce({
      status: 'skipped',
      reason: 'offline',
    });

    await expect(
      harness.manager.login('new-token'),
    ).rejects.toThrow('initial WaniKani sync');
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

    await expect(
      harness.manager.resume('stored-token'),
    ).resolves.toEqual(userFixture);
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

    await expect(
      harness.manager.login('other-token'),
    ).rejects.toBeInstanceOf(AccountChangeRequiredError);
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
    get: jest.fn(async () => null),
    set: jest.fn(async (_token: string) => undefined),
    remove: jest.fn(async () => undefined),
  } satisfies jest.Mocked<TokenStore>;
  const api = {
    getUser: jest.fn(async () => user),
  } as unknown as WaniKaniApi & {
    getUser: jest.MockedFunction<WaniKaniApi['getUser']>;
  };
  const apiFactory = jest.fn(() => api);
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
    syncFactory: () => ({ synchronize }),
    clearAccount,
  });
  return {
    api,
    apiFactory,
    clearAccount,
    db,
    manager,
    synchronize,
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
    await db.first<{ count: number }>(
      'SELECT COUNT(*) AS count FROM pending_progress',
    )
  )?.count ?? 0;
}
