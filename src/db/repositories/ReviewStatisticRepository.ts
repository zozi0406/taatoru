import type { IdentifiedResource, ReviewStatisticData } from '@/api/types';
import type { Database } from '../Database';

export class ReviewStatisticRepository {
  constructor(private readonly db: Database) {}

  replaceReviewStatistics(
    resources: readonly IdentifiedResource<
      ReviewStatisticData,
      'review_statistic'
    >[],
    cursor: string | null,
  ): Promise<void> {
    return this.db.transaction(async (tx) => {
      for (const resource of resources) {
        const d = resource.data;
        await tx.run(
          `INSERT INTO review_statistics (
            id, subject_id, subject_type, meaning_correct, meaning_incorrect,
            meaning_max_streak, meaning_current_streak, reading_correct,
            reading_incorrect, reading_max_streak, reading_current_streak,
            percentage_correct, hidden, data_updated_at, resource_json
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          )
          ON CONFLICT(subject_id) DO UPDATE SET
            id=excluded.id,
            subject_id=excluded.subject_id, subject_type=excluded.subject_type,
            meaning_correct=excluded.meaning_correct,
            meaning_incorrect=excluded.meaning_incorrect,
            meaning_max_streak=excluded.meaning_max_streak,
            meaning_current_streak=excluded.meaning_current_streak,
            reading_correct=excluded.reading_correct,
            reading_incorrect=excluded.reading_incorrect,
            reading_max_streak=excluded.reading_max_streak,
            reading_current_streak=excluded.reading_current_streak,
            percentage_correct=excluded.percentage_correct,
            hidden=excluded.hidden, data_updated_at=excluded.data_updated_at,
            resource_json=excluded.resource_json`,
          [
            resource.id, d.subject_id, d.subject_type, d.meaning_correct,
            d.meaning_incorrect, d.meaning_max_streak,
            d.meaning_current_streak, d.reading_correct, d.reading_incorrect,
            d.reading_max_streak, d.reading_current_streak,
            d.percentage_correct, d.hidden, resource.data_updated_at,
            JSON.stringify(resource),
          ],
        );
      }
      await tx.run(
        'UPDATE sync_state SET review_statistics_updated_at = ? WHERE id = 1',
        [cursor],
      );
    });
  }
}
