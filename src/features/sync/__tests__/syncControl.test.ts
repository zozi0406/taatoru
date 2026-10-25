import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { migrateDatabase } from '@/db/migrate';
import { NodeTestDatabase } from '@/db/NodeTestDatabase';
import { SyncControlRepository } from '../SyncControlRepository';

test('migration retries contention during WAL setup as well as inside the transaction', async () => {
  const db = await NodeTestDatabase.open();
  try {
    jest.spyOn(db, 'first').mockRejectedValueOnce(new Error('database is locked'));
    await migrateDatabase(db);
    expect(await db.first('PRAGMA user_version')).toEqual({ user_version: 2 });
  } finally { await db.close(); }
});

test('independent connections cannot own the same account concurrently', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'taatoru-owner-'));
  const first = await NodeTestDatabase.open(join(folder, 'cache.db'));
  const second = await NodeTestDatabase.open(join(folder, 'cache.db'));
  try {
    await migrateDatabase(first);
    await migrateDatabase(second);
    const a = new SyncControlRepository(first);
    const b = new SyncControlRepository(second);
    const reservation = await a.beginCredentialTransition();
    const context = await a.activateCredentials(reservation, 'account-a', false);
    const lease = await a.acquire(context, 1_000);
    expect(lease).not.toBeNull();
    expect(await b.acquire(context, 1_001)).toBeNull();
    await a.release(lease!);
    expect((await b.acquire(context, 1_002))?.ownerFence)
      .toBeGreaterThan(lease!.ownerFence);
  } finally {
    await first.close(); await second.close();
    rmSync(folder, { recursive: true });
  }
});

test('stale credential activation cannot replace a newer reserved slot', async () => {
  const db = await NodeTestDatabase.open();
  try {
    await migrateDatabase(db);
    const control = new SyncControlRepository(db);
    const old = await control.beginCredentialTransition();
    const next = await control.beginCredentialTransition();
    expect(next.credentialKey).not.toBe(old.credentialKey);
    const active = await control.activateCredentials(next, 'account-b', true);
    await expect(control.activateCredentials(old, 'account-a', true))
      .rejects.toThrow('no longer current');
    expect(await control.getAccountContext()).toEqual(active);
    expect(await control.getCredentialKey()).toBe(next.credentialKey);
  } finally { await db.close(); }
});

test('owner expiry fences the old owner and preserves uncertain dispatches', async () => {
  const db = await NodeTestDatabase.open();
  try {
    await migrateDatabase(db);
    const control = new SyncControlRepository(db);
    const context = await control.activateCredentials(
      await control.beginCredentialTransition(), 'account-a', false,
    );
    const old = (await control.acquire(context, 1_000))!;
    await db.run(`INSERT INTO sync_dispatches VALUES
      ('1:1', 1, 'material', 201, ?, '{"note":"first"}', NULL, NULL, 'in_flight', ?)`,
    [context.accountEpoch, old.ownerFence]);
    const successor = (await control.acquire(context, 121_001))!;
    expect(successor.ownerFence).toBeGreaterThan(old.ownerFence);
    await expect(db.transaction((tx) => control.assertLease(tx, old, 121_001)))
      .rejects.toThrow('ownership');
    expect(await db.first('SELECT payload_json, delivery_state FROM sync_dispatches'))
      .toEqual({ payload_json: '{"note":"first"}', delivery_state: 'uncertain' });
  } finally { await db.close(); }
});

test('logout increments account fencing and never reuses operation identities', async () => {
  const db = await NodeTestDatabase.open();
  try {
    await migrateDatabase(db);
    const control = new SyncControlRepository(db);
    const context = await control.activateCredentials(
      await control.beginCredentialTransition(), 'account-a', false,
    );
    const first = await db.transaction((tx) => control.allocateOperationKey(tx, context.accountEpoch));
    await control.invalidateAccount(context);
    expect(await control.getAccountContext()).toBeNull();
    const next = await control.activateCredentials(
      await control.beginCredentialTransition(), 'account-b', false,
    );
    const second = await db.transaction((tx) => control.allocateOperationKey(tx, next.accountEpoch));
    expect(second).not.toBe(first);
    expect(next.accountEpoch).toBeGreaterThan(context.accountEpoch);
  } finally { await db.close(); }
});
