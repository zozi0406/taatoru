import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StudySettingsContainer } from '@/features/settings/StudySettingsContainer';

export default function SettingsScreen() {
  const [visit, setVisit] = useState(0);
  // Native tabs retain their screens; discard a draft when returning from study.
  useFocusEffect(
    useCallback(() => {
      setVisit((value) => value + 1);
    }, []),
  );
  return <StudySettingsContainer key={visit} />;
}
