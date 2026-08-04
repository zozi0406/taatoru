import { act } from '@testing-library/react-native';
import * as Network from 'expo-network';

import type { Database } from '@/db/Database';
import { renderApp } from '@/test/render';

import { ConnectivityUploadRetry } from '../ConnectivityUploadRetry';

const START = new Date('2026-08-04T12:00:00.000Z');

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(START);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('does not synchronize on the first online observation', async () => {
  const harness = await renderRetry({ pending: true });

  await emitNetwork(harness.listener, true);
  await jest.advanceTimersByTimeAsync(2_000);

  expect(harness.synchronize).not.toHaveBeenCalled();
});

test('skips reconnect synchronization when the durable queue is empty', async () => {
  const harness = await renderRetry({ pending: false });

  await emitReconnect(harness.listener);
  await jest.advanceTimersByTimeAsync(2_000);

  expect(harness.db.first).toHaveBeenCalledTimes(1);
  expect(harness.synchronize).not.toHaveBeenCalled();
});

test('launches one quick sync for pending writes after a stable reconnect', async () => {
  const harness = await renderRetry({ pending: true });

  await emitReconnect(harness.listener);
  await emitNetwork(harness.listener, true);
  await jest.advanceTimersByTimeAsync(2_000);

  expect(harness.synchronize).toHaveBeenCalledTimes(1);
  expect(harness.synchronize).toHaveBeenCalledWith('quick');
});

test('honors server retry timing after a failed upload attempt', async () => {
  const harness = await renderRetry({
    pending: true,
    result: {
      status: 'failed',
      error: {
        kind: 'rate-limit',
        message: 'Try again later.',
        status: 429,
        safeUrl: null,
        retryAt: '2026-08-04T12:02:00.000Z',
        hibernating: false,
      },
    },
  });

  await emitReconnect(harness.listener);
  await jest.advanceTimersByTimeAsync(2_000);
  await jest.advanceTimersByTimeAsync(60_000);
  await emitReconnect(harness.listener);
  await jest.advanceTimersByTimeAsync(2_000);

  expect(harness.synchronize).toHaveBeenCalledTimes(1);
});

test('cancels a scheduled retry when the authenticated host unmounts', async () => {
  const harness = await renderRetry({ pending: true });

  await emitReconnect(harness.listener);
  harness.view.unmount();
  await jest.advanceTimersByTimeAsync(2_000);

  expect(harness.remove).toHaveBeenCalledTimes(1);
  expect(harness.synchronize).not.toHaveBeenCalled();
});

async function renderRetry({
  pending,
  result = { status: 'completed' as const, updatedResources: 0 },
}: {
  readonly pending: boolean;
  readonly result?: React.ComponentProps<
    typeof ConnectivityUploadRetry
  >['synchronize'] extends (...args: never[]) => Promise<infer R>
    ? R
    : never;
}) {
  const first = jest.fn(async () => ({ hasPending: pending ? 1 : 0 }));
  const db = { first } as unknown as Database;
  const synchronize = jest.fn(async () => result);
  const remove = jest.fn();
  const networkSpy = jest
    .spyOn(Network, 'addNetworkStateListener')
    .mockReturnValue({ remove });
  const view = await renderApp(
    <ConnectivityUploadRetry db={db} synchronize={synchronize} />,
  );
  const listener = networkSpy.mock.calls[0]?.[0];
  if (listener === undefined) throw new Error('Missing network listener');
  return { db: { first }, listener, remove, synchronize, view };
}

async function emitReconnect(
  listener: (event: Network.NetworkStateEvent) => void,
) {
  await emitNetwork(listener, false);
  await emitNetwork(listener, true);
}

async function emitNetwork(
  listener: (event: Network.NetworkStateEvent) => void,
  reachable: boolean,
) {
  await act(async () => {
    listener({
      isConnected: reachable,
      isInternetReachable: reachable,
    });
  });
}
