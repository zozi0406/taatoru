import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { useAppServices } from '@/app/AppProviders';
import {
  SubjectDetailsScreen,
  type StudyMaterialDraft,
} from '@/features/subjects/SubjectDetailsScreen';
import {
  loadSubjectDetails,
  type SubjectDetailsSnapshot,
} from '@/features/subjects/subjectDetails';
import { PendingWriteRepository } from '@/features/sync/PendingWriteRepository';
import { minimumTouchTarget } from '@/ui/theme/spacing';
import { useTheme } from '@/ui/theme/ThemeProvider';

export default function SubjectDetailsRoute() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const services = useAppServices();
  const subjectId = parseSubjectId(id);
  const [details, setDetails] = useState<SubjectDetailsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (subjectId === null) {
      return;
    }
    void loadSubjectDetails(services.db, subjectId, {
      includeSimilarAboveLevel: false,
    })
      .then((loadedDetails) => {
        if (active) {
          setDetails(loadedDetails);
        }
      })
      .catch(() => {
        if (active) {
          setError('This subject is not available in the local library.');
        }
      });
    return () => {
      active = false;
    };
  }, [services.db, subjectId]);

  const openSubject = useCallback(
    (nextSubjectId: number) => {
      router.push({
        pathname: '/subject/[id]',
        params: { id: String(nextSubjectId) },
      });
    },
    [router],
  );
  const saveStudyMaterial = useCallback(
    async (material: StudyMaterialDraft) => {
      if (subjectId === null) {
        return;
      }
      await new PendingWriteRepository(services.db).queueStudyMaterial({
        subjectId,
        ...material,
        queuedAt: new Date(),
      });
    },
    [services.db, subjectId],
  );

  if (details === null) {
    const visibleError =
      subjectId === null ? 'This subject link is invalid.' : error;
    return (
      <View
        style={{
          backgroundColor: theme.colors.canvas,
          flex: 1,
          gap: theme.spacing.lg,
          justifyContent: 'center',
          padding: theme.spacing.xl,
        }}
      >
        <Pressable
          accessibilityLabel="Back"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={{
            alignItems: 'center',
            alignSelf: 'flex-start',
            justifyContent: 'center',
            minHeight: minimumTouchTarget,
            minWidth: minimumTouchTarget,
          }}
        >
          <Text style={[theme.typography.label, { color: theme.colors.accent }]}>
            Back
          </Text>
        </Pressable>
        {visibleError === null ? (
          <ActivityIndicator accessibilityLabel="Loading subject" />
        ) : (
          <Text
            accessibilityRole="alert"
            selectable
            style={[theme.typography.body, { color: theme.colors.danger }]}
          >
            {visibleError}
          </Text>
        )}
      </View>
    );
  }

  return (
    <SubjectDetailsScreen
      details={details}
      onBack={() => router.back()}
      onOpenSubject={openSubject}
      onSaveStudyMaterial={saveStudyMaterial}
    />
  );
}

function parseSubjectId(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || !/^\d+$/.test(raw)) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
