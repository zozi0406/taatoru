import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { useAppServices } from '@/app/AppProviders';
import { SearchScreen } from '@/features/search/SearchScreen';
import { searchSubjects } from '@/features/search/search';

const MAX_SEARCH_RESULTS = 50;

export default function SearchRoute() {
  const router = useRouter();
  const services = useAppServices();
  const loadResults = useCallback(
    (query: string) =>
      searchSubjects(services.db, query, MAX_SEARCH_RESULTS),
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
    <SearchScreen
      loadResults={loadResults}
      onOpenSubject={openSubject}
    />
  );
}
