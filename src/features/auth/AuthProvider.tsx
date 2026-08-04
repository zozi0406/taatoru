import type { WaniKaniApi } from '@/api/WaniKaniApi';
import { ApiError, NetworkError } from '@/api/errors';
import type { Resource, UserData } from '@/api/types';
import type { Database } from '@/db/Database';
import { observeConnectivity } from '@/features/connectivity/observeConnectivity';
import { RetryCoordinator } from '@/features/connectivity/RetryCoordinator';
import type { SyncEngine, SyncResult } from '@/features/sync/SyncEngine';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { TokenStore } from './tokenStore';

export class EmptyTokenError extends Error {
  constructor() {
    super('Enter a WaniKani API token.');
    this.name = 'EmptyTokenError';
  }
}

export class InvalidTokenError extends Error {
  constructor() {
    super('WaniKani did not accept that API token.');
    this.name = 'InvalidTokenError';
  }
}

export class AccountChangeRequiredError extends Error {
  constructor() {
    super(
      'This token belongs to a different account. Confirm account replacement to continue.',
    );
    this.name = 'AccountChangeRequiredError';
  }
}

export class InitialSyncError extends Error {
  constructor(
    readonly setupStatus: 'connection-issues' | 'attention',
    message: string,
    readonly retryAt: string | null,
  ) {
    super(`The initial WaniKani sync did not complete. ${message}`);
    this.name = 'InitialSyncError';
  }
}

interface AuthManagerOptions {
  readonly db: Database;
  readonly tokenStore: TokenStore;
  readonly apiFactory: (token: string) => WaniKaniApi;
  readonly syncFactory: (api: WaniKaniApi) => SyncEngine;
  readonly clearAccount: () => Promise<void>;
}

interface CachedUserRow {
  readonly lastSyncAt: string | null;
  readonly resourceJson: string;
}

interface CachedAccount {
  readonly synchronized: boolean;
  readonly user: Resource<UserData, 'user'>;
}

type InitialSyncReporter = (state: InitialSyncState) => void;

export class AuthManager {
  constructor(private readonly options: AuthManagerOptions) {}

  async login(
    tokenValue: string,
    report?: InitialSyncReporter,
  ): Promise<Resource<UserData, 'user'>> {
    const { token, api, user } = await this.validate(tokenValue);
    const cached = await this.cachedAccount();
    if (cached !== null && cached.user.data.id !== user.data.id) {
      throw new AccountChangeRequiredError();
    }

    if (cached === null || !cached.synchronized) {
      report?.(runningInitialSync('account-connected'));
      await this.options.tokenStore.setPending(token);
      await this.initialSync(api, user.data.id, report);
    } else {
      await this.opportunisticSync(api);
    }
    await this.options.tokenStore.set(token);
    await this.options.tokenStore.removePending();
    return user;
  }

  async changeAccount(
    tokenValue: string,
    report?: InitialSyncReporter,
  ): Promise<Resource<UserData, 'user'>> {
    const { token, api, user } = await this.validate(tokenValue);
    await this.options.clearAccount();
    await this.options.tokenStore.remove();
    await this.options.tokenStore.setPending(token);
    report?.(runningInitialSync('account-connected'));
    await this.initialSync(api, user.data.id, report);
    await this.options.tokenStore.set(token);
    await this.options.tokenStore.removePending();
    return user;
  }

  async resume(token: string): Promise<Resource<UserData, 'user'>> {
    const cached = await this.cachedAccount();
    if (cached === null || !cached.synchronized) {
      return this.login(token);
    }
    const normalizedToken = token.trim();
    if (normalizedToken.length === 0) {
      throw new EmptyTokenError();
    }
    void this.options
      .syncFactory(this.options.apiFactory(normalizedToken))
      .synchronize('quick')
      .catch(() => {
        // Cached access remains available when opportunistic refresh fails.
      });
    return cached.user;
  }

  async continueInterruptedSetup(
    report?: InitialSyncReporter,
  ): Promise<Resource<UserData, 'user'>> {
    const token = await this.pendingToken();
    await this.options.clearAccount();
    return this.login(token, report);
  }

  async retryPendingSetup(
    report?: InitialSyncReporter,
  ): Promise<Resource<UserData, 'user'>> {
    return this.login(await this.pendingToken(), report);
  }

  async useAnotherApiKey(): Promise<void> {
    await this.options.clearAccount();
    await this.options.tokenStore.remove();
    await this.options.tokenStore.removePending();
  }

  async logout(): Promise<void> {
    await this.options.tokenStore.remove();
    await this.options.tokenStore.removePending();
    await this.options.clearAccount();
  }

  private async pendingToken(): Promise<string> {
    const token = await this.options.tokenStore.getPending();
    if (token === null) throw new EmptyTokenError();
    return token;
  }

