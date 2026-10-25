import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import type { Database } from '@/db/Database';
import { ExpoDatabase } from '@/db/ExpoDatabase';
import { migrateDatabase } from '@/db/migrate';
import { SubjectRepository } from '@/db/repositories/SubjectRepository';
import { AssignmentRepository } from '@/db/repositories/AssignmentRepository';
import { assignmentFixture, kanjiFixture } from '@/fixtures/api';
import { HomeScreen } from '@/features/home/HomeScreen';
import { getDashboardSnapshot } from '@/features/home/dashboard';
import { LessonPickerScreen, loadLessonPickerItems } from '@/features/lessons/LessonPickerScreen';
import { LessonSessionScreen } from '@/features/lessons/LessonSessionScreen';
import { startAutomaticLessons } from '@/features/lessons/lessonLauncher';
import { SessionRepository, type LessonSessionSnapshot } from '@/features/sessions/SessionRepository';
import { ReviewSessionRepository, type ReviewSessionSnapshot } from '@/features/reviews/ReviewSessionRepository';
import { ReviewSessionScreen } from '@/features/reviews/ReviewSessionScreen';
import { startReviewSession } from '@/features/reviews/reviewLauncher';
import type { SubjectResource } from '@/api/types';
import { SyncControlRepository } from '@/features/sync/SyncControlRepository';
import { SyncRepository } from '@/features/sync/SyncRepository';
import { AccountDatabase } from '@/features/sync/FencedDatabase';
import { OwnedSyncEngine } from '@/features/sync/OwnedSyncEngine';
import { SyncCoordinator } from '@/features/sync/SyncCoordinator';
import { StudyAction } from '@/features/sessions/StudySubjectInformation';
import { FixtureSyncApi } from './FixtureSyncApi';
import { FIXTURE_NOW, fixtureResources } from './nativeScenarios';

/** Existing study screens with real persistence and a fake server in a separate test entry. */
export function NativeStudyApp({ onBack }: { readonly onBack: () => void }) {
  const [db, setDb] = useState<Database | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'home' | 'picker' | 'lesson' | 'review'>('home');
  const [selected, setSelected] = useState<readonly number[]>([]);
  const [lesson, setLesson] = useState<LessonSessionSnapshot | null>(null);
  const [review, setReview] = useState<ReviewSessionSnapshot | null>(null);
  const [subjects, setSubjects] = useState<readonly SubjectResource[]>([]);
  useEffect(() => {
    let current = true; let opened: Database | undefined;
    void (async () => {
      const raw = await ExpoDatabase.open('sync-study-fixture-v2.db'); opened = raw; await migrateDatabase(raw);
      const api = new FixtureSyncApi(); const control = new SyncControlRepository(raw);
      if (await raw.first('SELECT id FROM user') === null) {
        await new SyncRepository(raw).replaceFullRefresh(await fixtureResources(api), FIXTURE_NOW);
        await new SubjectRepository(raw).replaceSubjects(Array.from({ length: 120 }, (_, index) => ({
          ...kanjiFixture, id: 1_000 + index, data: { ...kanjiFixture.data, level: 1 + Math.floor(index / 40), lesson_position: index },
        })), null);
        await new AssignmentRepository(raw).replaceAssignments(Array.from({ length: 120 }, (_, index) => ({
          ...assignmentFixture, id: 5_000 + index, data: { ...assignmentFixture.data, subject_id: 1_000 + index,
            srs_stage: 0, started_at: null, available_at: null, passed_at: null },
        })), null);
      }
      const context = await control.getAccountContext() ?? await control.activateCredentials(await control.beginCredentialTransition(), api.user.data.id, false);
      const scoped = new AccountDatabase(raw, context);
      const repository = new SessionRepository(scoped);
      const saved = await repository.loadLessonSession();
      const savedReview = await new ReviewSessionRepository(scoped).loadReviewSession();
      if (current) {
        setDb(scoped);
        setSelected(await repository.loadLessonSelectionIds());
        if (saved !== null && saved.phase !== 'selection') {
          setLesson(saved); setSubjects(await repository.loadLessonSubjects(saved)); setMode('lesson');
        } else if (savedReview !== null) {
          setReview(savedReview); setSubjects(await new ReviewSessionRepository(scoped).loadReviewSubjects(savedReview)); setMode('review');
        }
      }
    })().catch((failure) => { if (current) setError(String(failure)); });
    return () => { current = false; void opened?.close(); };
  }, []);
  const loadSnapshot = useCallback(() => getDashboardSnapshot(db!, new Date(), false), [db]);
  const loadCandidates = useCallback(() => loadLessonPickerItems(db!), [db]);
  if (db === null) return error === null ? <ActivityIndicator /> : <Text>{error}</Text>;
  const sessions = new SessionRepository(db);
  const reviews = new ReviewSessionRepository(db);
  const openLesson = async (snapshot: LessonSessionSnapshot | null) => {
    if (snapshot === null) return;
    setSubjects(await sessions.loadLessonSubjects(snapshot)); setLesson(snapshot); setMode('lesson');
  };
  if (mode === 'picker') return <LessonPickerScreen loadCandidates={loadCandidates} restoredSelectedIds={selected} maxSelection={3}
    onSelectionChange={async (items) => { await sessions.saveLessonSelection(items); setSelected(items.map(({ subjectId }) => subjectId)); }}
    onCancel={async () => { await sessions.clearLessonSelection(); setSelected([]); setMode('home'); }}
    onBegin={async (items) => { await openLesson(await sessions.startLessonSession(items)); }} />;
  if (mode === 'lesson' && lesson !== null) return <LessonSessionScreen initialSnapshot={lesson} subjects={subjects}
    onExit={() => setMode('home')} onFinish={async () => { await sessions.clearLessonSession(); setMode('home'); }}
    onCommitTransition={async (transition) => { await sessions.commitLessonTransition(transition.completedItem, transition.snapshot); }} />;
  if (mode === 'review' && review !== null) return <ReviewSessionScreen initialSnapshot={review} subjects={subjects}
    onExit={() => setMode('home')} onFinish={async () => { await reviews.clearReviewSession(); setMode('home'); }}
    onCommitTransition={async (transition) => { await reviews.commitReviewTransition(transition.completedItem, transition.snapshot); }} />;
  return <View style={{ flex: 1 }}>
    <StudyAction label="Return to fixture checks" onPress={onBack} />
    <HomeScreen loadSnapshot={loadSnapshot} synchronize={async (syncMode) => {
      const control = new SyncControlRepository(db); const context = (await control.getAccountContext())!;
      const api = new FixtureSyncApi();
      const coordinator = new SyncCoordinator({ db, context, engine: new OwnedSyncEngine({ db, context, apiFactory: () => api,
        isOnline: async () => true, now: () => new Date(), invalidate: () => {}, updateNotifications: () => {} }) });
      try { return await coordinator.request('manual', syncMode); } finally { coordinator.dispose(); }
    }} onPickLessons={() => setMode('picker')} onStartLessons={() => { void startAutomaticLessons(db).then(openLesson); }}
      onStartReviews={() => { void startReviewSession(db).then(async (snapshot) => {
        if (snapshot === null) return; setSubjects(await reviews.loadReviewSubjects(snapshot)); setReview(snapshot); setMode('review');
      }); }} />
  </View>;
}
