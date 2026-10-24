import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppProviders } from '@/app/AppProviders';
import { useAuth } from '@/features/auth/AuthProvider';
import { ThemeProvider, useTheme } from '@/ui/theme/ThemeProvider';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AppProviders>
        <RootNavigator />
      </AppProviders>
    </ThemeProvider>
  );
}

function RootNavigator() {
  const auth = useAuth();
  const theme = useTheme();
  if (auth.status === 'bootstrapping') {
    return null;
  }

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.canvas },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Protected guard={auth.status === 'authenticated'}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="lessons/picker" />
          <Stack.Screen name="lessons/session" />
          <Stack.Screen name="reviews/session" />
          <Stack.Screen name="subject/[id]" />
        </Stack.Protected>
        <Stack.Protected guard={auth.status === 'unauthenticated'}>
          <Stack.Screen name="(auth)/login" />
        </Stack.Protected>
      </Stack>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
    </>
  );
}
