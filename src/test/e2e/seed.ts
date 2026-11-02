import type { Database } from '@/db/Database';
import { SyncRepository, type FullRefreshResources } from '@/features/sync/SyncRepository';
import { SyncControlRepository } from '@/features/sync/SyncControlRepository';
import type { TokenStore } from '@/features/auth/tokenStore';
import { DEFAULT_STUDY_SETTINGS, saveStudySettings } from '@/features/settings/studySettings';

export interface E2EBootstrap { readonly runId: string; readonly resources: FullRefreshResources }

/** Fixture initialization uses the same credential slots and resource import as the app. */
export async function seedE2EAccount(db: Database, store: Pick<TokenStore, 'setCredential'>, bootstrap: E2EBootstrap): Promise<void> {
  if (typeof bootstrap.runId !== 'string' || !bootstrap.runId || bootstrap.resources?.user?.data.id !== 'synthetic-account')
    throw new Error('Invalid synthetic bootstrap');
  const marker = await db.first<{ value: string }>("SELECT value FROM settings WHERE key = 'e2e.runId'");
  if (marker !== null) {
    if (marker.value !== bootstrap.runId) throw new Error('Reset the E2E app: local and server runs differ');
    const context = await new SyncControlRepository(db).getAccountContext();
    if (context?.userId !== bootstrap.resources.user.data.id) throw new Error('Reset the E2E app: account setup is incomplete');
    return;
  }
  if (await db.first("SELECT key FROM settings WHERE key = 'e2e.seedStarted'") || await db.first('SELECT id FROM user'))
    throw new Error('Reset the E2E app: previous bootstrap was interrupted');
  await db.run("INSERT INTO settings (key, value) VALUES ('e2e.seedStarted', ?)", [bootstrap.runId]);
  const control = new SyncControlRepository(db);
  const reservation = await control.beginCredentialTransition();
  await store.setCredential(reservation.credentialKey, 'synthetic-only');
  await control.activateCredentials(reservation, bootstrap.resources.user.data.id, false);
  await new SyncRepository(db).replaceFullRefresh(bootstrap.resources, new Date());
  await saveStudySettings(db, { ...DEFAULT_STUDY_SETTINGS, autoplay: false, readingInput: 'romaji',
    reviewOrder: 'oldest-first', reviewBatchSize: 1, lessonBatchSize: 1, reviewLimit: null,
    autoAdvance: false, incorrectAnswerDelay: 0 });
  await db.run("INSERT INTO settings (key, value) VALUES ('e2e.runId', ?)", [bootstrap.runId]);
}
