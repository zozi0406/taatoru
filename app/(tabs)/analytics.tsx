import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { useAppServices } from '@/app/AppProviders';
import { AnalyticsScreen } from '@/features/analytics/AnalyticsScreen';
import { loadAnalyticsSnapshot } from '@/features/analytics/calculations';

export default function AnalyticsRoute() {
  const router = useRouter();
  const services = useAppServices();
  const loadSnapshot = useCallback(
    () => loadAnalyticsSnapshot(services.db, new Date()),
    [services.db],
  );
  const openSubject = useCallback(
    (id: number) => {
      router.push({
        pathname: '/subject/[id]',
        params: { id: String(id) },
      });
    },
    [router],
  );

  return (
    <AnalyticsScreen
      loadSnapshot={loadSnapshot}
      onOpenSubject={openSubject}
    />
  );
}
