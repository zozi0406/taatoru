import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import type { SubjectResource } from '@/api/types';
import { useAppServices } from '@/app/AppProviders';
import { LessonSessionScreen } from '@/features/lessons/LessonSessionScreen';
import {
  type LessonSessionSnapshot,
  SessionRepository,
} from '@/features/sessions/SessionRepository';
import { PendingWriteRepository } from '@/features/sync/PendingWriteRepository';
import { useTheme } from '@/ui/theme/ThemeProvider';

export default function LessonSessionRoute() {
  const router = useRouter();
  const { db } = useAppServices();
  const theme = useTheme();
  const sessions = useMemo(() => new SessionRepository(db), [db]);
  const pendingWrites = useMemo(
    () => new PendingWriteRepository(db),
    [db],
  );
  const [snapshot, setSnapshot] =
    useState<LessonSessionSnapshot | null>(null);
  const [subjects, setSubjects] =
    useState<readonly SubjectResource[] | null>(null);
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
        const loadedSubjects = await sessions.loadLessonSubjects(loaded);
        if (active) {
          setSnapshot(loaded);
          setSubjects(loadedSubjects);
        }
      })
      .catch(() => {
        if (active) setError('Unable to restore this lesson session.');
      });
    return () => {
      active = false;
    };
  }, [router, sessions]);

  if (snapshot === null || subjects === null) {
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
          <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
            {error}
          </Text>
        )}
      </View>
    );
  }

  return (
    <LessonSessionScreen
      initialSnapshot={snapshot}
      onCompleteLesson={(item) =>
        pendingWrites.completeLesson({
          ...item,
          completedAt: new Date(),
        })
      }
      onExit={() => router.replace('/')}
      onFinish={async () => {
        await sessions.clearLessonSession();
        router.replace('/');
      }}
      onSaveSnapshot={(next) =>
        sessions.saveLessonSession(next).then(() => undefined)
      }
      subjects={subjects}
    />
  );
}
