import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppServices } from '@/app/AppProviders';
import { StudyAction } from '@/features/sessions/StudySubjectInformation';
import { SyncAttentionRepository, type SavedChange } from '@/features/sync/SyncAttentionRepository';
import { useTheme } from '@/ui/theme/ThemeProvider';
import { useScreenPadding } from '@/ui/theme/useScreenPadding';
import { useAuth } from '@/features/auth/AuthProvider';

export default function SavedChangesRoute() {
  const services = useAppServices();
  const auth = useAuth();
  const subscribeToData = services.subscribeToData;
  const router = useRouter(); const theme = useTheme(); const padding = useScreenPadding();
  const [changes, setChanges] = useState<readonly SavedChange[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => new SyncAttentionRepository(services.db).list().then(setChanges), [services.db]);
  useEffect(() => { void reload().catch(() => setError('Unable to load saved changes.')); }, [reload]);
  useEffect(() => subscribeToData?.(() => { void reload().catch(() => {}); }), [subscribeToData, reload]);
  const resolve = async (change: SavedChange, choice: 'retry' | 'discard' | 'use-remote') => {
    if (busy) return; setBusy(true); setError(null);
    try { await new SyncAttentionRepository(services.db).resolve(change, choice); services.notifyPendingWrites(); await reload(); }
    catch { setError('This change could not be resolved. Reload and try again.'); }
    finally { setBusy(false); }
  };
  return <ScrollView style={{ flex: 1, backgroundColor: theme.colors.canvas }} contentContainerStyle={{ ...padding, gap: 20 }}>
    <StudyAction label="Back" onPress={() => router.back()} />
    <Text accessibilityRole="header" style={[theme.typography.screenTitle, { color: theme.colors.text }]}>Saved changes</Text>
    <Text style={{ color: theme.colors.textMuted }}>Reviews stay saved until delivery is verified or you discard them. A reset or changed review opportunity can require attention. WaniKani is authoritative for notes and synonyms; material conflicts are resolved automatically.</Text>
    <StudyAction label="Reconnect API token" onPress={auth.repairCredentials} />
    {error === null ? null : <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{error}</Text>}
    {changes.length === 0 ? <Text style={{ color: theme.colors.text }}>No changes waiting to upload.</Text> : null}
    {changes.map((change) => <View key={change.operationKey} style={{ padding: 16, gap: 12, borderRadius: 16, backgroundColor: theme.colors.surfaceMuted }}>
      <Text style={[theme.typography.label, { color: theme.colors.text }]}>{change.title} · {change.kind === 'progress' ? 'Study progress' : 'Notes and synonyms'}</Text>
      <Text style={{ color: theme.colors.textMuted }}>{change.state === 'rejected' ? 'Needs attention' : change.state === 'uncertain' ? 'Waiting for verification' : 'Waiting to upload'}{change.reason === 'opportunity-changed' || change.reason === 'account-reset' ? '. The original review opportunity has changed.' : ''}</Text>
      {change.kind === 'history' ? <>
        <Text style={{ color: theme.colors.text }}>Waiting to verify notes and synonyms against WaniKani. The API version takes precedence.</Text>
        <StudyAction disabled={busy} label="Verify WaniKani materials" onPress={() => { void resolve(change, 'retry'); }} />
      </> : change.reason === 'review-conflict' ? <>
        <Text style={{ color: theme.colors.text }}>WaniKani shows a review completed elsewhere while this review was saved offline. Choose whether to keep the saved review here or use WaniKani progress.</Text>
        <Text selectable style={{ color: theme.colors.text }}>Meaning mistakes: {change.incorrectMeaningAnswers ?? 0} · Reading mistakes: {change.incorrectReadingAnswers ?? 0}</Text>
        <Text style={{ color: theme.colors.textMuted }}>Keeping it preserves your counts on this device. The API cannot replace an accepted review, and these answers will not be submitted as a later review.</Text>
        <StudyAction disabled={busy} label="Keep saved review on this device" onPress={() => router.back()} />
        <StudyAction disabled={busy} label="Use WaniKani progress" onPress={() => Alert.alert('Use WaniKani progress?', 'This discards the saved offline review counts and uses the observed server progress.', [
          { text: 'Keep saved review', style: 'cancel' },
          { text: 'Use WaniKani progress', style: 'destructive', onPress: () => { void resolve(change, 'use-remote'); } },
        ])} />
      </> : <>
        <StudyAction disabled={busy} label="Verify and retry" onPress={() => { void resolve(change, 'retry'); }} />
        <StudyAction disabled={busy} label="Discard this local change" onPress={() => Alert.alert('Discard saved change?', 'This removes only the saved change on this device. It cannot undo a change WaniKani has already accepted.', [
          { text: 'Keep change', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => { void resolve(change, 'discard'); } }])} />
      </>}
    </View>)}
    <StudyAction disabled={busy} label="Reload saved changes" onPress={() => { void reload(); }} />
  </ScrollView>;
}
