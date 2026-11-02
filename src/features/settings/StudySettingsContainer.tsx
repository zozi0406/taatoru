import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useAppServices } from '@/app/AppProviders';
import { useTheme } from '@/ui/theme/ThemeProvider';
import { StudySettingsScreen } from './StudySettingsScreen';
import {
  loadStudySettings,
  saveStudySettings,
  type StudySettings,
} from './studySettings';
import { StudyAction } from '@/features/sessions/StudySubjectInformation';

export function StudySettingsContainer({
  onClose,
  onSaved,
  closeRequest,
  refreshKey,
}: {
  readonly closeRequest?: number;
  readonly refreshKey?: number;
  readonly onClose?: () => void;
  readonly onSaved?: (settings: StudySettings) => void;
}) {
  const dirty = useRef(false);
  const { db } = useAppServices();
  const theme = useTheme();
  const [settings, setSettings] = useState<StudySettings | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void loadStudySettings(db)
      .then((loaded) => {
        if (active && !dirty.current) setSettings(loaded);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [db, attempt, refreshKey]);
  if (settings === null)
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
              Unable to load settings.
            </Text>
            <StudyAction
              label="Try again"
              onPress={() => {
                setError(false);
                setAttempt((value) => value + 1);
              }}
            />
          </>
        ) : (
          <ActivityIndicator accessibilityLabel="Loading study settings" />
        )}
        {onClose === undefined ? null : (
          <StudyAction label="Back to study" onPress={onClose} />
        )}
      </View>
    );
  return (
    <StudySettingsScreen
      settings={settings}
      closeRequest={closeRequest}
      onDirtyChange={(value) => { dirty.current = value; }}
      onClose={onClose}
      onSave={async (next) => {
        await saveStudySettings(db, next);
        setSettings(next);
        onSaved?.(next);
      }}
    />
  );
}
