import * as Network from 'expo-network';
import {
  createContext,
  type PropsWithChildren,
  use,
  useEffect,
  useState,
} from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { HttpWaniKaniApi } from '@/api/HttpWaniKaniApi';
import type { Database } from '@/db/Database';
import { ExpoDatabase } from '@/db/ExpoDatabase';
import { migrateDatabase } from '@/db/migrate';
import {
  AuthManager,
  AuthProvider,
  useAuth,
} from '@/features/auth/AuthProvider';
import { SecureTokenStore, type TokenStore } from '@/features/auth/tokenStore';
import { observeConnectivity } from '@/features/connectivity/observeConnectivity';
import { RequestScheduler } from '@/api/RequestScheduler';
import { SyncCoordinator } from '@/features/sync/SyncCoordinator';
import { OwnedSyncEngine } from '@/features/sync/OwnedSyncEngine';
import { SyncControlRepository } from '@/features/sync/SyncControlRepository';
import type { AccountContext } from '@/features/sync/types';
import {
  ExpoNotificationPlatform,
  loadReviewNotificationInput,
  NotificationService,
} from '@/features/notifications/NotificationService';
import { registerReviewBackgroundTask } from '@/features/notifications/backgroundTask';
import {
  type SyncEngine,
  type SyncMode,
  type SyncResult,
} from '@/features/sync/SyncEngine';
import { SyncRepository } from '@/features/sync/SyncRepository';
import { useTheme } from '@/ui/theme/ThemeProvider';

export interface AppServices {
  readonly db: Database;
  readonly manager: AuthManager;
  readonly tokenStore: TokenStore;
  readonly isOnline: () => Promise<boolean>;
  readonly rebuildNotifications: () => Promise<void>;
  readonly synchronize: (mode: SyncMode) => Promise<SyncResult>;
  readonly notifyPendingWrites: () => void;
  readonly setForeground: (active: boolean) => void;
}

const AppServicesContext = createContext<AppServices | null>(null);

