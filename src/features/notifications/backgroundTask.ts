import * as BackgroundTask from 'expo-background-task';
import * as Network from 'expo-network';
import * as TaskManager from 'expo-task-manager';

import { HttpWaniKaniApi } from '@/api/HttpWaniKaniApi';
import { ExpoDatabase } from '@/db/ExpoDatabase';
import { migrateDatabase } from '@/db/migrate';
import { SecureTokenStore } from '@/features/auth/tokenStore';
import { PendingWriteSender } from '@/features/sync/PendingWriteSender';
import { SynchronizationEngine } from '@/features/sync/SyncEngine';
import { SyncRepository } from '@/features/sync/SyncRepository';
import {
  ExpoNotificationPlatform,
  loadReviewNotificationInput,
  NotificationService,
} from './NotificationService';

export const REVIEW_BACKGROUND_TASK = 'taatoru-review-quick-sync';

TaskManager.defineTask(REVIEW_BACKGROUND_TASK, async () => {
  try {
    return (await runBackgroundQuickSync())
      ? BackgroundTask.BackgroundTaskResult.Success
      : BackgroundTask.BackgroundTaskResult.Failed;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export function registerReviewBackgroundTask(): Promise<void> {
  return BackgroundTask.registerTaskAsync(REVIEW_BACKGROUND_TASK, {
    minimumInterval: 15,
  });
}

export async function runBackgroundQuickSync(): Promise<boolean> {
  const db = await ExpoDatabase.open();
  try {
    await migrateDatabase(db);
    const token = await new SecureTokenStore().get();
    if (token === null) {
      return true;
    }
    const api = new HttpWaniKaniApi({ token });
    const notificationService = new NotificationService(
      new ExpoNotificationPlatform(),
    );
    const engine = new SynchronizationEngine({
      api,
      repository: new SyncRepository(db),
      pendingWrites: new PendingWriteSender(db, api),
      isOnline: async () => {
        const network = await Network.getNetworkStateAsync();
        return (
          network.isConnected !== false &&
          network.isInternetReachable !== false
        );
      },
      invalidate: () => {
        //
      },
      updateNotifications: async () => {
        await notificationService.rebuild(
          await loadReviewNotificationInput(db, new Date()),
        );
      },
      now: () => new Date(),
    });
    return (await engine.synchronize('quick')).status !== 'failed';
  } finally {
    await db.close();
  }
}
