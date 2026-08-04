import type { Database } from './Database';
import { MIGRATION_1_STATEMENTS, SCHEMA_VERSION } from './schema';

interface UserVersionRow {
  readonly user_version: number;
}

export async function migrateDatabase(db: Database): Promise<void> {
  await db.run('PRAGMA foreign_keys = ON');
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
    for (const statement of MIGRATION_1_STATEMENTS) {
      await tx.run(statement);
    }
  });
}
