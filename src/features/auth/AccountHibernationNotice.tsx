import { useState } from 'react';
import * as Linking from 'expo-linking';
import { ExternalLink } from 'lucide-react-native';
import { Pressable, Text } from 'react-native';

import { Card } from '@/ui/components/Card';
import { minimumTouchTarget } from '@/ui/theme/spacing';
import { useTheme } from '@/ui/theme/ThemeProvider';

export const WANIKANI_ACCOUNT_URL = 'https://www.wanikani.com/';
export const HIBERNATION_SYNC_DETAIL = 'Sign in on WaniKani, then retry sync.';

/** Auth screens receive display messages rather than the original API error. */
export function isHibernationMessage(message: string | null): boolean {
  return message !== null && /\bhibernat(?:ing|ion)\b/i.test(message);
}

export function AccountHibernationNotice({
  onRetry,
}: {
  readonly onRetry?: () => void;
}) {
  const theme = useTheme();
  const [linkError, setLinkError] = useState(false);
  const openAccount = async () => {
    setLinkError(false);
    try {
      await Linking.openURL(WANIKANI_ACCOUNT_URL);
    } catch {
      setLinkError(true);
    }
  };
  return (
    <Card
      style={{
        backgroundColor: theme.colors.accentSurface,
        borderColor: theme.colors.accent,
        gap: 12,
      }}
    >
      <Text
        accessibilityRole="header"
        style={[theme.typography.sectionTitle, { color: theme.colors.text }]}
      >
        WaniKani account needs attention
      </Text>
      <Text
        selectable
        style={[theme.typography.body, { color: theme.colors.text }]}
      >
        WaniKani reports account hibernation. Sign in on its website, then retry
        sync.
      </Text>
      <Text
        selectable
        style={[theme.typography.caption, { color: theme.colors.textMuted }]}
      >
        Already signed in? Check that your API token belongs to that account.
        Your local library stays on this device.
      </Text>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Open WaniKani"
        onPress={() => void openAccount()}
        style={({ pressed }) => ({
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 10,
          backgroundColor: theme.colors.accent,
          borderRadius: 12,
          minHeight: minimumTouchTarget,
          padding: 12,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text
          style={[
            theme.typography.label,
            { color: theme.colors.accentForeground },
          ]}
        >
          Open WaniKani
        </Text>
        <ExternalLink size={17} color={theme.colors.accentForeground} />
      </Pressable>
      {linkError ? (
        <Text
          accessibilityRole="alert"
          selectable
          style={[theme.typography.caption, { color: theme.colors.danger }]}
        >
          Could not open your browser. Visit {WANIKANI_ACCOUNT_URL} and sign in,
          then return to Taatoru.
        </Text>
      ) : null}
      {onRetry === undefined ? null : (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={({ pressed }) => ({
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: minimumTouchTarget,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.colors.accent,
            padding: 12,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text
            style={[theme.typography.label, { color: theme.colors.accent }]}
          >
            Try again
          </Text>
        </Pressable>
      )}
    </Card>
  );
}
