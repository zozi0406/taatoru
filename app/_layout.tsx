import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppProviders } from '@/app/AppProviders';
import { useAuth } from '@/features/auth/AuthProvider';

export default function RootLayout() {
  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
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
        <Stack.Protected guard={auth.status === 'authenticated'}>
          <Stack.Screen name="index" />
        </Stack.Protected>
        <Stack.Protected guard={auth.status === 'unauthenticated'}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}
