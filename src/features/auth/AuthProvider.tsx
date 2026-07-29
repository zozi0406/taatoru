import type { WaniKaniApi } from '@/api/WaniKaniApi';
import { ApiError } from '@/api/errors';
import type { Resource, UserData } from '@/api/types';
import type { Database } from '@/db/Database';
import type { SyncEngine } from '@/features/sync/SyncEngine';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

interface AuthManagerOptions {
  readonly db: Database;
  readonly tokenStore: TokenStore;
  readonly apiFactory: (token: string) => WaniKaniApi;
  readonly syncFactory: (api: WaniKaniApi) => SyncEngine;
  readonly clearAccount: () => Promise<void>;
}

interface CachedUserRow {
  readonly id: string;
}

export class AuthManager {
  constructor(private readonly options: AuthManagerOptions) {}

  async login(tokenValue: string): Promise<Resource<UserData, 'user'>> {
    const { token, api, user } = await this.validate(tokenValue);
    const cachedUser = await this.cachedUser();
    if (cachedUser !== null && cachedUser.id !== user.data.id) {
      throw new AccountChangeRequiredError();
    }

    await this.options.tokenStore.set(token);
    await this.options.syncFactory(api).synchronize('quick');
    return user;
  }

  async changeAccount(
    tokenValue: string,
  ): Promise<Resource<UserData, 'user'>> {
    const { token, api, user } = await this.validate(tokenValue);
    await this.options.clearAccount();
    await this.options.tokenStore.set(token);
    await this.options.syncFactory(api).synchronize('quick');
    return user;
  }

  async resume(token: string): Promise<Resource<UserData, 'user'>> {
    return this.login(token);
  }

  async logout(): Promise<void> {
    await this.options.tokenStore.remove();
    await this.options.clearAccount();
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

  private cachedUser(): Promise<CachedUserRow | null> {
    return this.options.db.first<CachedUserRow>(
      'SELECT id FROM user LIMIT 1',
    );
  }
}

export type AuthStatus =
  | 'bootstrapping'
  | 'authenticated'
  | 'unauthenticated';

interface AuthContextValue {
  readonly status: AuthStatus;
  readonly busy: boolean;
  readonly error: string | null;
  readonly requiresAccountChange: boolean;
  login(token: string): Promise<void>;
  changeAccount(token: string): Promise<void>;
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

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await tokenStore.get();
        if (token === null) {
          if (active) setStatus('unauthenticated');
          return;
        }
        await manager.resume(token);
        if (active) setStatus('authenticated');
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
        setStatus('authenticated');
      } catch (operationError) {
        setError(messageFor(operationError));
        setRequiresAccountChange(
          operationError instanceof AccountChangeRequiredError,
        );
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      busy,
      error,
      requiresAccountChange,
      login: (token) => perform(() => manager.login(token)),
      changeAccount: (token) =>
        perform(() => manager.changeAccount(token)),
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
    [busy, error, manager, perform, requiresAccountChange, status],
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
