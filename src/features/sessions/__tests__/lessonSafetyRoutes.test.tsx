import { AppState, type AppStateStatus } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import LessonSessionRoute from '../../../../app/lessons/session';
import type { Database } from '@/db/Database';
import { SessionRepository } from '../SessionRepository';
import { renderApp } from '@/test/render';
import { syncDatabase } from '@/test/sync/fixtures';
import { ThemeProvider } from '@/ui/theme/ThemeProvider';

let mockDatabase: Database;
const mockRouter = { replace: jest.fn(), push: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useFocusEffect: (callback: () => void) => {
    const React = jest.requireActual<typeof import('react')>('react');
    React.useEffect(callback, [callback]);
  },
}));
jest.mock('@/app/AppProviders', () => ({
  useAppServices: () => ({ db: mockDatabase, notifyPendingWrites: jest.fn() }),
}));
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ play: jest.fn(), seekTo: jest.fn() }),
}));

test('reloads a replaced lesson opportunity from a stale completion without retaining the old answered half', async () => {
  const db = await syncDatabase();
  mockDatabase = db;
  try {
    await db.run('UPDATE assignments SET srs_stage = 0, started_at = NULL WHERE id = 501');
    const sessions = new SessionRepository(db);
    const started = await sessions.startLessonSession([{
      assignmentId: 501, subjectId: 201, available: true, excluded: false,
      lessonPosition: 1, level: 1, subjectType: 'kanji',
    }]);
    await sessions.saveLessonSession({
      ...started, phase: 'quiz', quizState: {
        ...started.quizState, currentPrompt: 'reading', currentSubjectId: 201,
        questionProgress: { answeredMeaningSubjectIds: [201] },
      },
    });
    const rendered = await renderApp(<ThemeProvider scheme="light"><LessonSessionRoute /></ThemeProvider>);
    await screen.findByLabelText('Reading answer');
    await db.run('DELETE FROM subject_progress WHERE subject_id = 201');
    await db.run('UPDATE assignments SET id = 999 WHERE subject_id = 201');
    await fireEvent.changeText(screen.getByLabelText('Reading answer'), 'いち');
    await fireEvent.press(screen.getByRole('button', { name: 'Submit answer' }));
    await screen.findByText('Lesson availability changed. Reload lessons to continue.');
    expect(await db.first('SELECT COUNT(*) AS count FROM pending_progress')).toEqual({ count: 0 });
    await fireEvent.press(screen.getByRole('button', { name: 'Reload lessons' }));
    await screen.findByLabelText('Meaning answer');
    await waitFor(async () => expect(await sessions.loadLessonSession()).toMatchObject({
      items: [{ subjectId: 201, assignmentId: 999 }],
      quizState: { currentPrompt: 'meaning', questionProgress: { answeredMeaningSubjectIds: [] } },
    }));
    expect(await db.first('SELECT COUNT(*) AS count FROM pending_progress')).toEqual({ count: 0 });
    await rendered.unmount();
  } finally { await db.close(); }
});

test('rechecks lesson availability when a focused app returns from the background', async () => {
  const db = await syncDatabase();
  mockDatabase = db;
  let resume: ((state: AppStateStatus) => void) | undefined;
  const subscription = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    resume = listener;
    return { remove: jest.fn() };
  });
  try {
    await db.run('UPDATE assignments SET srs_stage = 0, started_at = NULL WHERE id = 501');
    await new SessionRepository(db).startLessonSession([{
      assignmentId: 501, subjectId: 201, available: true, excluded: false,
      lessonPosition: 1, level: 1, subjectType: 'kanji',
    }]);
    const rendered = await renderApp(<ThemeProvider scheme="light"><LessonSessionRoute /></ThemeProvider>);
    await screen.findByRole('button', { name: 'Continue to quiz' });
    await db.run('UPDATE assignments SET srs_stage = 1, started_at = ? WHERE id = 501', [new Date().toISOString()]);
    await act(async () => { resume?.('active'); });
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/lessons/picker'));
    expect(await db.first('SELECT COUNT(*) AS count FROM pending_progress')).toEqual({ count: 0 });
    await rendered.unmount();
  } finally { subscription.mockRestore(); await db.close(); }
});
