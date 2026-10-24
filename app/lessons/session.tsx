import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Text, View } from 'react-native';

import type { SubjectResource } from '@/api/types';
import { useAppServices } from '@/app/AppProviders';
import { LessonSessionScreen } from '@/features/lessons/LessonSessionScreen';
import {
  type LessonSessionSnapshot,
  SessionRepository,
} from '@/features/sessions/SessionRepository';
import { reconcileLessonSession } from '@/features/sessions/sessionSubjects';
import {
  loadStudySettings,
  type StudySettings,
} from '@/features/settings/studySettings';
import { StudySettingsContainer } from '@/features/settings/StudySettingsContainer';
import {
  addStudySynonym,
  loadStudyMaterials,
} from '@/features/sessions/studyMaterials';
import type { SubjectStudyMaterial } from '@/features/subjects/subjectDetails';
import { useTheme } from '@/ui/theme/ThemeProvider';

export default function LessonSessionRoute() {
  const router = useRouter();
  const { db } = useAppServices();
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

  useEffect(() => {
    let active = true;
    void sessions
      .loadLessonSession()
      .then(async (loaded) => {
        if (loaded === null || loaded.phase === 'selection') {
          router.replace('/lessons/picker');
          return;
        }
        const preferences = await loadStudySettings(db);
        const loadedSubjects = await sessions.loadLessonSubjects(loaded);
        const reconciled = reconcileLessonSession(loaded, loadedSubjects);
        if (reconciled === null) {
          await sessions.clearLessonSession();
          router.replace('/lessons/picker');
          return;
        }
        const restored =
          reconciled === loaded
            ? loaded
            : await sessions.saveLessonSession(reconciled);
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
  }, [db, router, sessions]);

  if (snapshot === null || subjects === null || settings === null) {
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
          <Text
            accessibilityRole="alert"
            style={{ color: theme.colors.danger }}
          >
            {error}
          </Text>
        )}
      </View>
    );
  }

  return (
    <>
      <LessonSessionScreen
        onOpenSubject={(id) => router.push(`/subject/${id}`)}
        settings={settings}
        studyMaterials={materials}
        onSettings={() => setSettingsOpen(true)}
        onAddSynonym={async (subjectId, synonym) => {
          await addStudySynonym(db, subjectId, synonym);
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
            .then(() => undefined)
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
