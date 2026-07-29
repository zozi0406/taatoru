import { useCallback } from 'react';

import { useAppServices } from '@/app/AppProviders';
import { HomeScreen } from '@/features/home/HomeScreen';
import { getDashboardSnapshot } from '@/features/home/dashboard';

export default function HomeRoute() {
  const services = useAppServices();
  const loadSnapshot = useCallback(async () => {
    const online = await services.isOnline();
    return getDashboardSnapshot(services.db, new Date(), online);
  }, [services]);

  return (
    <HomeScreen
      loadSnapshot={loadSnapshot}
      synchronize={services.synchronize}
    />
  );
}
