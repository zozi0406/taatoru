import { RetryCoordinator } from '../RetryCoordinator';

const START = new Date('2026-08-04T12:00:00.000Z');

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(START);
});

afterEach(() => {
  jest.useRealTimers();
});

test('launches once after a stable offline-to-online transition', async () => {
  const attempt = jest.fn(async () => undefined);
  const coordinator = coordinatorFor(attempt);

  coordinator.updateConnectivity(false);
  coordinator.updateConnectivity(true);
  coordinator.updateConnectivity(true);
  jest.advanceTimersByTime(1_999);
  expect(attempt).not.toHaveBeenCalled();

  await jest.advanceTimersByTimeAsync(1);

  expect(attempt).toHaveBeenCalledTimes(1);
});

test('does not treat the initial online observation as a reconnect', async () => {
  const attempt = jest.fn(async () => undefined);
  const coordinator = coordinatorFor(attempt);

  coordinator.updateConnectivity(true);
  await jest.advanceTimersByTimeAsync(2_000);

  expect(attempt).not.toHaveBeenCalled();
});

test('does not queue another attempt while one is running', async () => {
  let release!: () => void;
  const attempt = jest.fn(
    () => new Promise<void>((resolve) => {
      release = resolve;
    }),
  );
  const coordinator = coordinatorFor(attempt);

  coordinator.updateConnectivity(false);
  coordinator.updateConnectivity(true);
  await jest.advanceTimersByTimeAsync(2_000);
  coordinator.updateConnectivity(false);
  coordinator.updateConnectivity(true);

  await expect(coordinator.retryNow()).resolves.toBe(false);
  await jest.advanceTimersByTimeAsync(60_000);
  expect(attempt).toHaveBeenCalledTimes(1);

  release();
  await Promise.resolve();
  expect(coordinator.getState().running).toBe(false);
});

test('disposal cancels scheduled reconnect work', async () => {
  const attempt = jest.fn(async () => undefined);
  const coordinator = coordinatorFor(attempt);

  coordinator.updateConnectivity(false);
  coordinator.updateConnectivity(true);
  coordinator.dispose();
  await jest.advanceTimersByTimeAsync(2_000);

  expect(attempt).not.toHaveBeenCalled();
});

test('automatic and manual cooldowns suppress request storms', async () => {
  const attempt = jest.fn(async () => undefined);
  const coordinator = coordinatorFor(attempt);

  coordinator.updateConnectivity(false);
  coordinator.updateConnectivity(true);
  await jest.advanceTimersByTimeAsync(2_000);
  coordinator.updateConnectivity(false);
  coordinator.updateConnectivity(true);
  await jest.advanceTimersByTimeAsync(2_000);
  expect(attempt).toHaveBeenCalledTimes(1);

  await jest.advanceTimersByTimeAsync(5_000);
  await expect(coordinator.retryNow()).resolves.toBe(true);
  await expect(coordinator.retryNow()).resolves.toBe(false);
  expect(attempt).toHaveBeenCalledTimes(2);

  await jest.advanceTimersByTimeAsync(5_000);
  await expect(coordinator.retryNow()).resolves.toBe(true);
  expect(attempt).toHaveBeenCalledTimes(3);
});

test('server retry timing blocks automatic and manual attempts', async () => {
  const attempt = jest.fn(async () => undefined);
  const coordinator = coordinatorFor(attempt);
  coordinator.blockUntil('2026-08-04T12:01:00.000Z');

  coordinator.updateConnectivity(false);
  coordinator.updateConnectivity(true);
  await jest.advanceTimersByTimeAsync(2_000);
  await expect(coordinator.retryNow()).resolves.toBe(false);
  expect(attempt).not.toHaveBeenCalled();

  await jest.advanceTimersByTimeAsync(58_000);
  await expect(coordinator.retryNow()).resolves.toBe(false);
  expect(attempt).toHaveBeenCalledTimes(1);
});

test('rechecks eligibility before launching an attempt', async () => {
  const attempt = jest.fn(async () => undefined);
  const eligible = jest.fn(async () => false);
  const coordinator = new RetryCoordinator({
    attempt,
    eligible,
    now: () => Date.now(),
  });

  coordinator.updateConnectivity(false);
  coordinator.updateConnectivity(true);
  await jest.advanceTimersByTimeAsync(2_000);
  await expect(coordinator.retryNow()).resolves.toBe(false);

  expect(eligible).toHaveBeenCalledTimes(2);
  expect(attempt).not.toHaveBeenCalled();
});

function coordinatorFor(attempt: () => Promise<void>) {
  return new RetryCoordinator({
    attempt,
    eligible: async () => true,
    now: () => Date.now(),
  });
}
