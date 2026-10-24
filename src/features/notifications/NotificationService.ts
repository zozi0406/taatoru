import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Database } from '@/db/Database';
import { NOT_EXCLUDED } from '@/db/repositories/AssignmentRepository';
import { DerivedRepository } from '@/db/repositories/DerivedRepository';
import { SUBJECT_WITHIN_GRANTED_LEVEL } from '@/db/subscription';
import {
  buildReviewNotificationSchedule,
  type ReviewNotificationInput,
  type ScheduledReviewNotification,
} from './schedule';

export interface NotificationPreferences {
  readonly alerts: boolean;
  readonly badges: boolean;
  readonly sound: boolean;
}

export interface NotificationPlatform {
  cancelAll(): Promise<void>;
  createChannel(): Promise<void>;
  getPermission(): Promise<boolean>;
  requestPermission(preferences: NotificationPreferences): Promise<boolean>;
  schedule(notification: ScheduledReviewNotification): Promise<void>;
  setBadge(count: number): Promise<void>;
}

export class NotificationService {
  constructor(private readonly platform: NotificationPlatform) {}

  async enable(preferences: NotificationPreferences): Promise<boolean> {
    await this.platform.createChannel();
    if (!preferences.alerts && !preferences.badges) {
      return false;
    }
    return (await this.platform.getPermission())
      ? true
      : this.platform.requestPermission(preferences);
  }

  async rebuild(input: ReviewNotificationInput): Promise<void> {
    await this.platform.createChannel();
    if (input.vacationActive) {
      await this.platform.cancelAll();
      await this.platform.setBadge(0);
      return;
    }
    if (!input.alerts && !input.badges) {
      await this.platform.cancelAll();
      await this.platform.setBadge(0);
      return;
    }
    if (!(await this.platform.getPermission())) {
      await this.platform.cancelAll();
      await this.platform.setBadge(0);
      return;
    }
    await this.platform.cancelAll();
    await this.platform.setBadge(
      input.badges ? input.currentReviewCount : 0,
    );
    for (const notification of buildReviewNotificationSchedule(input)) {
      await this.platform.schedule(notification);
    }
  }
}

export class ExpoNotificationPlatform implements NotificationPlatform {
  async createChannel(): Promise<void> {
    if (Platform.OS === 'android') {
      await Promise.all([
        // Sound strings name bundled files; omitting sound uses Android's default.
        Notifications.setNotificationChannelAsync('reviews', {
          name: 'Review availability',
          importance: Notifications.AndroidImportance.DEFAULT,
          showBadge: true,
        }),
        Notifications.setNotificationChannelAsync('reviews-silent', {
          name: 'Review availability (silent)',
          importance: Notifications.AndroidImportance.DEFAULT,
          showBadge: true,
          sound: null,
        }),
      ]);
    }
  }

  async getPermission(): Promise<boolean> {
    return (await Notifications.getPermissionsAsync()).granted;
  }

  async requestPermission(
    preferences: NotificationPreferences,
  ): Promise<boolean> {
    return (
      await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: preferences.alerts,
          allowBadge: preferences.badges,
          allowSound: preferences.sound,
        },
      })
    ).granted;
  }

  cancelAll(): Promise<void> {
    return Notifications.cancelAllScheduledNotificationsAsync();
  }

  async schedule(
    notification: ScheduledReviewNotification,
  ): Promise<void> {
    await Notifications.scheduleNotificationAsync({
      identifier: notification.id,
      content: {
        title: notification.body === null ? undefined : 'Reviews available',
        body: notification.body ?? undefined,
        badge: notification.badge ?? undefined,
        sound: notification.sound,
        data: {
          cumulativeCount: notification.cumulativeCount,
          newCount: notification.newCount,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(notification.triggerAt),
        channelId: notification.sound ? 'reviews' : 'reviews-silent',
      },
    });
  }

  async setBadge(count: number): Promise<void> {
    await Notifications.setBadgeCountAsync(count);
  }
}

interface NotificationUserRow {
  readonly resourceJson: string;
}

interface UpcomingRow {
  readonly availableAt: string;
}

interface SettingRow {
  readonly key: string;
  readonly value: string;
}

export async function loadReviewNotificationInput(
  db: Database,
  now: Date,
): Promise<ReviewNotificationInput> {
  const [reviews, upcoming, user, settings] = await Promise.all([
    new DerivedRepository(db).getAvailableReviews(now),
    db.all<UpcomingRow>(
      `SELECT a.available_at AS availableAt
       FROM assignments a
       JOIN subjects s ON s.id = a.subject_id
       WHERE a.srs_stage BETWEEN 1 AND 8
         AND a.available_at > ?
         AND a.hidden = 0
         AND s.hidden_at IS NULL
         AND ${SUBJECT_WITHIN_GRANTED_LEVEL}
         AND ${NOT_EXCLUDED}
       ORDER BY a.available_at`,
      [now.toISOString()],
    ),
    db.first<NotificationUserRow>(
      'SELECT resource_json AS resourceJson FROM user LIMIT 1',
    ),
    db.all<SettingRow>(
      `SELECT key, value FROM settings
       WHERE key IN (
         'notifications.alerts',
         'notifications.badges',
         'notifications.sound'
       )`,
    ),
  ]);
  const values = new Map(settings.map(({ key, value }) => [key, value]));
  const firstHour = new Date(now);
  firstHour.setMinutes(0, 0, 0);
  firstHour.setHours(firstHour.getHours() + 1);
  const hourlyNewCounts: number[] = [];
  for (const row of upcoming) {
    const available = new Date(row.availableAt);
    available.setMinutes(0, 0, 0);
    if (available.getTime() < new Date(row.availableAt).getTime()) {
      available.setHours(available.getHours() + 1);
    }
    const hour = Math.max(
      0,
      Math.round(
        (available.getTime() - firstHour.getTime()) / 3_600_000,
      ),
    );
    hourlyNewCounts[hour] = (hourlyNewCounts[hour] ?? 0) + 1;
  }
  return {
    alerts: settingBoolean(values.get('notifications.alerts'), false),
    badges: settingBoolean(values.get('notifications.badges'), true),
    sound: settingBoolean(values.get('notifications.sound'), false),
    currentReviewCount: reviews.length,
    hourlyNewCounts: Array.from(
      { length: hourlyNewCounts.length },
      (_, index) => hourlyNewCounts[index] ?? 0,
    ),
    now,
    vacationActive: vacationActive(user?.resourceJson),
  };
}

function settingBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === 'true' || value === '1';
}

function vacationActive(resourceJson: string | undefined): boolean {
  if (resourceJson === undefined) return false;
  try {
    const parsed: unknown = JSON.parse(resourceJson);
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      'data' in parsed &&
      typeof parsed.data === 'object' &&
      parsed.data !== null &&
      'current_vacation_started_at' in parsed.data &&
      parsed.data.current_vacation_started_at !== null
    );
  } catch {
    return false;
  }
}
