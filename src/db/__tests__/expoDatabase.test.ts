import * as SQLite from 'expo-sqlite';

import { ExpoDatabase } from '../ExpoDatabase';

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
}));

test('opens FTS databases without finalizing SQLite internal statements on close', async () => {
  const nativeDatabase = {};
  jest.mocked(SQLite.openDatabaseAsync).mockResolvedValue(
    nativeDatabase as SQLite.SQLiteDatabase,
  );

  await ExpoDatabase.open();

  expect(SQLite.openDatabaseAsync).toHaveBeenCalledWith('taatoru.db', {
    finalizeUnusedStatementsBeforeClosing: false,
  });
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
  jest.mocked(SQLite.openDatabaseAsync).mockResolvedValue(
    nativeDatabase as unknown as SQLite.SQLiteDatabase,
  );
  const db = await ExpoDatabase.open();

  await expect(
    Promise.all([
      db.transaction((tx) => tx.run('UPDATE sync_state SET last_sync_at = ?')),
      db.first('SELECT last_sync_at FROM sync_state'),
    ]),
  ).resolves.toEqual([
    { changes: 1, lastInsertRowId: 1 },
    null,
  ]);
});