export function AppProviders({ children }: PropsWithChildren) {
  const theme = useTheme();
  const [services, setServices] = useState<AppServices | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let database: Database | null = null;
    let disposeRuntime = () => {};
    void (async () => {
      try {
        const openedDatabase = await ExpoDatabase.open();
        if (!active) {
          await openedDatabase.close();
          return;
        }
        database = openedDatabase;
        await migrateDatabase(openedDatabase);
        if (!active) return;
        const tokenStore = new SecureTokenStore(openedDatabase);
        const syncRepository = new SyncRepository(openedDatabase);
        const notificationService = new NotificationService(
          new ExpoNotificationPlatform(),
        );
        const rebuildNotifications = async () => {
          await notificationService.rebuild(
            await loadReviewNotificationInput(openedDatabase, new Date()),
          );
        };
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
        const control = new SyncControlRepository(openedDatabase);
        let runtimeToken: string | null = null;
        let runtimeSyncEngine: SyncCoordinator | null = null;
        let runtimeContextKey: string | null = null;
        disposeRuntime = () => runtimeSyncEngine?.dispose();
        const createSyncEngine = (token: string, context: AccountContext): SyncEngine => {
          const contextKey = `${context.accountEpoch}:${context.credentialRevision}`;
          if (runtimeSyncEngine !== null && runtimeToken === token && runtimeContextKey === contextKey) return runtimeSyncEngine;
          runtimeSyncEngine?.dispose();
          const engine = new OwnedSyncEngine({
            db: openedDatabase, context,
            apiFactory: (lease, signal) => {
              const scheduler = new RequestScheduler(openedDatabase);
              return new HttpWaniKaniApi({ token, signal,
                schedule: (operation, requestSignal) => scheduler.run(operation, lease, requestSignal),
                onRateLimit: (budget) => scheduler.recordBudget(budget, lease),
              });
            },
            isOnline, invalidate: () => {},
            updateNotifications: rebuildNotifications,
            now: () => new Date(),
          });
          runtimeSyncEngine = new SyncCoordinator({ db: openedDatabase, context, engine });
          // AuthProvider owns initial-setup retry timing until the account opens.
          runtimeSyncEngine.setForeground(false);
          runtimeToken = token; runtimeContextKey = contextKey;
          return runtimeSyncEngine;
        };
        const synchronize = async (mode: SyncMode): Promise<SyncResult> => {
          const token = await tokenStore.get();
          const context = await control.getAccountContext();
          if (token === null || context === null) {
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
          return createSyncEngine(token, context).synchronize(mode);
        };
        void registerReviewBackgroundTask().catch(() => {
          // Background execution is opportunistic and may be unavailable.
        });
        const manager = new AuthManager({
          db: openedDatabase,
          tokenStore,
          apiFactory: (token, reservation) => {
            if (reservation === undefined) throw new Error('Missing credential reservation');
            const scheduler = new RequestScheduler(openedDatabase);
            return new HttpWaniKaniApi({ token,
              schedule: (operation, signal) => scheduler.run(operation, reservation, signal),
              onRateLimit: (budget) => scheduler.recordBudget(budget, reservation),
            });
          },
          syncFactory: createSyncEngine,
          clearAccount: () => syncRepository.clearForLogout(),
        });
        if (active) {
          setServices({
            db: openedDatabase,
            manager,
            tokenStore,
            isOnline,
            rebuildNotifications,
            synchronize,
            notifyPendingWrites: () => runtimeSyncEngine?.notifyPendingWrites(),
            setForeground: (value) => runtimeSyncEngine?.setForeground(value),
          });
        }
      } catch (bootstrapError) {
        const failedDatabase = database;
        database = null;
        if (failedDatabase !== null)
          await failedDatabase.close().catch(() => undefined);
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
      disposeRuntime();
      if (database !== null) {
        const closingDatabase = database;
        database = null;
        void closingDatabase.close().catch(() => undefined);
      }
    };
  }, [bootstrapAttempt]);

  useEffect(() => {
    if (services === null) {
      return;
    }
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        services.setForeground(false);
        void services.rebuildNotifications().catch(() => {
          // Notification refresh should not block the app entering background.
        });
      }
      if (state === 'active') services.setForeground(true);
    });
    return () => {
      subscription.remove();
    };
  }, [services]);

  if (services === null) {
    return (
      <SafeAreaProvider>
        <View
          style={[styles.loading, { backgroundColor: theme.colors.canvas }]}
        >
          {error === null ? (
            <ActivityIndicator accessibilityLabel="Opening Taatoru" />
          ) : (
            <View style={{ gap: 16, padding: 24 }}>
              <Text
                accessibilityRole="alert"
                style={[theme.typography.body, { color: theme.colors.danger }]}
              >
                Unable to open your local library. Please try again.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry opening Taatoru"
                onPress={() => {
                  setError(null);
                  setBootstrapAttempt((value) => value + 1);
                }}
                style={{
                  minHeight: 48,
                  padding: 14,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.accent,
                }}
              >
                <Text
                  style={[
                    theme.typography.label,
                    { color: theme.colors.accentForeground },
                  ]}
                >
                  Try again
                </Text>
              </Pressable>
            </View>
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
          <AuthenticatedRuntime services={services}>
            {children}
          </AuthenticatedRuntime>
        </AuthProvider>
      </AppServicesContext>
    </SafeAreaProvider>
  );
}

function AuthenticatedRuntime({
  children,
  services,
}: PropsWithChildren<{ readonly services: AppServices }>) {
  const auth = useAuth();
  useEffect(() => {
    if (auth.status !== 'authenticated') { services.setForeground(false); return; }
    services.setForeground(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const subscription = observeConnectivity((connected) => {
      if (timer !== undefined) clearTimeout(timer);
      if (connected) timer = setTimeout(() => { void services.synchronize('quick'); }, 2_000);
    });
    return () => { subscription.remove(); if (timer !== undefined) clearTimeout(timer); services.setForeground(false); };
  }, [auth.status, services]);
  return (
    <>
      {children}
    </>
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
