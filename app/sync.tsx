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
  const router = useRouter(); const theme = useTheme(); const padding = useScreenPadding();
  const [changes, setChanges] = useState<readonly SavedChange[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => new SyncAttentionRepository(services.db).list().then(setChanges), [services.db]);
  useEffect(() => { void reload().catch(() => setError('Unable to load saved changes.')); }, [reload]);
  const resolve = async (change: SavedChange, choice: 'retry' | 'discard' | 'keep-local' | 'use-remote' | 'recover') => {
    if (busy) return; setBusy(true); setError(null);
    try { await new SyncAttentionRepository(services.db).resolve(change, choice); services.notifyPendingWrites(); await reload(); }
    catch { setError('This change could not be resolved. Reload and try again.'); }
    finally { setBusy(false); }
  };
  return <ScrollView style={{ flex: 1, backgroundColor: theme.colors.canvas }} contentContainerStyle={{ ...padding, gap: 20 }}>
    <StudyAction label="Back" onPress={() => router.back()} />
    <Text accessibilityRole="header" style={[theme.typography.screenTitle, { color: theme.colors.text }]}>Saved changes</Text>
    <Text style={{ color: theme.colors.textMuted }}>Your work stays on this device until WaniKani confirms it. A reset, changed review opportunity, or conflicting note can require a decision.</Text>
    <StudyAction label="Reconnect API token" onPress={auth.repairCredentials} />
    {error === null ? null : <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{error}</Text>}
    {changes.length === 0 ? <Text style={{ color: theme.colors.text }}>No changes waiting to upload.</Text> : null}
    {changes.map((change) => <View key={change.operationKey} style={{ padding: 16, gap: 12, borderRadius: 16, backgroundColor: theme.colors.surfaceMuted }}>
      <Text style={[theme.typography.label, { color: theme.colors.text }]}>{change.title} · {change.kind === 'progress' ? 'Study progress' : 'Notes and synonyms'}</Text>
      <Text style={{ color: theme.colors.textMuted }}>{change.state === 'rejected' ? 'Needs a decision' : change.state === 'uncertain' ? 'Waiting for verification' : 'Waiting to upload'}{change.reason === 'opportunity-changed' || change.reason === 'account-reset' ? '. The original review opportunity has changed.' : ''}</Text>
      {change.kind === 'history' ? <>
        <Text selectable style={{ color: theme.colors.text }}>An older upload may have arrived after a newer one. These are your preserved newer values:</Text>
        <Text selectable style={{ color: theme.colors.text }}>{savedMaterialText(change.conflictJson)}</Text>
        <StudyAction disabled={busy} label="Restore saved version for verification" onPress={() => { void resolve(change, 'recover'); }} />
        <StudyAction disabled={busy} label="Discard saved upload history" onPress={() => Alert.alert('Discard saved version?', 'This removes the preserved local upload history. It cannot undo a request WaniKani already received.', [
          { text: 'Cancel', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => { void resolve(change, 'discard'); } }])} />
      </> : <>
        {change.reason === 'material-conflict' ? <>
          <Text selectable style={{ color: theme.colors.text }}>{conflictText(change.conflictJson)}</Text>
          <StudyAction disabled={busy} label="Keep my saved version" onPress={() => { void resolve(change, 'keep-local'); }} />
          <StudyAction disabled={busy} label="Use observed WaniKani version" onPress={() => Alert.alert('Use WaniKani version?', 'Your conflicting local note and synonym edits will be discarded.', [
            { text: 'Cancel', style: 'cancel' }, { text: 'Use WaniKani version', style: 'destructive', onPress: () => { void resolve(change, 'use-remote'); } }])} />
        </> : <StudyAction disabled={busy} label="Verify and retry" onPress={() => { void resolve(change, 'retry'); }} />}
        <StudyAction disabled={busy} label="Discard this local change" onPress={() => Alert.alert('Discard saved change?', 'This removes only the saved change on this device. It cannot undo a change WaniKani has already accepted.', [
          { text: 'Keep change', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => { void resolve(change, 'discard'); } }])} />
      </>}
    </View>)}
    <StudyAction disabled={busy} label="Reload saved changes" onPress={() => { void reload(); }} />
  </ScrollView>;
}

function savedMaterialText(json: string | null): string {
  try { const value = JSON.parse(json ?? '') as { meaningNote: string | null; readingNote: string | null; meaningSynonyms: readonly string[] };
    return `Meaning note: ${value.meaningNote ?? '(empty)'}\nReading note: ${value.readingNote ?? '(empty)'}\nSynonyms: ${value.meaningSynonyms.join(', ')}`;
  } catch { return 'The saved version needs to be inspected before another upload.'; }
}
function conflictText(json: string | null): string {
  try { const conflict = JSON.parse(json ?? '') as { local: object; remote: { data: { meaning_note: string | null; reading_note: string | null; meaning_synonyms: readonly string[] } } | null };
    return `Saved on this device\n${savedMaterialText(JSON.stringify(conflict.local))}\n\nObserved on WaniKani\n${savedMaterialText(JSON.stringify({ meaningNote: conflict.remote?.data.meaning_note ?? null,
      readingNote: conflict.remote?.data.reading_note ?? null, meaningSynonyms: conflict.remote?.data.meaning_synonyms ?? [] }))}`;
  } catch { return 'Both versions are preserved. Reload before resolving.'; }
}
