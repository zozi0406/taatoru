import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/ui/theme/ThemeProvider';

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
  const theme = useTheme();
  const submit = requiresAccountChange ? onChangeAccount : onLogin;

  return (
    <SafeAreaView
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
          Sign in to Taatoru
        </Text>
        <Text
          style={[
            styles.body,
            { color: theme.colors.textMuted },
          ]}
        >
          Paste a personal access token from your WaniKani account.
        </Text>
        <TextInput
          accessibilityLabel="WaniKani API token"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          onChangeText={setToken}
          placeholder="API token"
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
              {requiresAccountChange ? 'Replace account' : 'Sign in'}
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: {
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 20,
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
  screen: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
});
