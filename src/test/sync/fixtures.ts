import { migrateDatabase } from '@/db/migrate';
import { NodeTestDatabase } from '@/db/NodeTestDatabase';
import { SyncRepository, type FullRefreshResources } from '@/features/sync/SyncRepository';
import { assignmentFixture, collectionPage, kanjiFixture, reviewStatisticFixture,
  studyMaterialFixture, userFixture } from '@/fixtures/api';
export { FixtureSyncApi } from './FixtureSyncApi';

export const SYNC_NOW = new Date('2026-10-24T14:00:00.000Z');

export function syncResources(): FullRefreshResources {
  return {
    subjects: collectionPage([kanjiFixture]), assignments: collectionPage([assignmentFixture]),
    studyMaterials: collectionPage([studyMaterialFixture]), user: userFixture,
    reviewStatistics: collectionPage([reviewStatisticFixture]),
    voiceActors: collectionPage([]), levelProgressions: collectionPage([]),
  };
}

export async function syncDatabase(): Promise<NodeTestDatabase> {
  const db = await NodeTestDatabase.open();
  await migrateDatabase(db);
  await new SyncRepository(db).replaceFullRefresh(syncResources(), SYNC_NOW);
  return db;
}
