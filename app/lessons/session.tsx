import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Text, View } from 'react-native';

import type { SubjectResource } from '@/api/types';
import { useAppServices } from '@/app/AppProviders';
import { LessonSessionScreen } from '@/features/lessons/LessonSessionScreen';
import {
  type LessonSessionSnapshot,
  SessionRepository,
} from '@/features/sessions/SessionRepository';
import { StudyAction } from '@/features/sessions/StudySubjectInformation';
import {
  loadStudySettings,
  type StudySettings,
} from '@/features/settings/studySettings';
import { StudySettingsContainer } from '@/features/settings/StudySettingsContainer';
import {
  addStudySynonym,
  loadStudyMaterials,
} from '@/features/sessions/studyMaterials';
import { useStudyMaterialRefresh } from '@/features/sessions/useStudyMaterialRefresh';
import type { SubjectStudyMaterial } from '@/features/subjects/subjectDetails';
import { useTheme } from '@/ui/theme/ThemeProvider';

export default function LessonSessionRoute() {
  const router = useRouter();
  const { db, notifyPendingWrites, subscribeToData } = useAppServices();
  const theme = useTheme();
  const sessions = useMemo(() => new SessionRepository(db), [db]);
  const [snapshot, setSnapshot] = useState<LessonSessionSnapshot | null>(null);
  const [subjects, setSubjects] = useState<readonly SubjectResource[] | null>(
    null,
  );
  const [settings, setSettings] = useState<StudySettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [materials, setMaterials] = useState<
    Readonly<Record<number, SubjectStudyMaterial>>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const reloadSession = () => {
    setSnapshot(null);
    setSubjects(null);
    setReload((value) => value + 1);
  };
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setReload((value) => value + 1);
    });
    return () => subscription.remove();
  }, []);

  useStudyMaterialRefresh(db, subjects, setMaterials, subscribeToData);
  useFocusEffect(useCallback(() => {
    let active = true;
    setError(null);
    void sessions
      .loadLessonSession()
      .then(async (loaded) => {
        if (loaded === null || loaded.phase === 'selection') {
          if (active) router.replace('/lessons/picker');
          return;
        }
        const preferences = await loadStudySettings(db);
        const restored = await sessions.revalidateLessonSession(
          loaded,
          new Date(),
          preferences.questionOrder,
        );
        if (restored.items.length === 0) {
          await sessions.clearLessonSession();
          if (active) router.replace('/lessons/picker');
          return;
        }
        const loadedSubjects = await sessions.loadLessonSubjects(restored);
        const studyMaterials = await loadStudyMaterials(
          db,
          loadedSubjects.map(({ id }) => id),
        );
        if (active) {
          setSettings(preferences);
          setMaterials(studyMaterials);
          setSnapshot(restored);
          setSubjects(loadedSubjects);
        }
      })
      .catch(() => {
        if (active) setError('Unable to restore this lesson session.');
      });
    return () => {
      active = false;
    };
  // A retry or foreground event explicitly requests a fresh restore.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, router, sessions, reload]));

  if (error !== null || snapshot === null || subjects === null || settings === null) {
    return (
      <View
        style={{
          alignItems: 'center',
          backgroundColor: theme.colors.canvas,
          flex: 1,
          justifyContent: 'center',
          padding: theme.spacing.xl,
        }}
      >
        {error === null ? (
          <ActivityIndicator accessibilityLabel="Restoring lesson session" />
        ) : (
          <>
            <Text
              accessibilityRole="alert"
              style={{ color: theme.colors.danger }}
            >
              {error}
            </Text>
            <StudyAction label="Retry restore" onPress={reloadSession} />
            <StudyAction label="Return home" onPress={() => router.replace('/')} />
          </>
        )}
      </View>
    );
  }

  return (
    <>
      <LessonSessionScreen
        key={JSON.stringify(snapshot)}
        onReload={reloadSession}
        onOpenSubject={(id) => router.push(`/subject/${id}`)}
        settings={settings}
        studyMaterials={materials}
        onSettings={() => setSettingsOpen(true)}
        onAddSynonym={async (subjectId, synonym) => {
          await addStudySynonym(db, subjectId, synonym);
          notifyPendingWrites();
          setMaterials(
            await loadStudyMaterials(
              db,
              subjects.map(({ id }) => id),
            ),
          );
        }}
        initialSnapshot={snapshot}
        onCommitTransition={(transition) =>
          sessions
            .commitLessonTransition(
              transition.completedItem,
              transition.snapshot,
            )
            .then(() => { notifyPendingWrites(); })
        }
        onExit={() => router.replace('/')}
        onFinish={async () => {
          await sessions.clearLessonSession();
          router.replace('/');
        }}
        subjects={subjects}
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
