import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { useAppServices } from '@/app/AppProviders';
import { HomeScreen } from '@/features/home/HomeScreen';
import { getDashboardSnapshot } from '@/features/home/dashboard';
import { startAutomaticLessons } from '@/features/lessons/lessonLauncher';
import { useAuth } from '@/features/auth/AuthProvider';

export default function HomeRoute() {
  const services = useAppServices();
  const auth = useAuth();
  const router = useRouter();
  const loadSnapshot = useCallback(async () => {
    const online = await services.isOnline();
    return getDashboardSnapshot(services.db, new Date(), online);
  }, [services]);

  return (
    <HomeScreen
      loadSnapshot={loadSnapshot}
      onPickLessons={() => router.push('/lessons/picker')}
      onStartLessons={() => {
        void startAutomaticLessons(services.db)
          .then((session) => {
            if (session !== null) router.push('/lessons/session');
          })
          .catch(() => {
            // The dashboard still reflects the unchanged local lesson state.
          });
      }}
      onStartReviews={() => router.push('/reviews/session')}
      synchronize={services.synchronize}
      syncStore={services.syncStore}
      subscribeToData={services.subscribeToData}
      onSyncAttention={() => router.push('/sync')}
      onSignOut={() => { void auth.logout(); }}
    />
  );
}