  private async validate(tokenValue: string) {
    const token = tokenValue.trim();
    if (token.length === 0) {
      throw new EmptyTokenError();
    }

    const api = this.options.apiFactory(token);
    try {
      const user = await api.getUser();
      return { token, api, user };
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        throw new InvalidTokenError();
      }
      throw error;
    }
  }

  private async initialSync(
    api: WaniKaniApi,
    expectedUserId: string,
    report?: InitialSyncReporter,
  ): Promise<void> {
    const engine = this.options.syncFactory(api);
    const unsubscribe = engine.store?.subscribe(({ phase }) => {
      const setupPhase = setupPhaseFor(phase);
      if (setupPhase !== null) report?.(runningInitialSync(setupPhase));
    });
    let result: SyncResult;
    try {
      result = await engine.synchronize('quick');
    } finally {
      unsubscribe?.();
    }
    const cached = await this.cachedAccount();
    if (
      result.status !== 'completed' ||
      cached?.user.data.id !== expectedUserId ||
      !cached.synchronized
    ) {
      const failure = initialSyncFailure(result);
      report?.(failure.state);
      throw failure.error;
    }
  }

  private async opportunisticSync(api: WaniKaniApi): Promise<void> {
    try {
      await this.options.syncFactory(api).synchronize('quick');
    } catch {
      // Existing synchronized cache remains authoritative for authentication.
    }
  }

  private async cachedAccount(): Promise<CachedAccount | null> {
    const row = await this.options.db.first<CachedUserRow>(
      `SELECT u.resource_json AS resourceJson,
              s.last_sync_at AS lastSyncAt
       FROM user u
       CROSS JOIN sync_state s
       WHERE s.id = 1
       LIMIT 1`,
    );
    return row === null
      ? null
      : {
          synchronized: row.lastSyncAt !== null,
          user: JSON.parse(row.resourceJson) as Resource<UserData, 'user'>,
        };
  }
}

export type AuthStatus =
  | 'bootstrapping'
  | 'authenticated'
  | 'unauthenticated';

export type InitialSyncPhase =
  | 'account-connected'
  | 'subjects'
  | 'account-data'
  | 'offline-library';

export interface InitialSyncState {
  readonly status:
    | 'running'
    | 'connection-issues'
    | 'attention'
    | 'interrupted';
  readonly phase: InitialSyncPhase;
  readonly message: string | null;
  readonly retryAt: string | null;
}

