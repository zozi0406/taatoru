import { migrateDatabase } from '../migrate';
import { NodeTestDatabase } from '../NodeTestDatabase';

test('rolls back all writes when a transaction fails', async () => {
  const db = await NodeTestDatabase.open();
  try {
    await migrateDatabase(db);

    await expect(
      db.transaction(async (tx) => {
        await tx.run('INSERT INTO settings (key, value) VALUES (?, ?)', [
          'theme',
          'dark',
        ]);
        throw new Error('stop');
      }),
    ).rejects.toThrow('stop');

    expect(
      await db.first('SELECT * FROM settings WHERE key = ?', ['theme']),
    ).toBeNull();
  } finally {
    await db.close();
  }
});

test('commits a transaction result and all of its writes', async () => {
  const db = await NodeTestDatabase.open();
  try {
    await migrateDatabase(db);

    const result = await db.transaction(async (tx) => {
      await tx.run('INSERT INTO settings (key, value) VALUES (?, ?)', [
        'theme',
        'dark',
      ]);
      return 'committed';
    });

    expect(result).toBe('committed');
    expect(
      await db.first('SELECT * FROM settings WHERE key = ?', ['theme']),
    ).toEqual({ key: 'theme', value: 'dark' });
  } finally {
    await db.close();
  }
});
