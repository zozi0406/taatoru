import { migrateDatabase } from '../migrate';
import { NodeTestDatabase } from '../NodeTestDatabase';
import { MIGRATION_1_STATEMENTS } from '../schema';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('upgrades a populated v1 database without losing pending work', async () => {
  const db = await NodeTestDatabase.open();
  try {
    for (const statement of MIGRATION_1_STATEMENTS) await db.run(statement);
    await db.run(`INSERT INTO pending_progress
      (subject_id, assignment_id, operation_kind, created_at, payload_json)
      VALUES (201, 501, 'review', '2026-10-24T12:00:00Z', '{"meaning":1}')`);
    await db.run(`INSERT INTO settings VALUES ('theme', 'dark')`);
    await migrateDatabase(db);
    expect(await db.first('PRAGMA user_version')).toEqual({ user_version: 2 });
    expect(await db.first(`SELECT payload_json, delivery_state, source_json
      FROM pending_progress`)).toEqual({
      payload_json: '{"meaning":1}', delivery_state: 'uncertain', source_json: null,
    });
    expect(await db.first('SELECT value FROM settings')).toEqual({ value: 'dark' });
    await migrateDatabase(db);
    expect(await db.all('SELECT id FROM sync_control')).toEqual([{ id: 1 }]);
  } finally { await db.close(); }
});

test('fresh installs have dispatch recovery and monotonic account metadata', async () => {
  const db = await NodeTestDatabase.open();
  try {
    await migrateDatabase(db);
    expect(await db.tableNames()).toEqual(expect.arrayContaining([
      'sync_control', 'sync_dispatches', 'sync_outcomes',
    ]));
    expect(await db.first('SELECT account_epoch, operation_sequence FROM sync_control'))
      .toEqual({ account_epoch: 0, operation_sequence: 0 });
  } finally { await db.close(); }
});

test('a failed upgrade rolls back its tables, columns, and version together', async () => {
  const db = await NodeTestDatabase.open();
  const transaction = db.transaction.bind(db);
  try {
    for (const statement of MIGRATION_1_STATEMENTS) await db.run(statement);
    db.transaction = (operation) => transaction((tx) => operation({
      first: tx.first.bind(tx), all: tx.all.bind(tx),
      run: async (sql, params) => {
        if (sql.startsWith('CREATE TABLE sync_dispatches')) throw new Error('interrupted');
        return tx.run(sql, params);
      },
    }));
    await expect(migrateDatabase(db)).rejects.toThrow('interrupted');
    expect(await db.first('PRAGMA user_version')).toEqual({ user_version: 1 });
    expect(await db.tableNames()).not.toContain('sync_control');
    db.transaction = transaction;
    await migrateDatabase(db);
    expect(await db.first('PRAGMA user_version')).toEqual({ user_version: 2 });
  } finally { await db.close(); }
});

test('two connections starting together apply each migration once', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'taatoru-migrate-'));
  const first = await NodeTestDatabase.open(join(folder, 'cache.db'));
  const second = await NodeTestDatabase.open(join(folder, 'cache.db'));
  try {
    await Promise.all([migrateDatabase(first), migrateDatabase(second)]);
    expect(await first.all('SELECT id FROM sync_control')).toEqual([{ id: 1 }]);
    expect(await second.first('PRAGMA user_version')).toEqual({ user_version: 2 });
  } finally {
    await first.close(); await second.close();
    rmSync(folder, { recursive: true });
  }
});
