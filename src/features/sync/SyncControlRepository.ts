import type { Database, DatabaseTransaction } from '@/db/Database';
import { clearAccountData } from './accountData';
import type { AccountContext, CredentialReservation, RequestContext, SyncLease } from './types';

const LEASE_MS = 120_000;

interface ControlRow {
  readonly user_id: string | null;
  readonly account_epoch: number;
  readonly credential_revision: number;
  readonly credential_sequence: number;
  readonly active_credential_key: string | null;
  readonly pending_credential_key: string | null;
  readonly transition_id: number | null;
  readonly auth_state: string;
  readonly operation_sequence: number;
  readonly owner_fence: number;
  readonly lease_started_at: number;
  readonly lease_until: number;
  readonly resets_updated_at: string | null;
  readonly last_confirmed_reset_at: string | null;
  readonly next_request_at: number;
  readonly blocked_until: number;
  readonly budget_remaining: number | null;
  readonly budget_reset_at: number;
}

export class StaleSyncError extends Error {
  constructor() { super('Synchronization ownership is no longer current'); }
}

export class AccountIdentityError extends Error {
  constructor() { super('Account replacement must be confirmed'); }
}

export class SyncControlRepository {
  constructor(private readonly db: Database) {}

  async getAccountContext(): Promise<AccountContext | null> {
    const row = await this.read(this.db);
    return row.auth_state === 'active' ? contextOf(row) : null;
  }

  async getCredentialKey(): Promise<string | null> {
    const row = await this.read(this.db);
    return row.auth_state === 'active' ? row.active_credential_key : null;
  }

  async getPendingReservation(): Promise<CredentialReservation | null> {
    const row = await this.read(this.db);
    if (row.transition_id === null || row.pending_credential_key === null) return null;
    return {
      transitionId: row.transition_id, credentialRevision: row.transition_id,
      credentialKey: row.pending_credential_key, previousAccount: contextOf(row),
    };
  }

  beginCredentialTransition(): Promise<CredentialReservation> {
    return this.transact(async (tx) => {
      const row = await this.read(tx);
      const revision = row.credential_sequence + 1;
      const credentialKey = `taatoru.credential.${revision}`;
      await tx.run(`UPDATE sync_control SET credential_sequence = ?,
        transition_id = ?, pending_credential_key = ?, auth_state = 'transitioning',
        owner_fence = owner_fence + 1, lease_until = 0 WHERE id = 1`,
      [revision, revision, credentialKey]);
      return { transitionId: revision, credentialRevision: revision, credentialKey,
        previousAccount: contextOf(row) };
    });
  }

  activateCredentials(
    reservation: CredentialReservation, userId: string, replaceAccount: boolean,
  ): Promise<AccountContext> {
    return this.transact(async (tx) => {
      const row = await this.read(tx);
      await this.assertReservation(tx, reservation);
      const cached = await tx.first<{ id: string }>('SELECT id FROM user LIMIT 1');
      const previousId = row.user_id ?? cached?.id ?? null;
      const changed = previousId !== null && previousId !== userId;
      if (changed && !replaceAccount) throw new AccountIdentityError();
      if (changed) await clearAccountData(tx);
      const epoch = row.account_epoch + (previousId === null || changed ? 1 : 0);
      await tx.run(`UPDATE sync_control SET user_id = ?, account_epoch = ?,
        credential_revision = ?, active_credential_key = ?,
        pending_credential_key = NULL, transition_id = NULL, auth_state = 'active',
        owner_fence = owner_fence + 1, lease_until = 0,
        resets_updated_at = CASE WHEN ? THEN NULL ELSE resets_updated_at END,
        last_confirmed_reset_at = CASE WHEN ? THEN NULL ELSE last_confirmed_reset_at END
        WHERE id = 1`, [userId, epoch, reservation.credentialRevision,
        reservation.credentialKey, changed, changed]);
      return { userId, accountEpoch: epoch, credentialRevision: reservation.credentialRevision };
    });
  }

  async cancelCredentialTransition(reservation: CredentialReservation): Promise<void> {
    await this.transact(async (tx) => {
      const row = await this.read(tx);
      if (row.transition_id !== reservation.transitionId) return;
      await tx.run(`UPDATE sync_control SET pending_credential_key = NULL,
        transition_id = NULL, auth_state = CASE
        WHEN active_credential_key IS NOT NULL THEN 'active'
        WHEN user_id IS NOT NULL THEN 'legacy' ELSE 'signed_out' END WHERE id = 1`);
    });
  }

