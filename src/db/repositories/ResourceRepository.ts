import type {
  IdentifiedResource,
  LevelProgressionData,
  Resource,
  UserData,
  VoiceActorData,
} from '@/api/types';
import type { Database } from '../Database';

export class ResourceRepository {
  constructor(private readonly db: Database) {}

  replaceUser(resource: Resource<UserData, 'user'>): Promise<void> {
    return this.db.transaction(async (tx) => {
      await tx.run('DELETE FROM user');
      await tx.run(
        `INSERT INTO user (
          id, username, level, max_level_granted, subscription_active,
          data_updated_at, resource_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          resource.data.id,
          resource.data.username,
          resource.data.level,
          resource.data.subscription.max_level_granted,
          resource.data.subscription.active,
          resource.data_updated_at,
          JSON.stringify(resource),
        ],
      );
    });
  }

  replaceLevelProgressions(
    resources: readonly IdentifiedResource<
      LevelProgressionData,
      'level_progression'
    >[],
  ): Promise<void> {
    return this.db.transaction(async (tx) => {
      await tx.run('DELETE FROM level_progressions');
      for (const resource of resources) {
        const data = resource.data;
        await tx.run(
          `INSERT INTO level_progressions (
            id, level, unlocked_at, started_at, passed_at, completed_at,
            abandoned_at, data_updated_at, resource_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            resource.id,
            data.level,
            data.unlocked_at,
            data.started_at,
            data.passed_at,
            data.completed_at,
            data.abandoned_at,
            resource.data_updated_at,
            JSON.stringify(resource),
          ],
        );
      }
    });
  }

  replaceVoiceActors(
    resources: readonly IdentifiedResource<VoiceActorData, 'voice_actor'>[],
    cursor: string | null,
  ): Promise<void> {
    return this.db.transaction(async (tx) => {
      for (const resource of resources) {
        const data = resource.data;
        await tx.run(
          `INSERT INTO voice_actors (
            id, name, gender, description, data_updated_at, resource_json
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            gender = excluded.gender,
            description = excluded.description,
            data_updated_at = excluded.data_updated_at,
            resource_json = excluded.resource_json`,
          [
            resource.id,
            data.name,
            data.gender,
            data.description,
            resource.data_updated_at,
            JSON.stringify(resource),
          ],
        );
      }
      await tx.run(
        'UPDATE sync_state SET voice_actors_updated_at = ? WHERE id = 1',
        [cursor],
      );
    });
  }
}
