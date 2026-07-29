import * as Network from 'expo-network';
import {
  createContext,
  type PropsWithChildren,
  use,
  useEffect,
  useState,
} from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { HttpWaniKaniApi } from '@/api/HttpWaniKaniApi';
import type { WaniKaniApi } from '@/api/WaniKaniApi';
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
import {
  type SyncEngine,
  type SyncMode,
  type SyncResult,
  SynchronizationEngine,
} from '@/features/sync/SyncEngine';
import { SyncRepository } from '@/features/sync/SyncRepository';
import { useTheme } from '@/ui/theme/ThemeProvider';

export interface AppServices {
  readonly db: Database;
  readonly manager: AuthManager;
  readonly tokenStore: TokenStore;
  readonly isOnline: () => Promise<boolean>;
  readonly synchronize: (mode: SyncMode) => Promise<SyncResult>;
}

const AppServicesContext = createContext<AppServices | null>(null);

export function AppProviders({ children }: PropsWithChildren) {
  const theme = useTheme();
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
        const isOnline = async () => {
          try {
            const network = await Network.getNetworkStateAsync();
            return (
              network.isConnected !== false &&
              network.isInternetReachable !== false
            );
          } catch {
            return false;
          }
        };
        const createSyncEngine = (api: WaniKaniApi): SyncEngine =>
          new SynchronizationEngine({
            api,
            repository: syncRepository,
            pendingWrites: new PendingWriteSender(openedDatabase, api),
            isOnline,
            invalidate: () => {
              //
            },
            updateNotifications: () => {
              //
            },
            now: () => new Date(),
          });
        let runtimeToken: string | null = null;
        let runtimeSyncEngine: SyncEngine | null = null;
        const synchronize = async (mode: SyncMode): Promise<SyncResult> => {
          const token = await tokenStore.get();
          if (token === null) {
            return {
              status: 'failed',
              error: {
                kind: 'auth',
                message: 'Sign in again to synchronize.',
                status: 401,
                safeUrl: null,
                retryAt: null,
                hibernating: false,
              },
            };
          }
          if (runtimeSyncEngine === null || runtimeToken !== token) {
            runtimeToken = token;
            runtimeSyncEngine = createSyncEngine(
              new HttpWaniKaniApi({ token }),
            );
          }
          return runtimeSyncEngine.synchronize(mode);
        };
        const manager = new AuthManager({
          db: openedDatabase,
          tokenStore,
          apiFactory: (token) => new HttpWaniKaniApi({ token }),
          syncFactory: createSyncEngine,
          clearAccount: () => syncRepository.clearForLogout(),
        });
        if (active) {
          setServices({
            db: openedDatabase,
            manager,
            tokenStore,
            isOnline,
            synchronize,
          });
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
        <View
          style={[
            styles.loading,
            { backgroundColor: theme.colors.canvas },
          ]}
        >
          {error === null ? (
            <ActivityIndicator accessibilityLabel="Opening Taatoru" />
          ) : (
            <Text
              accessibilityRole="alert"
              selectable
              style={{ color: theme.colors.danger }}
            >
              {error}
            </Text>
          )}
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <AppServicesContext value={services}>
        <AuthProvider
          manager={services.manager}
          tokenStore={services.tokenStore}
        >
          {children}
        </AuthProvider>
      </AppServicesContext>
    </SafeAreaProvider>
  );
}

export function useAppServices(): AppServices {
  const services = use(AppServicesContext);
  if (services === null) {
    throw new Error('useAppServices must be used within AppProviders');
  }
  return services;
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
});
