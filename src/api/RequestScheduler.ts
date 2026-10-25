import type { Database } from '@/db/Database';
import { SyncControlRepository } from '@/features/sync/SyncControlRepository';
import type { RequestContext } from '@/features/sync/types';
import type { RateLimitSnapshot } from './WaniKaniApi';
import { ApiError, NetworkError } from './errors';

export class SyncYieldError extends ApiError {
  constructor(retryAt: Date) {
    super('Synchronization will continue later.', { retryAt }); this.name = 'SyncYieldError';
  }
}

interface Options {
  readonly now?: () => number;
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  readonly random?: () => number;
  readonly deadlineAt?: number;
}

/** Pace the HTTP boundary, including collection pages and reconciliation reads. */
export class RequestScheduler {
  private tail: Promise<unknown> = Promise.resolve();
  private readonly control: SyncControlRepository;
  private readonly now: () => number;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  private readonly random: () => number;

  constructor(private readonly db: Database, private readonly options: Options = {}) {
    this.control = new SyncControlRepository(db);
    this.now = options.now ?? Date.now; this.sleep = options.sleep ?? abortableSleep;
    this.random = options.random ?? Math.random;
  }

  run<T>(operation: (signal: AbortSignal) => Promise<T>, context: RequestContext, signal?: AbortSignal): Promise<T> {
    const result = this.tail.then(() => this.execute(operation, context, signal));
    this.tail = result.catch(() => {});
    return result;
  }

  async recordBudget(budget: RateLimitSnapshot, context: RequestContext): Promise<void> {
    if (!Number.isSafeInteger(budget.limit) || budget.limit <= 0 || !Number.isSafeInteger(budget.requestsRemaining) ||
        budget.requestsRemaining < 0 || budget.requestsRemaining > budget.limit || !Number.isFinite(budget.resetAfterMs) || budget.resetAfterMs <= 0) return;
    const now = this.now();
    await this.db.transaction(async (tx) => {
      await this.control.assertRequest(tx, context, now);
      const row = (await tx.first<{ budget_reset_at: number; budget_remaining: number | null }>(
        'SELECT budget_reset_at, budget_remaining FROM sync_control WHERE id = 1'))!;
      const reset = now + budget.resetAfterMs;
      const sameWindow = Math.abs(reset - row.budget_reset_at) < 1_000;
      const remaining = sameWindow ? Math.min(row.budget_remaining ?? budget.requestsRemaining, budget.requestsRemaining) : budget.requestsRemaining;
      await tx.run('UPDATE sync_control SET budget_remaining = ?, budget_reset_at = ? WHERE id = 1', [remaining, reset]);
    });
  }

  private async execute<T>(operation: (signal: AbortSignal) => Promise<T>, context: RequestContext, signal?: AbortSignal): Promise<T> {
    for (;;) {
      throwIfAborted(signal);
      const waitUntil = await this.db.transaction(async (tx) => {
        const now = this.now();
        await this.control.assertRequest(tx, context, now);
        const row = (await tx.first<{ next_request_at: number; blocked_until: number; budget_remaining: number | null; budget_reset_at: number }>(
          'SELECT next_request_at, blocked_until, budget_remaining, budget_reset_at FROM sync_control WHERE id = 1'))!;
        const due = Math.max(row.next_request_at, row.blocked_until, row.budget_remaining === 0 ? row.budget_reset_at : 0);
        if (due > now) return due;
        await tx.run(`UPDATE sync_control SET next_request_at = ?,
          budget_remaining = CASE WHEN budget_reset_at <= ? THEN NULL ELSE MAX(0, budget_remaining - 1) END WHERE id = 1`,
        [now + 1_100, now]);
        return now;
      });
      const now = this.now();
      if (this.options.deadlineAt !== undefined && Math.max(waitUntil, now) >= this.options.deadlineAt)
        throw new SyncYieldError(new Date(Math.max(waitUntil, now)));
      if (waitUntil <= now) break;
      await this.sleep(waitUntil - now, signal);
    }
    await this.control.assertRequest(this.db, context, this.now());
    const controller = new AbortController();
    const forwardAbort = () => controller.abort();
    signal?.addEventListener('abort', forwardAbort, { once: true });
    if (signal?.aborted) controller.abort();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let aborted: (() => void) | undefined;
    const limit = Math.min(30_000, (this.options.deadlineAt ?? Infinity) - this.now());
    try {
      const deadline = new Promise<never>((_, reject) => {
        aborted = () => reject(new NetworkError('WaniKani request interrupted'));
        controller.signal.addEventListener('abort', aborted, { once: true });
        timer = setTimeout(() => { controller.abort(); }, Math.max(0, limit));
      });
      throwIfAborted(controller.signal);
      const result = await Promise.race([operation(controller.signal), deadline]);
      await this.db.transaction(async (tx) => {
        await this.control.assertRequest(tx, context, this.now());
        await tx.run('UPDATE sync_control SET retry_count = 0 WHERE id = 1');
      });
      return result;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 429 || error.status === null || (error.status ?? 0) >= 500)) {
        await this.db.transaction(async (tx) => {
          await this.control.assertRequest(tx, context, this.now());
          const retry = (await tx.first<{ retry_count: number }>('SELECT retry_count FROM sync_control WHERE id = 1'))!.retry_count;
          const delay = Math.min(60_000, 2_000 * 2 ** Math.min(retry, 5)) * (1 + this.random() * .2);
          const until = Math.max(this.now() + delay, error.retryAt?.getTime() ?? 0);
          await tx.run('UPDATE sync_control SET retry_count = retry_count + 1, blocked_until = MAX(blocked_until, ?) WHERE id = 1', [until]);
        });
      }
      throw error;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (aborted !== undefined) controller.signal.removeEventListener('abort', aborted);
      signal?.removeEventListener('abort', forwardAbort);
    }
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new NetworkError('WaniKani request interrupted');
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new NetworkError('Synchronization wait interrupted')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}
