import * as SQLite from 'expo-sqlite';

import type {
  Database,
  DatabaseTransaction,
  RunResult,
  SqlValue,
} from './Database';

type ExpoConnection = Pick<
  SQLite.SQLiteDatabase,
  'getAllAsync' | 'getFirstAsync' | 'runAsync'
>;

class ExpoExecutor implements DatabaseTransaction {
  constructor(private readonly database: ExpoConnection) {}

  async run(
    sql: string,
    params: readonly SqlValue[] = [],
  ): Promise<RunResult> {
    const result = await this.database.runAsync(sql, [...params]);
    return {
      changes: result.changes,
      lastInsertRowId: result.lastInsertRowId,
    };
  }

  first<T>(
    sql: string,
    params: readonly SqlValue[] = [],
  ): Promise<T | null> {
    return this.database.getFirstAsync<T>(sql, [...params]);
  }

  all<T>(
    sql: string,
    params: readonly SqlValue[] = [],
  ): Promise<readonly T[]> {
    return this.database.getAllAsync<T>(sql, [...params]);
  }
}

export class ExpoDatabase implements Database {
  private readonly executor: ExpoExecutor;
  private operationTail: Promise<void> = Promise.resolve();

  private constructor(private readonly database: SQLite.SQLiteDatabase) {
    this.executor = new ExpoExecutor(database);
  }

  static async open(name = 'taatoru.db'): Promise<ExpoDatabase> {
    const database = await SQLite.openDatabaseAsync(name, {
      // Expo's blanket finalizer can double-free FTS5 internal statements.
      finalizeUnusedStatementsBeforeClosing: false,
    });
    return new ExpoDatabase(database);
  }

  run(
    sql: string,
    params: readonly SqlValue[] = [],
  ): Promise<RunResult> {
    return this.enqueue(() => this.executor.run(sql, params));
  }

  first<T>(
    sql: string,
    params: readonly SqlValue[] = [],
  ): Promise<T | null> {
    return this.enqueue(() => this.executor.first<T>(sql, params));
  }

  all<T>(
    sql: string,
    params: readonly SqlValue[] = [],
  ): Promise<readonly T[]> {
    return this.enqueue(() => this.executor.all<T>(sql, params));
  }

  transaction<T>(
    operation: (tx: DatabaseTransaction) => Promise<T>,
  ): Promise<T> {
    return this.enqueue(async () => {
      let completed = false;
      let result: T | undefined;
      await this.database.withExclusiveTransactionAsync(
        async (transaction) => {
          result = await operation(new ExpoExecutor(transaction));
          completed = true;
        },
      );

      if (!completed) {
        throw new Error('SQLite transaction completed without a result');
      }
      return result as T;
    });
  }

  close(): Promise<void> {
    return this.enqueue(() => this.database.closeAsync());
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation, operation);
    this.operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
