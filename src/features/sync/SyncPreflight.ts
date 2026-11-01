import { ApiError } from '@/api/errors';
import { compareWaniKaniDates } from '@/api/date';
import type { WaniKaniApi } from '@/api/WaniKaniApi';
import type { Database } from '@/db/Database';
import { SyncRepository, TransactionDatabase } from './SyncRepository';
import type { AccountContext } from './types';
import type { SyncMode } from './SyncEngine';

/** Validate identity and reset history before any pending progress is submitted. */
export class SyncPreflight {
  constructor(private readonly db: Database, private readonly api: WaniKaniApi,
    private readonly context: AccountContext) {}

  async run(mode: SyncMode = 'quick'): Promise<import('@/api/types').Resource<import('@/api/types').UserData, 'user'>> {
    const previous = (await this.db.first<{
      resets_updated_at: string | null; last_confirmed_reset_at: string | null;
    }>('SELECT resets_updated_at, last_confirmed_reset_at FROM sync_control WHERE id = 1'))!;
    const user = await this.api.getUser();
    if (user.data.id !== this.context.userId)
      throw new ApiError('The connected WaniKani account changed. Sign in again.', { status: 401 });
    const resets = await this.api.getResets(previous.resets_updated_at);
    const known = await this.db.all<{ id: number; confirmed_at: string | null }>('SELECT id, confirmed_at FROM sync_resets');
    const newResets = resets.data.filter((reset) => {
      const old = known.find(({ id }) => id === reset.id);
      return reset.data.confirmed_at !== null && (old?.confirmed_at == null ||
        compareWaniKaniDates(reset.data.confirmed_at, old.confirmed_at) > 0);
    });
    // Fetch everything needed for a reset before changing any cache generation.
    const assignments = newResets.length > 0 ? await this.api.getAssignments(null) : null;
    const statistics = newResets.length > 0 ? await this.api.getReviewStatistics(null) : null;
    await this.db.transaction(async (tx) => {
      const repository = new SyncRepository(new TransactionDatabase(tx));
      if (mode === 'quick' || newResets.length > 0) await repository.replaceUser(user);
      let latest = previous.last_confirmed_reset_at;
      for (const reset of resets.data) {
        await tx.run(`INSERT INTO sync_resets (id, confirmed_at, target_level, data_updated_at)
          VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET
          confirmed_at = excluded.confirmed_at, target_level = excluded.target_level,
          data_updated_at = excluded.data_updated_at`, [reset.id, reset.data.confirmed_at,
          reset.data.target_level, reset.data_updated_at]);
        if (reset.data.confirmed_at !== null &&
            (latest === null || compareWaniKaniDates(reset.data.confirmed_at, latest) > 0))
          latest = reset.data.confirmed_at;
      }
      if (assignments !== null && statistics !== null) {
        await tx.run('DELETE FROM assignments');
        await tx.run('DELETE FROM subject_progress');
        await tx.run('DELETE FROM review_statistics');
        await repository.replaceAssignments(assignments.data, assignments.data_updated_at);
        await repository.replaceReviewStatistics(statistics.data, statistics.data_updated_at);
        // Subjects newly accessible after a reset are imported by the next phase.
        // Replay their assignments/statistics after that import instead of skipping them.
        await tx.run('UPDATE sync_state SET assignments_updated_at = NULL, review_statistics_updated_at = NULL WHERE id = 1');
        await tx.run(`UPDATE pending_progress SET delivery_state = 'uncertain', next_attempt_at = NULL`);
        for (const reset of newResets) {
          // A session created offline after a remote reset can still use the old
          // cache. Local wall time cannot prove it observed the new opportunity.
          // On first discovery invalidate every affected saved session; completed
          // subjects already live in the outbox and unrelated sessions remain.
          await tx.run(`DELETE FROM active_sessions WHERE EXISTS(SELECT 1 FROM json_each(active_sessions.state_json, '$.items') i
              JOIN subjects s ON s.id = json_extract(i.value, '$.subjectId') WHERE s.level >= ?)`,
          [reset.data.target_level]);
        }
      }
      await tx.run(`UPDATE sync_control SET resets_updated_at = ?, last_confirmed_reset_at = ? WHERE id = 1`,
      [resets.data_updated_at ?? previous.resets_updated_at, latest]);
    });
    return user;
  }
}
