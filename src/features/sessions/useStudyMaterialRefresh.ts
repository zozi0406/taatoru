import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import type { Database } from '@/db/Database';
import type { SubjectResource } from '@/api/types';
import type { SubjectStudyMaterial } from '@/features/subjects/subjectDetails';
import { loadStudyMaterials } from './studyMaterials';

/** Refresh retained study screens without recreating their question/answer state. */
export function useStudyMaterialRefresh(
  db: Database,
  subjects: readonly SubjectResource[] | null,
  update: (materials: Readonly<Record<number, SubjectStudyMaterial>>) => void,
  subscribe?: (listener: () => void) => () => void,
): void {
  const refresh = useRef<() => void>(() => {});
  useEffect(() => {
    if (subjects === null) return;
    let active = true;
    let version = 0;
    const reload = () => {
      const requested = ++version;
      void loadStudyMaterials(db, subjects.map(({ id }) => id)).then((materials) => {
        if (active && requested === version) update(materials);
      }).catch(() => {});
    };
    refresh.current = reload;
    const unsubscribe = subscribe?.(reload);
    reload();
    return () => {
      active = false;
      refresh.current = () => {};
      unsubscribe?.();
    };
  }, [db, subjects, update, subscribe]);
  useFocusEffect(useCallback(() => { refresh.current(); }, []));
}
