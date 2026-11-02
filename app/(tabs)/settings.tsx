import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StudySettingsContainer } from '@/features/settings/StudySettingsContainer';

export default function SettingsScreen() {
  const [visit, setVisit] = useState(0);
  // Refresh saved preferences on focus while retaining an unsaved draft.
  useFocusEffect(
    useCallback(() => {
      setVisit((value) => value + 1);
    }, []),
  );
  return <StudySettingsContainer refreshKey={visit} />;
}
