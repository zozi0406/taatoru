import type { Database } from '@/db/Database';
import { SyncControlRepository } from './SyncControlRepository';
import type { SyncEngine, SyncMode, SyncResult } from './SyncEngine';
import { SyncRepository } from './SyncRepository';
import { createSyncStore } from './syncStore';
import type { AccountContext, SyncTrigger } from './types';

interface Options {
  readonly db: Database;
  readonly context: AccountContext;
  readonly engine: SyncEngine;
  readonly now?: () => Date;
}

/** One foreground drain. Other runtimes are excluded by the persisted lease. */
export class SyncCoordinator implements SyncEngine {
  readonly store = createSyncStore();
  private running: Promise<SyncResult> | null = null;
  private requested: SyncMode | null = null;
  private foreground = true;
  private disposed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly now: () => Date;
  private readonly repository: SyncRepository;
  private readonly unsubscribe: (() => void) | undefined;

  constructor(private readonly options: Options) {
    this.now = options.now ?? (() => new Date());
    this.repository = new SyncRepository(options.db, this.now);
    this.unsubscribe = options.engine.store?.subscribe((state) => {
      void this.current().then((valid) => { if (valid) this.store.setState(state); });
    });
  }

  synchronize(mode: SyncMode): Promise<SyncResult> { return this.request('manual', mode); }

  request(_trigger: SyncTrigger, mode: SyncMode = 'quick'): Promise<SyncResult> {
    if (this.disposed) return Promise.resolve(stopped());
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.requested !== 'full') this.requested = mode;
    if (this.running === null) this.running = this.drain().finally(() => { this.running = null; });
    return this.running;
  }

  notifyPendingWrites(): void {
    if (!this.foreground || this.disposed) return;
    void this.request('enqueue').catch(() => {});
  }

  setForeground(active: boolean): void {
    this.foreground = active;
    if (!active && this.timer !== undefined) { clearTimeout(this.timer); this.timer = undefined; }
    if (active && !this.disposed) void this.request('foreground').catch(() => {});
  }

  dispose(): void {
    this.disposed = true; this.requested = null; this.unsubscribe?.();
    if (this.timer !== undefined) clearTimeout(this.timer);
  }

  private async current(): Promise<boolean> {
    if (this.disposed) return false;
    try {
      const context = await new SyncControlRepository(this.options.db).getAccountContext();
      return !this.disposed && context?.accountEpoch === this.options.context.accountEpoch &&
        context.credentialRevision === this.options.context.credentialRevision && context.userId === this.options.context.userId;
    } catch { return false; }
  }

  private async drain(): Promise<SyncResult> {
    let result: SyncResult = stopped();
    while (this.requested !== null && await this.current()) {
      const mode = this.requested; this.requested = null;
      this.store.setState({ isSyncing: true, phase: 'preparing' });
      result = await this.options.engine.synchronize(mode);
      if (!(await this.current())) return stopped();
      const queue = await this.repository.getQueueSummary();
      result = { ...result, queue, delivery: queue.pending === 0 ? 'complete' :
        queue.rejected > 0 || (queue.uncertain > 0 && queue.nextAttemptAt === null) ? 'attention' : 'pending' };
      this.store.setState({ isSyncing: false, phase: 'idle', lastResult: result });
      if (result.status === 'completed') {
        if (queue.nextAttemptAt !== null) {
          if (Date.parse(queue.nextAttemptAt) <= this.now().getTime() && this.foreground) {
            if (this.requested === null) this.requested = 'quick';
          } else this.schedule(Date.parse(queue.nextAttemptAt), 'quick');
        }
      } else {
        // Authentication, permissions and ownership need a deliberate repair.
        const retryable = result.status === 'failed' && result.error.kind !== 'ownership' &&
          ![401, 403].includes(result.error.status ?? 0);
        if (retryable || (result.status === 'skipped' && result.reason === 'already-running')) {
          const wait = await this.options.db.first<{ blocked_until: number }>('SELECT blocked_until FROM sync_control WHERE id = 1');
          this.schedule(Math.max(this.now().getTime() + 2_000, wait?.blocked_until ?? 0,
            result.status === 'failed' ? Date.parse(result.error.retryAt ?? '') || 0 : 0), this.requested ?? mode);
        }
        this.requested = null;
      }
    }
    return result;
  }

  private schedule(at: number, mode: SyncMode): void {
    if (!this.foreground || this.disposed) return;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = undefined; void this.request('enqueue', mode).catch(() => {}); },
      Math.min(2_147_483_647, Math.max(1, at - this.now().getTime())));
  }
}

function stopped(): SyncResult {
  return { status: 'failed', error: { kind: 'ownership', message: 'The account or sync owner changed.',
    status: null, safeUrl: null, retryAt: null, hibernating: false } };
}
