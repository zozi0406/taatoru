import BetterSqlite3 from 'better-sqlite3';

import type {
  Database,
  DatabaseTransaction,
  RunResult,
  SqlValue,
} from './Database';

class NodeExecutor implements DatabaseTransaction {
  constructor(private readonly database: BetterSqlite3.Database) {}

  async run(
    sql: string,
    params: readonly SqlValue[] = [],
  ): Promise<RunResult> {
    const result = this.database
      .prepare(sql)
      .run(...normalizeParams(params));
    return {
      changes: result.changes,
      lastInsertRowId: Number(result.lastInsertRowid),
    };
  }

  async first<T>(
    sql: string,
    params: readonly SqlValue[] = [],
  ): Promise<T | null> {
    const row = this.database.prepare(sql).get(...normalizeParams(params));
    return row === undefined ? null : (row as T);
  }

  async all<T>(
    sql: string,
    params: readonly SqlValue[] = [],
  ): Promise<readonly T[]> {
    return this.database
      .prepare(sql)
      .all(...normalizeParams(params)) as T[];
  }
}

export class NodeTestDatabase implements Database {
  private readonly executor: NodeExecutor;
  private transactionActive = false;

  private constructor(private readonly database: BetterSqlite3.Database) {
    this.executor = new NodeExecutor(database);
  }

  static async open(filename = ':memory:'): Promise<NodeTestDatabase> {
    return new NodeTestDatabase(new BetterSqlite3(filename));
  }

  run(
    sql: string,
    params: readonly SqlValue[] = [],
  ): Promise<RunResult> {
    this.assertOutsideTransaction();
    return this.executor.run(sql, params);
  }

  first<T>(
    sql: string,
    params: readonly SqlValue[] = [],
  ): Promise<T | null> {
    this.assertOutsideTransaction();
    return this.executor.first<T>(sql, params);
  }

  all<T>(
    sql: string,
    params: readonly SqlValue[] = [],
  ): Promise<readonly T[]> {
    this.assertOutsideTransaction();
    return this.executor.all<T>(sql, params);
  }

  async transaction<T>(
    operation: (tx: DatabaseTransaction) => Promise<T>,
  ): Promise<T> {
    this.assertOutsideTransaction();
    this.transactionActive = true;
    try {
      this.database.exec('BEGIN IMMEDIATE');
      const result = await operation(this.executor);
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      if (this.database.inTransaction) {
        this.database.exec('ROLLBACK');
      }
      throw error;
    } finally {
      this.transactionActive = false;
    }
  }

  async close(): Promise<void> {
    this.assertOutsideTransaction();
    this.database.close();
  }

  async tableNames(): Promise<readonly string[]> {
    const rows = await this.all<{ name: string }>(
      `SELECT name
       FROM sqlite_master
       WHERE type IN ('table', 'view')
       ORDER BY name`,
    );
    return rows.map(({ name }) => name);
  }

  private assertOutsideTransaction(): void {
    if (this.transactionActive) {
      throw new Error(
        'Use the provided transaction object while a transaction is active',
      );
    }
  }
}

function normalizeParams(
  params: readonly SqlValue[],
): readonly (ArrayBuffer | Uint8Array | null | number | string)[] {
  return params.map((value) => {
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    if (value instanceof ArrayBuffer) {
      return new Uint8Array(value);
    }
    return value;
  });
}
