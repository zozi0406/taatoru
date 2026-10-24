import * as SQLite from 'expo-sqlite';

import { ExpoDatabase } from '../ExpoDatabase';

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
}));

test('opens FTS databases without finalizing SQLite internal statements on close', async () => {
  const nativeDatabase = {
    runAsync: jest.fn(async () => ({ changes: 0, lastInsertRowId: 0 })),
  };
  jest
    .mocked(SQLite.openDatabaseAsync)
    .mockResolvedValue(nativeDatabase as unknown as SQLite.SQLiteDatabase);

  await ExpoDatabase.open();

  expect(SQLite.openDatabaseAsync).toHaveBeenCalledWith('taatoru.db', {
    finalizeUnusedStatementsBeforeClosing: false,
    useNewConnection: true,
  });
  expect(nativeDatabase.runAsync).toHaveBeenCalledWith(
    'PRAGMA busy_timeout = 5000',
  );
});

test('a provider remount can close its old connection without closing the new one', async () => {
  let cached: SQLite.SQLiteDatabase | undefined;
  jest
    .mocked(SQLite.openDatabaseAsync)
    .mockImplementation(async (_name, options) => {
      if (!options?.useNewConnection && cached !== undefined) return cached;
      let closed = false;
      const connection = {
        closeAsync: async () => {
          closed = true;
        },
        runAsync: async () => ({ changes: 0, lastInsertRowId: 0 }),
        getFirstAsync: async () => {
          if (closed) throw new Error('Access to closed resource');
          return { ready: 1 };
        },
      } as unknown as SQLite.SQLiteDatabase;
      cached = connection;
      return connection;
    });
  const old = await ExpoDatabase.open();
  const next = await ExpoDatabase.open();
  await old.close();
  await expect(next.first('SELECT 1 AS ready')).resolves.toEqual({ ready: 1 });
  await next.close();
});

test('releases a newly opened native handle when initialization fails', async () => {
  const nativeDatabase = {
    runAsync: jest.fn(async () => {
      throw new Error('native initialization failed');
    }),
    closeAsync: jest.fn(async () => undefined),
  };
  jest
    .mocked(SQLite.openDatabaseAsync)
    .mockResolvedValue(nativeDatabase as unknown as SQLite.SQLiteDatabase);
  await expect(ExpoDatabase.open()).rejects.toThrow(
    'native initialization failed',
  );
  expect(nativeDatabase.closeAsync).toHaveBeenCalledTimes(1);
});

test('serializes a transaction with concurrent database work', async () => {
  let busy = false;
  const enter = async <T>(operation: () => Promise<T>): Promise<T> => {
    if (busy) {
      throw new Error('database is locked');
    }
    busy = true;
    try {
      return await operation();
    } finally {
      await Promise.resolve();
      busy = false;
    }
  };
  const transaction = {
    getAllAsync: jest.fn(async () => []),
    getFirstAsync: jest.fn(async () => null),
    runAsync: jest.fn(async () => ({ changes: 1, lastInsertRowId: 1 })),
  };
  const nativeDatabase = {
    closeAsync: jest.fn(async () => undefined),
    getAllAsync: jest.fn(() => enter(async () => [])),
    getFirstAsync: jest.fn(() => enter(async () => null)),
    runAsync: jest.fn(() =>
      enter(async () => ({ changes: 1, lastInsertRowId: 1 })),
    ),
    withExclusiveTransactionAsync: jest.fn((operation) =>
      enter(() => operation(transaction)),
    ),
  };
  jest
    .mocked(SQLite.openDatabaseAsync)
    .mockResolvedValue(nativeDatabase as unknown as SQLite.SQLiteDatabase);
  const db = await ExpoDatabase.open();

  await expect(
    Promise.all([
      db.transaction((tx) => tx.run('UPDATE sync_state SET last_sync_at = ?')),
      db.first('SELECT last_sync_at FROM sync_state'),
    ]),
  ).resolves.toEqual([{ changes: 1, lastInsertRowId: 1 }, null]);
  expect(transaction.runAsync).toHaveBeenNthCalledWith(
    1,
    'PRAGMA busy_timeout = 5000',
  );
});