interface AuthContextValue {
  readonly status: AuthStatus;
  readonly busy: boolean;
  readonly error: string | null;
  readonly requiresAccountChange: boolean;
  readonly initialSync: InitialSyncState | null;
  login(token: string): Promise<void>;
  changeAccount(token: string): Promise<void>;
  retryInitialSync(): Promise<void>;
  continueInterruptedSetup(): Promise<void>;
  useAnotherApiKey(): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps extends PropsWithChildren {
  readonly manager: AuthManager;
  readonly tokenStore: TokenStore;
}

export function AuthProvider({
  children,
  manager,
  tokenStore,
}: AuthProviderProps) {
  const [status, setStatus] = useState<AuthStatus>('bootstrapping');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requiresAccountChange, setRequiresAccountChange] =
    useState(false);
  const [initialSync, setInitialSync] =
    useState<InitialSyncState | null>(null);
  const initialSyncRef = useRef<InitialSyncState | null>(null);
  const retryCoordinatorRef = useRef<RetryCoordinator | null>(null);
  const reportInitialSync = useCallback(
    (state: InitialSyncState) => setInitialSync(state),
    [],
  );
  useEffect(() => {
    initialSyncRef.current = initialSync;
  }, [initialSync]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await tokenStore.get();
        if (token === null) {
          const pendingToken = await tokenStore.getPending();
          if (active) {
            if (pendingToken !== null) {
              setInitialSync({
                status: 'interrupted',
                phase: 'account-connected',
                message: null,
                retryAt: null,
              });
            }
            setStatus('unauthenticated');
          }
          return;
        }
        await manager.resume(token);
        if (active) {
          await tokenStore.removePending();
          setStatus('authenticated');
        }
      } catch (resumeError) {
        if (active) {
          setError(messageFor(resumeError));
          setRequiresAccountChange(
            resumeError instanceof AccountChangeRequiredError,
          );
          setStatus('unauthenticated');
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [manager, tokenStore]);

  const perform = useCallback(
    async (
      operation: () => Promise<Resource<UserData, 'user'>>,
    ): Promise<void> => {
      setBusy(true);
      setError(null);
      setRequiresAccountChange(false);
      try {
        await operation();
        setInitialSync(null);
        setStatus('authenticated');
      } catch (operationError) {
        const operationMessage = messageFor(operationError);
        setError(operationMessage);
        const currentSetup = initialSyncRef.current;
        if (
          currentSetup !== null &&
          !(operationError instanceof InitialSyncError)
        ) {
          setInitialSync(setupFailureFor(operationError, currentSetup.phase));
        }
        setRequiresAccountChange(
          operationError instanceof AccountChangeRequiredError,
        );
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const setupRetryActive =
    initialSync !== null && initialSync.status !== 'interrupted';
  useEffect(() => {
    if (!setupRetryActive) return;
    const coordinator = new RetryCoordinator({
      attempt: () =>
        perform(() => manager.retryPendingSetup(reportInitialSync)),
      eligible: async () => {
        const current = initialSyncRef.current;
        return (
          current?.status === 'connection-issues' ||
          current?.status === 'attention'
        );
      },
    });
    coordinator.blockUntil(initialSyncRef.current?.retryAt ?? null);
    retryCoordinatorRef.current = coordinator;
    const subscription = observeConnectivity((connected) => {
      coordinator.updateConnectivity(connected);
    });
    return () => {
      subscription.remove?.();
      coordinator.dispose();
      if (retryCoordinatorRef.current === coordinator) {
        retryCoordinatorRef.current = null;
      }
    };
  }, [manager, perform, reportInitialSync, setupRetryActive]);

  useEffect(() => {
    retryCoordinatorRef.current?.blockUntil(initialSync?.retryAt ?? null);
  }, [initialSync?.retryAt]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      busy,
      error,
      initialSync,
      requiresAccountChange,
      login: (token) =>
        perform(() => manager.login(token, reportInitialSync)),
      changeAccount: (token) =>
        perform(() => manager.changeAccount(token, reportInitialSync)),
      retryInitialSync: async () => {
        await retryCoordinatorRef.current?.retryNow();
      },
      continueInterruptedSetup: () => {
        setInitialSync({
          status: 'running',
          phase: 'account-connected',
          message: null,
          retryAt: null,
        });
        return perform(() =>
          manager.continueInterruptedSetup(reportInitialSync),
        );
      },
      useAnotherApiKey: async () => {
        setBusy(true);
        try {
          await manager.useAnotherApiKey();
          setInitialSync(null);
          setError(null);
          setStatus('unauthenticated');
        } finally {
          setBusy(false);
        }
      },
      logout: async () => {
        setBusy(true);
        try {
          await manager.logout();
          setStatus('unauthenticated');
        } finally {
          setBusy(false);
        }
      },
    }),
    [
      busy,
      error,
      initialSync,
      manager,
      perform,
      reportInitialSync,
      requiresAccountChange,
      status,
    ],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const auth = useContext(AuthContext);
  if (auth === null) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return auth;
}

function messageFor(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Unable to sign in right now.';
}

function runningInitialSync(phase: InitialSyncPhase): InitialSyncState {
  return {
    status: 'running',
    phase,
    message: null,
    retryAt: null,
  };
}

function setupFailureFor(
  error: unknown,
  phase: InitialSyncPhase,
): InitialSyncState {
  const connectionIssue = error instanceof NetworkError;
  return {
    status: connectionIssue ? 'connection-issues' : 'attention',
    phase,
    message: connectionIssue
      ? 'Taatoru could not reach WaniKani. It will continue when your connection returns.'
      : messageFor(error),
    retryAt:
      error instanceof ApiError && error.retryAt !== null
        ? error.retryAt.toISOString()
        : null,
  };
}

function setupPhaseFor(
  phase: 'idle' | 'preparing' | 'phase-one' | 'phase-two' | 'finalizing',
): InitialSyncPhase | null {
  if (phase === 'preparing') return 'account-connected';
  if (phase === 'phase-one') return 'subjects';
  if (phase === 'phase-two') return 'account-data';
  if (phase === 'finalizing') return 'offline-library';
  return null;
}

function initialSyncFailure(result: SyncResult): {
  readonly error: InitialSyncError;
  readonly state: InitialSyncState;
} {
  const connectionIssue =
    (result.status === 'skipped' && result.reason === 'offline') ||
    (result.status === 'failed' && result.error.kind === 'network');
  const setupStatus = connectionIssue ? 'connection-issues' : 'attention';
  const retryAt = result.status === 'failed' ? result.error.retryAt : null;
  const message = connectionIssue
    ? 'Taatoru could not reach WaniKani. It will continue when your connection returns.'
    : result.status === 'failed'
      ? result.error.message
      : 'The initial WaniKani sync did not complete.';
  return {
    error: new InitialSyncError(setupStatus, message, retryAt),
    state: {
      status: setupStatus,
      phase: 'offline-library',
      message,
      retryAt,
    },
  };
}
