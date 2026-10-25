// Separate Metro entry for fixture QA. Never imported by the production router.
import { registerRootComponent } from 'expo';
import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/ui/theme/ThemeProvider';
import { StudyAction } from '@/features/sessions/StudySubjectInformation';
import { runNativeScenarios, persistOfflineFixture, recoverOfflineFixture } from './nativeScenarios';
import { NativeStudyApp } from './NativeStudyApp';

function FixtureApp() {
  const [lines, setLines] = useState<readonly string[]>(['Fixture runner ready']);
  const [busy, setBusy] = useState(false);
  const [study, setStudy] = useState(false);
  const run = async (operation: () => Promise<void>) => {
    if (busy) return; setBusy(true);
    try { await operation(); setLines((previous) => [...previous, 'DONE']); }
    catch (error) { setLines((previous) => [...previous, String(error)]); }
    finally { setBusy(false); }
  };
  return <SafeAreaProvider><ThemeProvider>{study ? <NativeStudyApp onBack={() => setStudy(false)} /> : <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 60, gap: 16 }}>
    <Text accessibilityRole="header">Taatoru sync fixtures</Text>
    <StudyAction label="Run native fault checks" disabled={busy} onPress={() => { void run(() => runNativeScenarios((line) => setLines((previous) => [...previous, line]))); }} />
    <StudyAction label="Persist offline completion" disabled={busy} onPress={() => { void run(persistOfflineFixture); }} />
    <StudyAction label="Recover after force-stop" disabled={busy} onPress={() => { void run(recoverOfflineFixture); }} />
    <StudyAction label="Open fixture study UI" disabled={busy} onPress={() => setStudy(true)} />
    {lines.map((line, index) => <Text selectable key={index}>{line}</Text>)}
  </ScrollView>}</ThemeProvider></SafeAreaProvider>;
}
registerRootComponent(FixtureApp);
