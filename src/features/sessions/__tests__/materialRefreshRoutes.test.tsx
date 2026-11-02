import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { SubjectStudyMaterial } from '@/features/subjects/subjectDetails';
import type { Database } from '@/db/Database';
import { StudyMaterialRepository } from '@/db/repositories/StudyMaterialRepository';
import { SessionRepository } from '../SessionRepository';
import { ReviewSessionRepository } from '@/features/reviews/ReviewSessionRepository';
import { studyMaterialFixture } from '@/fixtures/api';
import { syncDatabase } from '@/test/sync/fixtures';
import { renderApp } from '@/test/render';
import { ThemeProvider } from '@/ui/theme/ThemeProvider';
import LessonSessionRoute from '../../../../app/lessons/session';
import ReviewSessionRoute from '../../../../app/reviews/session';

let mockDatabase: Database;
let mockObservedMaterials: Readonly<Record<number, SubjectStudyMaterial>> | undefined;
let mockFocus: (() => void) | undefined;
const mockListeners = new Set<() => void>();
const mockSubscribe = (listener: () => void) => { mockListeners.add(listener); return () => { mockListeners.delete(listener); }; };
const mockRouter = { replace: jest.fn(), push: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useFocusEffect: (callback: () => void) => {
    const React = jest.requireActual<typeof import('react')>('react');
    React.useEffect(() => { mockFocus = callback; return callback(); }, [callback]);
  },
}));
jest.mock('@/app/AppProviders', () => ({
  useAppServices: () => ({ db: mockDatabase, subscribeToData: mockSubscribe, notifyPendingWrites: jest.fn() }),
}));
jest.mock('@/features/lessons/LessonSessionScreen', () => {
  const actual = jest.requireActual('@/features/lessons/LessonSessionScreen');
  const React = jest.requireActual('react');
  return { ...actual, LessonSessionScreen: (props: Parameters<typeof import('@/features/lessons/LessonSessionScreen').LessonSessionScreen>[0]) => {
    mockObservedMaterials = props.studyMaterials;
    return React.createElement(actual.LessonSessionScreen, props);
  } };
});
jest.mock('@/features/reviews/ReviewSessionScreen', () => {
  const actual = jest.requireActual('@/features/reviews/ReviewSessionScreen');
  const React = jest.requireActual('react');
  return { ...actual, ReviewSessionScreen: (props: Parameters<typeof import('@/features/reviews/ReviewSessionScreen').ReviewSessionScreen>[0]) => {
    mockObservedMaterials = props.studyMaterials;
    return React.createElement(actual.ReviewSessionScreen, props);
  } };
});
jest.mock('expo-audio', () => ({ useAudioPlayer: () => ({ play: jest.fn(), seekTo: jest.fn() }) }));

// Exercise both retained routes through real answer checking and SQLite.
test.each(['lesson', 'review'] as const)('%s refreshes synonyms on focus and sync without resetting input', async (kind) => {
  const db = await syncDatabase(); mockDatabase = db;
  try {
    if (kind === 'review') await new ReviewSessionRepository(db).startReviewSession([{ assignmentId: 501, subjectId: 201 }]);
    else {
      await db.run('UPDATE assignments SET srs_stage = 0, started_at = NULL WHERE id = 501');
      const sessions = new SessionRepository(db);
      const started = await sessions.startLessonSession([{ assignmentId: 501, subjectId: 201, available: true,
        excluded: false, lessonPosition: 1, level: 1, subjectType: 'kanji' }]);
      await sessions.saveLessonSession({ ...started, phase: 'quiz', quizState: { ...started.quizState,
        currentPrompt: 'meaning', currentSubjectId: 201 } });
    }
    const rendered = await renderApp(<ThemeProvider scheme="light">{kind === 'review' ? <ReviewSessionRoute /> : <LessonSessionRoute />}</ThemeProvider>);
    await screen.findByLabelText('Meaning answer');
    await fireEvent.changeText(screen.getByLabelText('Meaning answer'), 'Unitary');
    const importer = new StudyMaterialRepository(db);
    await importer.replaceStudyMaterials([{ ...studyMaterialFixture, data_updated_at: '2026-11-01T10:00:00Z',
      data: { ...studyMaterialFixture.data, meaning_synonyms: ['Unitary'], meaning_note: 'Focus fixture note' } }], null);
    await act(async () => { mockFocus?.(); });
    await waitFor(() => expect(mockObservedMaterials?.[201]?.meaningNote).toBe('Focus fixture note'));
    expect(screen.getByLabelText('Meaning answer')).toHaveProp('value', 'Unitary');
    await importer.replaceStudyMaterials([{ ...studyMaterialFixture, data_updated_at: '2026-11-01T11:00:00Z',
      data: { ...studyMaterialFixture.data, meaning_synonyms: ['Unitary'], meaning_note: 'Sync fixture note' } }], null);
    await act(async () => { mockListeners.forEach((listener) => listener()); });
    await waitFor(() => expect(mockObservedMaterials?.[201]?.meaningNote).toBe('Sync fixture note'));
    expect(screen.getByLabelText('Meaning answer')).toHaveProp('value', 'Unitary');
    await fireEvent.press(screen.getByRole('button', { name: 'Submit answer' }));
    await waitFor(() => expect(screen.queryByText('Incorrect')).toBeNull());
    await screen.findByLabelText('Reading answer');
    await rendered.unmount();
    expect(mockListeners.size).toBe(0);
  } finally { await db.close(); mockListeners.clear(); mockFocus = undefined; }
});
