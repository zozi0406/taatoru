import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  NotificationService,
  ExpoNotificationPlatform,
  type NotificationPlatform,
} from '../NotificationService';

jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 5 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  setNotificationChannelAsync: jest.fn(async () => null),
  scheduleNotificationAsync: jest.fn(async () => 'scheduled'),
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

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

test('uses Android system sound without requesting a custom default sound file', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  await new ExpoNotificationPlatform().createChannel();

  const channels = jest.mocked(Notifications.setNotificationChannelAsync).mock
    .calls;
  expect(channels).toHaveLength(2);
  expect(channels[0]![0]).toBe('reviews');
  expect(channels[0]![1]).not.toHaveProperty('sound');
  expect(channels[1]).toEqual([
    'reviews-silent',
    expect.objectContaining({ sound: null }),
  ]);
});

test.each([true, false])(
  'schedules sound=%s explicitly with its matching channel',
  async (sound) => {
    await new ExpoNotificationPlatform().schedule({
      id: 'reviews-hour-0',
      badge: 5,
      body: '2 new reviews available',
      cumulativeCount: 5,
      newCount: 2,
      sound,
      triggerAt: '2026-10-24T15:00:00.000Z',
    });

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({ sound }),
        trigger: expect.objectContaining({
          channelId: sound ? 'reviews' : 'reviews-silent',
        }),
      }),
    );
  },
);
