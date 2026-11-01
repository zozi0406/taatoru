import { screen } from '@testing-library/react-native';
import type { Database } from '@/db/Database';
import SavedChangesRoute from '../../../../app/sync';
import { syncDatabase, SYNC_NOW } from '@/test/sync/fixtures';
import { PendingWriteRepository } from '../PendingWriteRepository';
import { renderApp } from '@/test/render';
import { ThemeProvider } from '@/ui/theme/ThemeProvider';

let mockDatabase: Database;
const mockRouter = { back: jest.fn() };
jest.mock('expo-audio', () => ({ useAudioPlayer: () => ({ play: jest.fn(), seekTo: jest.fn() }) }));
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/app/AppProviders', () => ({ useAppServices: () => ({ db: mockDatabase, notifyPendingWrites: jest.fn() }) }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ repairCredentials: jest.fn() }) }));

test('saved reviews explain the choice without offering replay into a later cycle', async () => {
  const db = await syncDatabase(); mockDatabase = db;
  try {
    await new PendingWriteRepository(db).completeReview({ assignmentId: 501, subjectId: 201, completedAt: SYNC_NOW,
      incorrectMeaningAnswers: 2, incorrectReadingAnswers: 1 });
    await db.run("UPDATE pending_progress SET delivery_state = 'rejected', last_error_kind = 'review-conflict'");
    const rendered = await renderApp(<ThemeProvider scheme="light"><SavedChangesRoute /></ThemeProvider>);
    await screen.findByRole('button', { name: 'Keep saved review on this device' });
    expect(screen.getByRole('button', { name: 'Use WaniKani progress' })).toBeVisible();
    expect(screen.getByText(/Meaning mistakes: 2.*Reading mistakes: 1/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Verify and retry' })).toBeNull();
    await rendered.unmount();
  } finally { await db.close(); }
});

test('material differences never offer a local-or-remote overwrite decision', async () => {
  const db = await syncDatabase(); mockDatabase = db;
  try {
    await new PendingWriteRepository(db).queueStudyMaterial({ subjectId: 201, meaningNote: 'local', readingNote: null,
      meaningSynonyms: [], queuedAt: SYNC_NOW });
    await db.run("UPDATE pending_study_materials SET delivery_state = 'rejected', last_error_kind = 'material-conflict'");
    const rendered = await renderApp(<ThemeProvider scheme="light"><SavedChangesRoute /></ThemeProvider>);
    await screen.findByText(/Notes and synonyms/);
    expect(screen.queryByRole('button', { name: 'Keep my saved version' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Use observed WaniKani version' })).toBeNull();
    expect(screen.getByText(/WaniKani is authoritative for notes and synonyms/)).toBeVisible();
    await rendered.unmount();
  } finally { await db.close(); }
});
