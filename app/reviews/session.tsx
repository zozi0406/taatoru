import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import type { SubjectResource } from '@/api/types';
import { useAppServices } from '@/app/AppProviders';
import {
  ReviewSessionRepository,
  type ReviewSessionSnapshot,
} from '@/features/reviews/ReviewSessionRepository';
import { ReviewSessionScreen } from '@/features/reviews/ReviewSessionScreen';
import { startReviewSession } from '@/features/reviews/reviewLauncher';
import { reconcileReviewSession } from '@/features/sessions/sessionSubjects';
import { useTheme } from '@/ui/theme/ThemeProvider';

export default function ReviewSessionRoute() {
  const router = useRouter();
  const { db } = useAppServices();
  const theme = useTheme();
  const repository = useMemo(
    () => new ReviewSessionRepository(db),
    [db],
  );
  const [snapshot, setSnapshot] =
    useState<ReviewSessionSnapshot | null>(null);
  const [subjects, setSubjects] =
    useState<readonly SubjectResource[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const existing = await repository.loadReviewSession();
      if (existing !== null) {
        const existingSubjects = await repository.loadReviewSubjects(existing);
        const reconciled = reconcileReviewSession(existing, existingSubjects);
        if (reconciled !== null) {
          const restored =
            reconciled === existing
              ? existing
              : await repository.saveReviewSession(reconciled);
          if (active) {
            setSnapshot(restored);
            setSubjects(existingSubjects);
          }
          return;
        }
        await repository.clearReviewSession();
      }

      const loaded = await startReviewSession(db);
      if (loaded === null) {
        router.replace('/');
        return;
      }
      const loadedSubjects = await repository.loadReviewSubjects(loaded);
      const reconciled = reconcileReviewSession(loaded, loadedSubjects);
      if (reconciled === null) {
        await repository.clearReviewSession();
        router.replace('/');
        return;
      }
      const restored =
        reconciled === loaded
          ? loaded
          : await repository.saveReviewSession(reconciled);
      if (active) {
        setSnapshot(restored);
        setSubjects(loadedSubjects);
      }
    })().catch(() => {
      if (active) setError('Unable to restore this review session.');
    });
    return () => {
      active = false;
    };
  }, [db, repository, router]);

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
          <ActivityIndicator accessibilityLabel="Restoring review session" />
        ) : (
          <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
            {error}
          </Text>
        )}
      </View>
    );
  }

  return (
    <ReviewSessionScreen
      initialSnapshot={snapshot}
      onCommitTransition={(transition) =>
        repository
          .commitReviewTransition(
            transition.completedItem,
            transition.snapshot,
          )
          .then(() => undefined)
      }
      onExit={() => router.replace('/')}
      onFinish={async () => {
        await repository.clearReviewSession();
        router.replace('/');
      }}
      subjects={subjects}
    />
  );
}
