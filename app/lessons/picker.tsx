import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useAppServices } from '@/app/AppProviders';
import {
  LessonPickerScreen,
  loadLessonPickerItems,
} from '@/features/lessons/LessonPickerScreen';
import { SessionRepository } from '@/features/sessions/SessionRepository';
import { useTheme } from '@/ui/theme/ThemeProvider';

export default function LessonPickerRoute() {
  const router = useRouter();
  const { db } = useAppServices();
  const theme = useTheme();
  const repository = useMemo(() => new SessionRepository(db), [db]);
  const [restoredIds, setRestoredIds] =
    useState<readonly number[] | null>(null);
  useEffect(() => {
    let active = true;
    void repository
      .loadLessonSession()
      .then((snapshot) => {
        if (!active) return;
        if (snapshot !== null && snapshot.phase !== 'selection') {
          router.back();
          return;
        }
        setRestoredIds(
          snapshot?.items.map(({ subjectId }) => subjectId) ?? [],
        );
      })
      .catch(() => {
        if (active) setRestoredIds([]);
      });
    return () => {
      active = false;
    };
  }, [repository, router]);
  const loadCandidates = useCallback(
    () => loadLessonPickerItems(db),
    [db],
  );

  if (restoredIds === null) {
    return (
      <View
        style={{
          alignItems: 'center',
          backgroundColor: theme.colors.canvas,
          flex: 1,
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator accessibilityLabel="Restoring lesson selection" />
      </View>
    );
  }

  return (
    <LessonPickerScreen
      loadCandidates={loadCandidates}
      onBegin={async (items) => {
        await repository.startLessonSession(items);
        router.back();
      }}
      onCancel={() => {
        void repository.clearLessonSession().finally(() => router.back());
      }}
      onSelectionChange={(items) =>
        repository.saveLessonSelection(items).then(() => undefined)
      }
      restoredSelectedIds={restoredIds}
    />
  );
}
