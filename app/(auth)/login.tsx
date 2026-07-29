import { useAuth } from '@/features/auth/AuthProvider';
import { LoginScreen } from '@/features/auth/LoginScreen';

export default function LoginRoute() {
  const auth = useAuth();
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
