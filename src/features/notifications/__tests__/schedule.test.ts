import { buildReviewNotificationSchedule } from '../schedule';

const NOW = new Date('2026-07-29T12:34:56.000Z');

test('rounds to the next hour, skips empty buckets, and accumulates counts', () => {
  expect(
    buildReviewNotificationSchedule({
      alerts: true,
      badges: true,
      currentReviewCount: 3,
      hourlyNewCounts: [0, 2, 0, 4],
      now: NOW,
      sound: true,
      vacationActive: false,
    }),
  ).toEqual([
    {
      badge: 5,
      body: '5 reviews available (2 new)',
      cumulativeCount: 5,
      id: 'reviews-hour-1',
      newCount: 2,
      sound: true,
      triggerAt: '2026-07-29T14:00:00.000Z',
    },
    {
      badge: 9,
      body: '9 reviews available (4 new)',
      cumulativeCount: 9,
      id: 'reviews-hour-3',
      newCount: 4,
      sound: true,
      triggerAt: '2026-07-29T16:00:00.000Z',
    },
  ]);
});

test('honors alert, badge, and sound preferences independently', () => {
  expect(
    buildReviewNotificationSchedule({
      alerts: false,
      badges: true,
      currentReviewCount: 0,
      hourlyNewCounts: [1],
      now: NOW,
      sound: false,
      vacationActive: false,
    }),
  ).toEqual([
    expect.objectContaining({ badge: 1, body: null, sound: false }),
  ]);
});

test('suppresses vacation schedules and caps notifications at 64', () => {
  const counts = Array.from({ length: 100 }, () => 1);
  expect(
    buildReviewNotificationSchedule({
      alerts: true,
      badges: true,
      currentReviewCount: 0,
      hourlyNewCounts: counts,
      now: NOW,
      sound: false,
      vacationActive: false,
    }),
  ).toHaveLength(64);
  expect(
    buildReviewNotificationSchedule({
      alerts: true,
      badges: true,
      currentReviewCount: 0,
      hourlyNewCounts: counts,
      now: NOW,
      sound: false,
      vacationActive: true,
    }),
  ).toEqual([]);
});
