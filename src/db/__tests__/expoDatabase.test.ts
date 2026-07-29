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
