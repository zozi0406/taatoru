import type { Database, DatabaseTransaction, RunResult, SqlValue } from '@/db/Database';
import { SyncControlRepository } from './SyncControlRepository';
import type { AccountContext, SyncLease } from './types';

/** Guards local session writes without requiring ownership of the network. */
export class AccountDatabase implements Database {
  protected readonly control: SyncControlRepository;

  constructor(protected readonly db: Database, protected readonly context: AccountContext) {
    this.control = new SyncControlRepository(db);
  }

  run(sql: string, params?: readonly SqlValue[]): Promise<RunResult> {
    return this.transaction((tx) => tx.run(sql, params));
  }

  async first<T>(sql: string, params?: readonly SqlValue[]): Promise<T | null> {
    await this.assertCurrent(this.db);
    const row = await this.db.first<T>(sql, params);
    await this.assertCurrent(this.db);
    return row;
  }

  async all<T>(sql: string, params?: readonly SqlValue[]): Promise<readonly T[]> {
    await this.assertCurrent(this.db);
    const rows = await this.db.all<T>(sql, params);
    await this.assertCurrent(this.db);
    return rows;
  }

  transaction<T>(operation: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await this.assertCurrent(tx);
      const result = await operation(tx);
      await this.assertCurrent(tx);
      return result;
    });
  }

  async close(): Promise<void> {
    // This adapter borrows the connection; AppProviders owns its lifetime.
  }

  protected assertCurrent(tx: DatabaseTransaction): Promise<void> {
    return this.control.assertAccount(tx, this.context);
  }
}

/** Checks both before and after writes, under the same SQLite write lock. */
export class FencedDatabase extends AccountDatabase {
  constructor(db: Database, private readonly lease: SyncLease, private readonly now: () => number) {
    super(db, lease.context);
  }

  protected override assertCurrent(tx: DatabaseTransaction): Promise<void> {
    return this.control.assertLease(tx, this.lease, this.now());
  }
}
