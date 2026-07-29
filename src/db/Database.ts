export type SqlValue =
  | ArrayBuffer
  | Uint8Array
  | boolean
  | null
  | number
  | string;

export interface RunResult {
  readonly changes: number;
  readonly lastInsertRowId: number;
}

export interface DatabaseTransaction {
  run(sql: string, params?: readonly SqlValue[]): Promise<RunResult>;
  first<T>(
    sql: string,
    params?: readonly SqlValue[],
  ): Promise<T | null>;
  all<T>(
    sql: string,
    params?: readonly SqlValue[],
  ): Promise<readonly T[]>;
}

export interface Database extends DatabaseTransaction {
  transaction<T>(
    operation: (tx: DatabaseTransaction) => Promise<T>,
  ): Promise<T>;
  close(): Promise<void>;
}
