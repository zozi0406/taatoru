import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppProviders } from '@/app/AppProviders';
import { useAuth } from '@/features/auth/AuthProvider';
import { ThemeProvider } from '@/ui/theme/ThemeProvider';

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
  if (auth.status === 'bootstrapping') {
    return null;
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Protected guard={auth.status === 'authenticated'}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="subject/[id]" />
        </Stack.Protected>
        <Stack.Protected guard={auth.status === 'unauthenticated'}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}
