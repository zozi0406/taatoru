import { compareWaniKaniDates } from '@/api/date';
import type { DatabaseTransaction } from '../Database';

type ResourceTable = 'subjects' | 'assignments' | 'study_materials' | 'review_statistics' | 'voice_actors';

/** Keep raw server JSON and its version together; local placeholder IDs are not server versions. */
export async function isOlderResource(
  tx: DatabaseTransaction, table: ResourceTable, id: number, timestamp: string,
): Promise<boolean> {
  const key = table === 'subjects' || table === 'voice_actors' ? 'id' : 'subject_id';
  const current = await tx.first<{ id: number; data_updated_at: string }>(
    `SELECT id, data_updated_at FROM ${table} WHERE ${key} = ?`, [id],
  );
  return current !== null && current.id > 0 &&
    compareWaniKaniDates(current.data_updated_at, timestamp) > 0;
}
