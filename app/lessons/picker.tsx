import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useAppServices } from '@/app/AppProviders';
import {
  LessonPickerScreen,
  loadLessonPickerItems,
} from '@/features/lessons/LessonPickerScreen';
import { loadAutomaticLessonOptions } from '@/features/lessons/lessonLauncher';
import {
  buildAutomaticLessonQueue,
  type AutomaticLessonOptions,
} from '@/features/lessons/order';
import { SessionRepository } from '@/features/sessions/SessionRepository';
import { StudyAction } from '@/features/sessions/StudySubjectInformation';
import { useTheme } from '@/ui/theme/ThemeProvider';

export default function LessonPickerRoute() {
  const router = useRouter();
  const { db } = useAppServices();
  const theme = useTheme();
  const repository = useMemo(() => new SessionRepository(db), [db]);
  const [restoredIds, setRestoredIds] = useState<readonly number[] | null>(
    null,
  );
  const [options, setOptions] = useState<AutomaticLessonOptions | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void (async () => {
      const snapshot = await repository.loadLessonSession();
      if (!active) return;
      if (snapshot !== null && snapshot.phase !== 'selection') {
        router.replace('/lessons/session');
        return;
      }
      const preferences = await loadAutomaticLessonOptions(db);
      if (active) {
        setOptions(preferences);
        setRestoredIds(snapshot?.items.map(({ subjectId }) => subjectId) ?? []);
      }
    })().catch(() => {
      if (active) setError(true);
    });
    return () => {
      active = false;
    };
  }, [db, repository, router, attempt]);
  const loadCandidates = useCallback(() => loadLessonPickerItems(db), [db]);
  if (restoredIds === null || options === null)
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
        {error ? (
          <>
            <Text
              accessibilityRole="alert"
              style={{ color: theme.colors.danger }}
            >
              Unable to restore lesson selection.
            </Text>
            <StudyAction
              label="Try again"
              onPress={() => {
                setError(false);
                setAttempt((value) => value + 1);
              }}
            />
            <StudyAction
              label="Return home"
              onPress={() => router.replace('/')}
            />
          </>
        ) : (
          <ActivityIndicator accessibilityLabel="Restoring lesson selection" />
        )}
      </View>
    );
  const limit = Math.max(
    0,
    Math.min(
      options.batchSize,
      options.apprenticeLimit - options.apprenticeCount,
    ),
  );
  return (
    <LessonPickerScreen
      loadCandidates={loadCandidates}
      restoredSelectedIds={restoredIds}
      maxSelection={limit}
      selectionHint={
        limit === 0
          ? 'Your Apprentice limit has been reached. Adjust it in Settings to start more lessons.'
          : `Choose up to ${limit} subjects. Change your batch size in Settings.`
      }
      onBegin={async (items) => {
        const currentOptions = await loadAutomaticLessonOptions(db);
        const queue = buildAutomaticLessonQueue(items, {
          ...currentOptions,
          showKanaVocabulary: true,
        });
        if (queue.length !== items.length)
          throw new Error(
            'Lesson capacity changed. Return to the picker and try again.',
          );
        await repository.startLessonSession(queue);
        router.replace('/lessons/session');
      }}
      onCancel={async () => {
        await repository.clearLessonSelection();
        router.replace('/');
      }}
      onSelectionChange={async (items) => {
        await repository.saveLessonSelection(items);
      }}
    />
  );
}
