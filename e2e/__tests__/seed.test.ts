import { createScenario } from '../scenarios/factory';
import { MockWorld } from '../scenarios/world';
import { NodeTestDatabase } from '@/db/NodeTestDatabase';
import { migrateDatabase } from '@/db/migrate';
import { SyncControlRepository } from '@/features/sync/SyncControlRepository';
import { seedE2EAccount } from '@/test/e2e/seed';

const credentials = new Map<string, string>();
const store = { getCredential: async (key: string) => credentials.get(key) ?? null,
  setCredential: async (key: string, value: string) => { credentials.set(key, value); } };

test('seeds active account credentials and preserves state across identical bootstrap/rejects another run', async () => {
  const db = await NodeTestDatabase.open();
  await migrateDatabase(db);
  const world = new MockWorld(createScenario('smoke'));
  const bootstrap = { runId: 'one', resources: world.resources() };
  try {
    await seedE2EAccount(db, store, bootstrap);
    const context = await new SyncControlRepository(db).getAccountContext();
    expect(context?.userId).toBe('synthetic-account');
    const key = await new SyncControlRepository(db).getCredentialKey();
    expect(credentials.get(key!)).toBe('synthetic-only');
    await db.run("INSERT INTO settings (key,value) VALUES ('preserved','yes')");
    await seedE2EAccount(db, store, bootstrap);
    expect(await db.first("SELECT value FROM settings WHERE key='preserved'")).toEqual({ value: 'yes' });
    expect(await new SyncControlRepository(db).getAccountContext()).toEqual(context);
    await expect(seedE2EAccount(db, store, { ...bootstrap, runId: 'two' })).rejects.toThrow('Reset');
  } finally { await db.close(); }
});

test('interrupted bootstrap without readiness marker is rejected rather than overwriting cached work', async () => {
  const db = await NodeTestDatabase.open();
  await migrateDatabase(db);
  try {
    await db.run("INSERT INTO settings (key,value) VALUES ('e2e.seedStarted','unfinished')");
    await expect(seedE2EAccount(db, store, { runId: 'one', resources: new MockWorld(createScenario('smoke')).resources() })).rejects.toThrow('Reset');
  } finally { await db.close(); }
});
