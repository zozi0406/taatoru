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
  const submit = requiresAccountChange ? onChangeAccount : onLogin;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>
          Sign in to Taatoru
        </Text>
        <Text style={styles.body}>
          Paste a personal access token from your WaniKani account.
        </Text>
        <TextInput
          accessibilityLabel="WaniKani API token"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          onChangeText={setToken}
          placeholder="API token"
          secureTextEntry
          style={styles.input}
          value={token}
        />
        {error === null ? null : (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void submit(token)}
          style={({ pressed }) => [
            styles.button,
            (pressed || busy) && styles.buttonPressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>
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
    color: '#56606C',
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 20,
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonPressed: {
    opacity: 0.65,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
    width: '100%',
  },
  error: {
    color: '#B42318',
    marginBottom: 12,
  },
  input: {
    borderColor: '#CBD2DA',
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 16,
    marginBottom: 12,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  screen: {
    backgroundColor: '#F4F6F8',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: '#17202A',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
});
