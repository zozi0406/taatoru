import type { WaniKaniApi } from '@/api/WaniKaniApi';
import type { Database } from '@/db/Database';
import { FencedDatabase } from './FencedDatabase';
import { PendingWriteSender } from './PendingWriteSender';
import { StaleSyncError, SyncControlRepository } from './SyncControlRepository';
import { SynchronizationEngine, toSafeSyncError, type SyncEngine, type SyncMode, type SyncResult } from './SyncEngine';
import { SyncRepository } from './SyncRepository';
import { createSyncStore } from './syncStore';
import type { AccountContext, SyncLease } from './types';
import { SyncPreflight } from './SyncPreflight';

export interface OwnedSyncOptions {
  readonly db: Database;
  readonly context: AccountContext;
  readonly apiFactory: (lease: SyncLease, signal: AbortSignal) => WaniKaniApi;
  readonly isOnline: () => Promise<boolean>;
  readonly invalidate: () => void | Promise<void>;
  readonly updateNotifications: () => void | Promise<void>;
  readonly now: () => Date;
}

/** Owns the lease for one bounded run; all entry points share its DB guard. */
export class OwnedSyncEngine implements SyncEngine {
  readonly store = createSyncStore();
  private readonly control: SyncControlRepository;

  constructor(private readonly options: OwnedSyncOptions) {
    this.control = new SyncControlRepository(options.db);
  }

  async synchronize(mode: SyncMode): Promise<SyncResult> {
    const { options, control } = this;
    let lease: SyncLease | null = null;
    let renewal: ReturnType<typeof setInterval> | undefined;
    let unsubscribe: (() => void) | undefined;
    const controller = new AbortController();
    try {
      if (!(await options.isOnline())) return { status: 'skipped', reason: 'offline' };
      lease = await control.acquire(options.context, options.now().getTime());
      if (lease === null) return { status: 'skipped', reason: 'already-running' };
      const ownedLease = lease;
      const check = () => control.assertLease(options.db, ownedLease, options.now().getTime());
      renewal = setInterval(() => {
        void control.renew(ownedLease, options.now().getTime()).catch(() => controller.abort());
      }, 30_000);
      const db = new FencedDatabase(options.db, ownedLease, () => options.now().getTime());
      const raw = options.apiFactory(ownedLease, controller.signal);
      const api = new Proxy(raw, {
        get(target, key) {
          const value: unknown = Reflect.get(target, key, target);
          if (typeof value !== 'function') return value;
          return async (...args: unknown[]) => {
            await check();
            if (controller.signal.aborted) throw new StaleSyncError();
            return Reflect.apply(value, target, args);
          };
        },
      });
      await new SyncPreflight(db, api, options.context).run(mode);
      const engine = new SynchronizationEngine({
        api, repository: new SyncRepository(db), pendingWrites: new PendingWriteSender(db, api, ownedLease.ownerFence),
        isOnline: options.isOnline, now: options.now,
        invalidate: async () => { await check(); await options.invalidate(); },
        updateNotifications: async () => { await check(); await options.updateNotifications(); },
      });
      unsubscribe = engine.store.subscribe((state) => {
        void check().then(() => this.store.setState(state)).catch(() => {});
      });
      const result = await engine.synchronize(mode);
      await check();
      this.store.setState(engine.store.getState());
      return result;
    } catch (error) {
      if (!(error instanceof StaleSyncError))
        return { status: 'failed', error: toSafeSyncError(error) };
      return { status: 'failed', error: {
        kind: 'ownership', message: 'Synchronization stopped because the account or sync owner changed.',
        status: null, safeUrl: null, retryAt: null, hibernating: false,
      } };
    } finally {
      unsubscribe?.();
      if (renewal !== undefined) clearInterval(renewal);
      if (lease !== null) await control.release(lease);
    }
  }
}
