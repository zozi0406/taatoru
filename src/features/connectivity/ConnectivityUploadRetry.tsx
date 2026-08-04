import * as Network from 'expo-network';
import { useEffect } from 'react';

import type { Database } from '@/db/Database';
import type {
  SyncMode,
  SyncResult,
} from '@/features/sync/SyncEngine';

import { RetryCoordinator } from './RetryCoordinator';

interface ConnectivityUploadRetryProps {
  readonly db: Database;
  readonly synchronize: (mode: SyncMode) => Promise<SyncResult>;
}

interface PendingRow {
  readonly hasPending: number;
}

export function ConnectivityUploadRetry({
  db,
  synchronize,
}: ConnectivityUploadRetryProps) {
  useEffect(() => {
    let coordinator: RetryCoordinator;
    coordinator = new RetryCoordinator({
      eligible: async () => {
        const row = await db.first<PendingRow>(
          `SELECT CASE
             WHEN EXISTS(SELECT 1 FROM pending_progress)
               OR EXISTS(SELECT 1 FROM pending_study_materials)
             THEN 1 ELSE 0
           END AS hasPending`,
        );
        return row?.hasPending === 1;
      },
      attempt: async () => {
        const result = await synchronize('quick');
        if (result.status === 'failed') {
          coordinator.blockUntil(result.error.retryAt);
        }
      },
    });
    const subscription = Network.addNetworkStateListener((network) => {
      coordinator.updateConnectivity(
        network.isConnected !== false &&
          network.isInternetReachable !== false,
      );
    });
    return () => {
      subscription.remove();
      coordinator.dispose();
    };
  }, [db, synchronize]);

  return null;
}
