import type { Database } from './Database';
import { MIGRATION_1_STATEMENTS, SCHEMA_VERSION } from './schema';
import { MIGRATION_2_STATEMENTS } from './migrations/002_sync_control';

interface UserVersionRow {
  readonly user_version: number;
}

export async function migrateDatabase(db: Database): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try { await migrateOnce(db); return; }
    catch (error) {
      if (attempt >= 4 || !/database is locked|SQLITE_BUSY/.test(String(error))) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
}

async function migrateOnce(db: Database): Promise<void> {
  await db.run('PRAGMA foreign_keys = ON');
  await db.run('PRAGMA busy_timeout = 250');
  await db.first('PRAGMA journal_mode = WAL');

  const version =
    (await db.first<UserVersionRow>('PRAGMA user_version'))?.user_version ?? 0;
  if (version > SCHEMA_VERSION) {
    throw new Error(
      `Database schema ${version} is newer than supported schema ${SCHEMA_VERSION}`,
    );
  }
  if (version === SCHEMA_VERSION) {
    return;
  }

  await db.transaction(async (tx) => {
    // Another connection can finish migration while we wait for its lock.
    let current = (await tx.first<UserVersionRow>('PRAGMA user_version'))?.user_version ?? 0;
    if (current > SCHEMA_VERSION) throw new Error('Database schema is newer than supported');
    if (current === 0) {
      for (const statement of MIGRATION_1_STATEMENTS) await tx.run(statement);
      current = 1;
    }
    if (current === 1) {
      for (const statement of MIGRATION_2_STATEMENTS) await tx.run(statement);
    }
  });
}
