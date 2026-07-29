import {
  NotificationService,
  type NotificationPlatform,
} from '../NotificationService';

jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 5 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

test('creates the Android channel before requesting permission', async () => {
  const calls: string[] = [];
  const platform = fakePlatform(calls);
  platform.getPermission = jest.fn(async () => {
    calls.push('permission-status');
    return false;
  });

  const service = new NotificationService(platform);
  await service.enable({ alerts: true, badges: false, sound: false });

  expect(calls).toEqual(['channel', 'permission-status', 'permission-request']);
});

test('cancels and rebuilds deterministic notifications and badge state', async () => {
  const calls: string[] = [];
  const platform = fakePlatform(calls);
  const service = new NotificationService(platform);

  await service.rebuild({
    alerts: true,
    badges: true,
    currentReviewCount: 3,
    hourlyNewCounts: [2],
    now: new Date('2026-07-29T12:34:56.000Z'),
    sound: false,
    vacationActive: false,
  });

  expect(calls).toEqual([
    'channel',
    'permission-status',
    'cancel',
    'badge:3',
    'schedule:reviews-hour-0',
  ]);
});

test('clears notifications and badges during vacation mode', async () => {
  const calls: string[] = [];
  const service = new NotificationService(fakePlatform(calls));

  await service.rebuild({
    alerts: true,
    badges: true,
    currentReviewCount: 12,
    hourlyNewCounts: [3],
    now: new Date('2026-07-29T12:34:56.000Z'),
    sound: true,
    vacationActive: true,
  });

  expect(calls).toEqual(['channel', 'cancel', 'badge:0']);
});

function fakePlatform(calls: string[]): NotificationPlatform {
  return {
    cancelAll: jest.fn(async () => {
      calls.push('cancel');
    }),
    createChannel: jest.fn(async () => {
      calls.push('channel');
    }),
    getPermission: jest.fn(async () => {
      calls.push('permission-status');
      return true;
    }),
    requestPermission: jest.fn(async () => {
      calls.push('permission-request');
      return true;
    }),
    schedule: jest.fn(async ({ id }) => {
      calls.push(`schedule:${id}`);
    }),
    setBadge: jest.fn(async (count) => {
      calls.push(`badge:${count}`);
    }),
  };
}