  async invalidateAccount(context?: AccountContext): Promise<void> {
    await this.transact(async (tx) => {
      if (context !== undefined) await this.assertAccount(tx, context);
      await tx.run(`UPDATE sync_control SET user_id = NULL,
        account_epoch = account_epoch + 1, active_credential_key = NULL,
        pending_credential_key = NULL, transition_id = NULL, auth_state = 'signed_out',
        owner_fence = owner_fence + 1, lease_until = 0, resets_updated_at = NULL,
        last_confirmed_reset_at = NULL WHERE id = 1`);
      await clearAccountData(tx);
    });
  }

  acquire(context: AccountContext, now: number): Promise<SyncLease | null> {
    return this.transact(async (tx) => {
      const row = await this.read(tx);
      this.checkContext(row, context);
      if (row.auth_state !== 'active') throw new StaleSyncError();
      if (row.lease_until > now && now >= row.lease_started_at) return null;
      // An expired owner may have reached the server. Never replay blindly.
      for (const table of ['pending_progress', 'pending_study_materials', 'sync_dispatches']) {
        await tx.run(`UPDATE ${table} SET delivery_state = 'uncertain'
          WHERE delivery_state = 'in_flight' AND account_epoch = ?`, [context.accountEpoch]);
      }
      const ownerFence = row.owner_fence + 1;
      await tx.run(`UPDATE sync_control SET owner_fence = ?, lease_started_at = ?,
        lease_until = ? WHERE id = 1`, [ownerFence, now, now + LEASE_MS]);
      return { context, ownerFence, expiresAtMs: now + LEASE_MS };
    });
  }

  renew(lease: SyncLease, now: number): Promise<SyncLease> {
    return this.transact(async (tx) => {
      await this.assertLease(tx, lease, now);
      await tx.run('UPDATE sync_control SET lease_until = ? WHERE id = 1', [now + LEASE_MS]);
      return { ...lease, expiresAtMs: now + LEASE_MS };
    });
  }

  async release(lease: SyncLease): Promise<void> {
    await this.transact(async (tx) => {
      await tx.run(`UPDATE sync_control SET lease_until = 0 WHERE id = 1
        AND owner_fence = ? AND account_epoch = ? AND credential_revision = ?`,
      [lease.ownerFence, lease.context.accountEpoch, lease.context.credentialRevision]);
    });
  }

  async assertAccount(tx: DatabaseTransaction, context: AccountContext): Promise<void> {
    const row = await this.read(tx);
    if (row.user_id !== context.userId || row.account_epoch !== context.accountEpoch)
      throw new StaleSyncError();
  }

  async assertLease(tx: DatabaseTransaction, lease: SyncLease, now: number): Promise<void> {
    const row = await this.read(tx);
    this.checkContext(row, lease.context);
    if (row.auth_state !== 'active' || row.owner_fence !== lease.ownerFence ||
        row.lease_until <= now || now < row.lease_started_at) throw new StaleSyncError();
  }

  async assertRequest(context: RequestContext, now: number): Promise<void> {
    if ('ownerFence' in context) await this.assertLease(this.db, context, now);
    else await this.assertReservation(this.db, context);
  }

  async allocateOperationKey(tx: DatabaseTransaction, accountEpoch: number): Promise<string> {
    await tx.run('UPDATE sync_control SET operation_sequence = operation_sequence + 1 WHERE id = 1');
    const row = await this.read(tx);
    if (row.account_epoch !== accountEpoch) throw new StaleSyncError();
    return `${accountEpoch}:${row.operation_sequence}`;
  }

  async assertReservation(tx: DatabaseTransaction, reservation: CredentialReservation): Promise<void> {
    const row = await this.read(tx);
    if (row.auth_state !== 'transitioning' || row.transition_id !== reservation.transitionId ||
        row.pending_credential_key !== reservation.credentialKey)
      throw new Error('Credential transition is no longer current');
  }

  private checkContext(row: ControlRow, context: AccountContext): void {
    if (row.user_id !== context.userId || row.account_epoch !== context.accountEpoch ||
        row.credential_revision !== context.credentialRevision) throw new StaleSyncError();
  }

  private async read(tx: DatabaseTransaction): Promise<ControlRow> {
    const row = await tx.first<ControlRow>('SELECT * FROM sync_control WHERE id = 1');
    if (row === null) throw new Error('Missing synchronization control state');
    return row;
  }

  private async transact<T>(operation: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try { return await this.db.transaction(operation); }
      catch (error) {
        if (attempt >= 4 || !/database is locked|SQLITE_BUSY/.test(String(error))) throw error;
        await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
      }
    }
  }
}

function contextOf(row: ControlRow): AccountContext | null {
  return row.user_id === null ? null : {
    userId: row.user_id, accountEpoch: row.account_epoch,
    credentialRevision: row.credential_revision,
  };
}
