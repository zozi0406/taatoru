import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Text, View } from 'react-native';
import type { SubjectResource } from '@/api/types';
import { useAppServices } from '@/app/AppProviders';
import {
  ReviewSessionRepository,
  type ReviewSessionSnapshot,
} from '@/features/reviews/ReviewSessionRepository';
import { ReviewSessionScreen } from '@/features/reviews/ReviewSessionScreen';
import { startReviewSession } from '@/features/reviews/reviewLauncher';
import { reconcileReviewSession } from '@/features/sessions/sessionSubjects';
import {
  addStudySynonym,
  loadStudyMaterials,
} from '@/features/sessions/studyMaterials';
import type { SubjectStudyMaterial } from '@/features/subjects/subjectDetails';
import {
  loadStudySettings,
  type StudySettings,
} from '@/features/settings/studySettings';
import { StudySettingsContainer } from '@/features/settings/StudySettingsContainer';
import { StudyAction } from '@/features/sessions/StudySubjectInformation';
import { useTheme } from '@/ui/theme/ThemeProvider';

export default function ReviewSessionRoute() {
  const router = useRouter();
  const { db } = useAppServices();
  const theme = useTheme();
  const repository = useMemo(() => new ReviewSessionRepository(db), [db]);
  const [snapshot, setSnapshot] = useState<ReviewSessionSnapshot | null>(null);
  const [subjects, setSubjects] = useState<readonly SubjectResource[] | null>(
    null,
  );
  const [settings, setSettings] = useState<StudySettings | null>(null);
  const [materials, setMaterials] = useState<
    Readonly<Record<number, SubjectStudyMaterial>>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      const preferences = await loadStudySettings(db);
      const existing = await repository.loadReviewSession();
      let loaded =
        existing === null
          ? await startReviewSession(db)
          : await repository.revalidateReviewSession(
              existing,
              new Date(),
              preferences.questionOrder,
            );
      if (loaded !== null && loaded.items.length === 0) {
        await repository.clearReviewSession();
        loaded = await startReviewSession(db);
      }
      if (!active) return;
      if (loaded === null) {
        router.replace('/');
        return;
      }
      const loadedSubjects = await repository.loadReviewSubjects(loaded);
      const reconciled = reconcileReviewSession(loaded, loadedSubjects);
      if (reconciled === null && loaded.phase !== 'complete') {
        await repository.clearReviewSession();
        router.replace('/');
        return;
      }
      const restored =
        reconciled === null
          ? loaded
          : reconciled === loaded
            ? loaded
            : await repository.saveReviewSession(reconciled);
      const studyMaterials = await loadStudyMaterials(
        db,
        loadedSubjects.map(({ id }) => id),
      );
      if (active) {
        setSnapshot(restored);
        setSubjects(loadedSubjects);
        setSettings(preferences);
        setMaterials(studyMaterials);
      }
    })().catch(() => {
      if (active) setError('Unable to restore this review session.');
    });
    return () => {
      active = false;
    };
  }, [db, repository, router, attempt]);
  if (snapshot === null || subjects === null || settings === null)
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          padding: 24,
          gap: 16,
          backgroundColor: theme.colors.canvas,
        }}
      >
        {error === null ? (
          <ActivityIndicator accessibilityLabel="Restoring review session" />
        ) : (
          <>
            <Text
              accessibilityRole="alert"
              style={{ color: theme.colors.danger }}
            >
              {error}
            </Text>
            <StudyAction
              label="Try again"
              onPress={() => {
                setError(null);
                setAttempt((value) => value + 1);
              }}
            />
            <StudyAction
              label="Return home"
              onPress={() => router.replace('/')}
            />
          </>
        )}
      </View>
    );
  return (
    <>
      <ReviewSessionScreen
        key={`${snapshot.updatedAt}-${attempt}`}
        initialSnapshot={snapshot}
        subjects={subjects}
        onOpenSubject={(id) => router.push(`/subject/${id}`)}
        settings={settings}
        studyMaterials={materials}
        onSettings={() => setSettingsOpen(true)}
        onReload={async () => {
          setSnapshot(null);
          setError(null);
          setAttempt((value) => value + 1);
        }}
        onAddSynonym={async (subjectId, synonym) => {
          await addStudySynonym(db, subjectId, synonym);
          setMaterials(
            await loadStudyMaterials(
              db,
              subjects.map(({ id }) => id),
            ),
          );
        }}
        onCommitTransition={async (transition) => {
          await repository.commitReviewTransition(
            transition.completedItem,
            transition.snapshot,
          );
        }}
        onExit={() => router.replace('/')}
        onFinish={async () => {
          await repository.clearReviewSession();
          router.replace('/');
        }}
      />
      <Modal
        visible={settingsOpen}
        animationType="slide"
        onRequestClose={() => setSettingsOpen(false)}
      >
        {settingsOpen ? (
          <StudySettingsContainer
            onClose={() => setSettingsOpen(false)}
            onSaved={setSettings}
          />
        ) : null}
      </Modal>
    </>
  );
}
