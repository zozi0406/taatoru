import * as BackgroundTask from 'expo-background-task';
import * as Network from 'expo-network';
import * as TaskManager from 'expo-task-manager';

import { HttpWaniKaniApi } from '@/api/HttpWaniKaniApi';
import { ExpoDatabase } from '@/db/ExpoDatabase';
import { migrateDatabase } from '@/db/migrate';
import { SecureTokenStore } from '@/features/auth/tokenStore';
import { OwnedSyncEngine } from '@/features/sync/OwnedSyncEngine';
import { SyncControlRepository } from '@/features/sync/SyncControlRepository';
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
    const token = await new SecureTokenStore(db).get();
    const context = await new SyncControlRepository(db).getAccountContext();
    if (token === null || context === null) {
      return true;
    }
    const notificationService = new NotificationService(
      new ExpoNotificationPlatform(),
    );
    const engine = new OwnedSyncEngine({
      db, context, apiFactory: () => new HttpWaniKaniApi({ token }),
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
