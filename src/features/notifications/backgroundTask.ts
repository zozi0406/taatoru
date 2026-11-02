import { getE2ERuntime } from '@/test/e2e/runtime';
import * as BackgroundTask from 'expo-background-task';
import * as Network from 'expo-network';
import * as TaskManager from 'expo-task-manager';

import { HttpWaniKaniApi } from '@/api/HttpWaniKaniApi';
import { RequestScheduler } from '@/api/RequestScheduler';
import { SyncCoordinator } from '@/features/sync/SyncCoordinator';
import { AccountDatabase } from '@/features/sync/FencedDatabase';
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
  if (getE2ERuntime() !== null) return Promise.resolve();
  return BackgroundTask.registerTaskAsync(REVIEW_BACKGROUND_TASK, {
    minimumInterval: 15,
  });
}

export async function runBackgroundQuickSync(): Promise<boolean> {
  if (getE2ERuntime() !== null) return true;
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
    const deadlineAt = Date.now() + 20_000;
    const engine = new OwnedSyncEngine({
      db, context, apiFactory: (lease, signal) => {
        const scheduler = new RequestScheduler(db, { deadlineAt });
        return new HttpWaniKaniApi({ token, signal,
          schedule: (operation, requestSignal) => scheduler.run(operation, lease, requestSignal),
          onRateLimit: (budget) => scheduler.recordBudget(budget, lease) });
      },
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
      updateNotifications: async (assertOwner) => {
        await notificationService.rebuild(
          await loadReviewNotificationInput(new AccountDatabase(db, context), new Date()),
          assertOwner,
        );
      },
      now: () => new Date(),
    });
    const coordinator = new SyncCoordinator({ db, context, engine });
    coordinator.setForeground(false);
    try {
      const result = await coordinator.request('background');
      return result.status !== 'failed' || result.error.retryAt !== null;
    } finally { coordinator.dispose(); }
  } finally {
    await db.close();
  }
}
