import { useState } from 'react';
import * as Linking from 'expo-linking';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useTheme } from '@/ui/theme/ThemeProvider';

export const WANIKANI_TOKEN_URL =
  'https://www.wanikani.com/settings/personal_access_tokens';

interface LoginScreenProps {
  readonly busy: boolean;
  readonly error: string | null;
  readonly requiresAccountChange: boolean;
  readonly onLogin: (token: string) => Promise<void>;
  readonly onChangeAccount: (token: string) => Promise<void>;
}

export function LoginScreen({
  busy,
  error,
  requiresAccountChange,
  onLogin,
  onChangeAccount,
}: LoginScreenProps) {
  const [token, setToken] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const theme = useTheme();
  const submit = requiresAccountChange ? onChangeAccount : onLogin;
  const openTokenPage = async () => {
    setLinkError(null);
    try {
      await Linking.openURL(WANIKANI_TOKEN_URL);
    } catch {
      setLinkError(
        `Couldn't open WaniKani. Visit ${WANIKANI_TOKEN_URL} in your browser.`,
      );
    }
  };

  return (
    <ScrollView
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={styles.screenContent}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      testID="login-screen"
      style={[
        styles.screen,
        { backgroundColor: theme.colors.canvas },
      ]}
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <Text
          accessibilityRole="header"
          style={[
            styles.title,
            { color: theme.colors.text },
          ]}
        >
          Connect WaniKani
        </Text>
        <Text
          selectable
          style={[
            styles.body,
            { color: theme.colors.textMuted },
          ]}
        >
          Taatoru connects through a personal access token, so it never sees
          your WaniKani password.
        </Text>
        <View style={styles.linkSection}>
          <Pressable
            accessibilityLabel="Open WaniKani API Tokens"
            accessibilityRole="link"
            onPress={() => void openTokenPage()}
            style={({ pressed }) => [
              styles.tokenLink,
              { backgroundColor: theme.colors.accent },
              pressed && styles.buttonPressed,
            ]}
          >
            <Text
              style={[
                styles.buttonText,
                { color: theme.colors.accentForeground },
              ]}
            >
              Open WaniKani API Tokens
            </Text>
          </Pressable>
          {linkError === null ? null : (
            <Text
              accessibilityRole="alert"
              selectable
              style={[
                styles.linkError,
                { color: theme.colors.danger },
              ]}
            >
              {linkError}
            </Text>
          )}
        </View>
        <View style={styles.instructions}>
          <Text
            accessibilityRole="header"
            style={[
              styles.sectionTitle,
              { color: theme.colors.text },
            ]}
          >
            How to connect
          </Text>
          <Text selectable style={[styles.step, { color: theme.colors.text }]}>
            1. Sign in to WaniKani in the page that opens.
          </Text>
          <Text selectable style={[styles.step, { color: theme.colors.text }]}>
            2. Create a token named Taatoru. Allow starting assignments,
            creating reviews, and creating or updating study materials.
          </Text>
          <Text selectable style={[styles.step, { color: theme.colors.text }]}>
            3. Copy the token, return here, and paste it below.
          </Text>
        </View>
        <View
          style={[
            styles.divider,
            { backgroundColor: theme.colors.border },
          ]}
        />
        <Text
          style={[
            styles.inputLabel,
            { color: theme.colors.text },
          ]}
        >
          Personal access token
        </Text>
        <TextInput
          accessibilityLabel="WaniKani API token"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          onChangeText={setToken}
          placeholder="Paste token here"
          placeholderTextColor={theme.colors.textMuted}
          secureTextEntry
          style={[
            styles.input,
            {
              borderColor: theme.colors.border,
              color: theme.colors.text,
            },
          ]}
          value={token}
        />
        <Text
          selectable
          style={[
            styles.securityNote,
            { color: theme.colors.textMuted },
          ]}
        >
          Your token is stored securely on this device. You can revoke it from
          WaniKani at any time.
        </Text>
        {error === null ? null : (
          <Text
            accessibilityRole="alert"
            selectable
            style={[
              styles.error,
              { color: theme.colors.danger },
            ]}
          >
            {error}
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void submit(token)}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: theme.colors.accent },
            (pressed || busy) && styles.buttonPressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={theme.colors.accentForeground} />
          ) : (
            <Text
              style={[
                styles.buttonText,
                { color: theme.colors.accentForeground },
              ]}
            >
              {requiresAccountChange ? 'Replace account' : 'Connect account'}
            </Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: {
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 16,
  },
  button: {
    alignItems: 'center',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonPressed: {
    opacity: 0.65,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  card: {
    borderCurve: 'continuous',
    borderWidth: 1,
    borderRadius: 18,
    padding: 24,
    width: '100%',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: 20,
  },
  error: {
    marginBottom: 12,
  },
  input: {
    borderCurve: 'continuous',
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 16,
    marginBottom: 12,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  inputLabel: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  instructions: {
    gap: 10,
    marginBottom: 20,
  },
  linkError: {
    fontSize: 14,
    lineHeight: 20,
  },
  linkSection: {
    gap: 12,
    marginBottom: 24,
  },
  screen: {
    flex: 1,
  },
  screenContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  securityNote: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  step: {
    fontSize: 15,
    lineHeight: 22,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  tokenLink: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
  },
});
