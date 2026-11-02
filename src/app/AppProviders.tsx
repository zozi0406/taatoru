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

import { getE2ERuntime, E2E_ORIGIN } from '@/test/e2e/runtime';
import { HttpWaniKaniApi } from '@/api/HttpWaniKaniApi';
import type { Database } from '@/db/Database';
import { RadicalImagePreparation } from '@/features/media/radicalImages';
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
import { AccountDatabase } from '@/features/sync/FencedDatabase';
import { createSyncStore, type SyncStore } from '@/features/sync/syncStore';
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
  readonly syncStore: SyncStore;
  readonly subscribeToData: (listener: () => void) => () => void;
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
        const e2e = getE2ERuntime();
        const openedDatabase = await ExpoDatabase.open(e2e?.databaseName);
        if (!active) {
          await openedDatabase.close();
          return;
        }
        database = openedDatabase;
        await migrateDatabase(openedDatabase);
        if (!active) return;
        const tokenStore = new SecureTokenStore(openedDatabase);
        if (e2e !== null) {
          const response = await fetch(`${E2E_ORIGIN}/__e2e/bootstrap`);
          if (!response.ok) throw new Error('Local E2E server is unavailable');
          const { seedE2EAccount } = await import('@/test/e2e/seed');
          await seedE2EAccount(openedDatabase, tokenStore, await response.json());
        }
        const syncRepository = new SyncRepository(openedDatabase);
        const notificationService = new NotificationService(
          new ExpoNotificationPlatform(),
        );
        const rebuildForAccount = async (expected?: AccountContext, assertOwner?: () => Promise<void>) => {
          if (e2e !== null) return;
          const control = new SyncControlRepository(openedDatabase);
          const context = expected ?? await control.getLocalAccountContext();
          if (context === null) return;
          const assertCurrent = assertOwner ?? (() => control.assertAccount(openedDatabase, context));
          await assertCurrent();
          await notificationService.rebuild(
            await loadReviewNotificationInput(new AccountDatabase(openedDatabase, context), new Date()), assertCurrent,
          );
        };
        const rebuildNotifications = () => rebuildForAccount();
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
        const syncStore = createSyncStore();
        const dataListeners = new Set<() => void>();
        const invalidate = () => {
          for (const listener of dataListeners) listener();
        };
        const mediaPreparation = new RadicalImagePreparation(openedDatabase);
        mediaPreparation.setActive(false);
        const invalidateFromSync = () => {
          invalidate();
          // Only subject cursor changes need another walk. Local pending-write
          // notifications merely refresh data; study media also loads on demand.
          void mediaPreparation.prepare().catch(() => {});
        };
        let unsubscribeSync: (() => void) | undefined;
        let runtimeToken: string | null = null;
        let runtimeSyncEngine: SyncCoordinator | null = null;
        let runtimeContextKey: string | null = null;
        let foreground = false;
        disposeRuntime = () => { mediaPreparation.dispose(); runtimeSyncEngine?.dispose(); unsubscribeSync?.(); };
        const createSyncEngine = (token: string, context: AccountContext): SyncEngine => {
          const contextKey = `${context.accountEpoch}:${context.credentialRevision}`;
          if (runtimeSyncEngine !== null && runtimeToken === token && runtimeContextKey === contextKey) return runtimeSyncEngine;
          mediaPreparation.cancel();
          runtimeSyncEngine?.dispose();
          unsubscribeSync?.();
          const engine = new OwnedSyncEngine({
            db: openedDatabase, context,
            apiFactory: (lease, signal) => {
              const scheduler = new RequestScheduler(openedDatabase);
              return new HttpWaniKaniApi({ token, signal, ...(e2e === null ? {} : { baseUrl: e2e.baseUrl }),
                schedule: (operation, requestSignal) => scheduler.run(operation, lease, requestSignal),
                onRateLimit: (budget) => scheduler.recordBudget(budget, lease),
              });
            },
            isOnline, invalidate: invalidateFromSync,
            updateNotifications: (assertOwner) => rebuildForAccount(context, assertOwner),
            now: () => new Date(),
          });
          runtimeSyncEngine = new SyncCoordinator({ db: openedDatabase, context, engine });
          unsubscribeSync = runtimeSyncEngine.store.subscribe((state) => syncStore.setState(state));
          // AuthProvider owns initial-setup retry timing until the account opens.
          runtimeSyncEngine.setForeground(foreground);
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
            return new HttpWaniKaniApi({ token, ...(e2e === null ? {} : { baseUrl: e2e.baseUrl }),
              schedule: (operation, signal) => scheduler.run(operation, reservation, signal),
              onRateLimit: (budget) => scheduler.recordBudget(budget, reservation),
            });
          },
          syncFactory: createSyncEngine,
          clearAccount: async () => {
            mediaPreparation.cancel();
            await syncRepository.clearForLogout();
            runtimeSyncEngine?.dispose(); unsubscribeSync?.();
            syncStore.setState({ isSyncing: false, phase: 'idle', lastResult: null });
            const platform = new ExpoNotificationPlatform();
            await platform.cancelAll(); await platform.setBadge(0);
          },
        });
        if (active) {
          setServices({
            db: openedDatabase,
            manager,
            tokenStore,
            isOnline,
            rebuildNotifications,
            synchronize,
            notifyPendingWrites: () => { invalidate(); runtimeSyncEngine?.notifyPendingWrites(); },
            setForeground: (value) => { foreground = value; mediaPreparation.setActive(value); runtimeSyncEngine?.setForeground(value); },
            syncStore,
            subscribeToData: (listener) => { dataListeners.add(listener); return () => { dataListeners.delete(listener); }; },
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
                {process.env.EXPO_PUBLIC_TAATORU_E2E === '1' ? error : 'Unable to open your local library. Please try again.'}
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
  const [accountServices, setAccountServices] = useState<{ version: number; services: AppServices; epoch: number } | null>(null);
  useEffect(() => {
    if (auth.status !== 'authenticated') return;
    let active = true;
    void new SyncControlRepository(services.db).getLocalAccountContext().then((context) => {
      if (active && context !== null) setAccountServices({ version: auth.accountVersion, epoch: context.accountEpoch,
        services: { ...services, db: new AccountDatabase(services.db, context), notifyPendingWrites: () => {
          void new SyncControlRepository(services.db).assertAccount(services.db, context)
            .then(() => services.notifyPendingWrites()).catch(() => {});
        } } });
    });
    return () => { active = false; };
  }, [auth.status, auth.accountVersion, services]);
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
    auth.status === 'authenticated' ? accountServices?.version === auth.accountVersion ?
      <AppServicesContext key={accountServices.epoch} value={accountServices.services}>{children}</AppServicesContext> :
      <ActivityIndicator accessibilityLabel="Opening your account" /> : <>{children}</>
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
