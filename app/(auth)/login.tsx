import { useAuth } from '@/features/auth/AuthProvider';
import { InitialSyncScreen } from '@/features/auth/InitialSyncScreen';
import { LoginScreen } from '@/features/auth/LoginScreen';

export default function LoginRoute() {
  const auth = useAuth();
  if (auth.initialSync !== null) {
    return (
      <InitialSyncScreen
        busy={auth.busy}
        state={auth.initialSync}
        onContinueInterrupted={auth.continueInterruptedSetup}
        onRetry={auth.retryInitialSync}
        onUseAnotherApiKey={auth.useAnotherApiKey}
        onUseDifferentToken={auth.useAnotherApiKey}
      />
    );
  }
  return (
    <LoginScreen
      busy={auth.busy}
      error={auth.error}
      requiresAccountChange={auth.requiresAccountChange}
      onLogin={auth.login}
      onChangeAccount={auth.changeAccount}
    />
  );
}
