import * as Network from 'expo-network';
import { type PropsWithChildren, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { HttpWaniKaniApi } from '@/api/HttpWaniKaniApi';
import type { Database } from '@/db/Database';
import { ExpoDatabase } from '@/db/ExpoDatabase';
import { migrateDatabase } from '@/db/migrate';
import {
  AuthManager,
  AuthProvider,
} from '@/features/auth/AuthProvider';
import {
  SecureTokenStore,
  type TokenStore,
} from '@/features/auth/tokenStore';
import { PendingWriteSender } from '@/features/sync/PendingWriteSender';
import { SynchronizationEngine } from '@/features/sync/SyncEngine';
import { SyncRepository } from '@/features/sync/SyncRepository';

interface AppServices {
  readonly db: Database;
  readonly manager: AuthManager;
  readonly tokenStore: TokenStore;
}

export function AppProviders({ children }: PropsWithChildren) {
  const [services, setServices] = useState<AppServices | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let database: Database | null = null;
    void (async () => {
      try {
        const openedDatabase = await ExpoDatabase.open();
        await migrateDatabase(openedDatabase);
        if (!active) {
          await openedDatabase.close();
          return;
        }
        database = openedDatabase;
        const tokenStore = new SecureTokenStore();
        const syncRepository = new SyncRepository(openedDatabase);
        const manager = new AuthManager({
          db: openedDatabase,
          tokenStore,
          apiFactory: (token) => new HttpWaniKaniApi({ token }),
          syncFactory: (api) =>
            new SynchronizationEngine({
              api,
              repository: syncRepository,
              pendingWrites: new PendingWriteSender(openedDatabase, api),
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
              updateNotifications: () => {
                //
              },
              now: () => new Date(),
            }),
          clearAccount: () => syncRepository.clearForLogout(),
        });
        if (active) {
          setServices({ db: openedDatabase, manager, tokenStore });
        }
      } catch (bootstrapError) {
        if (active) {
          setError(
            bootstrapError instanceof Error
              ? bootstrapError.message
              : 'Unable to open Taatoru.',
          );
        }
      }
    })();

    return () => {
      active = false;
      if (database !== null) {
        void database.close();
      }
    };
  }, []);

  if (services === null) {
    return (
      <SafeAreaProvider>
        <View style={styles.loading}>
          {error === null ? (
            <ActivityIndicator accessibilityLabel="Opening Taatoru" />
          ) : (
            <Text accessibilityRole="alert">{error}</Text>
          )}
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <AuthProvider
        manager={services.manager}
        tokenStore={services.tokenStore}
      >
        {children}
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
});
