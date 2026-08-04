import { Redirect } from 'expo-router';

import { rootRouteForAuth } from '@/app/rootRoute';
import { useAuth } from '@/features/auth/AuthProvider';

export default function IndexRoute() {
  const auth = useAuth();
  const route = rootRouteForAuth(auth.status);
  return route === null ? null : <Redirect href={route} />;
}
