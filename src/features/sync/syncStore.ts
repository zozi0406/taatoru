import { createStore, type StoreApi } from 'zustand/vanilla';
import type { SyncResult } from './SyncEngine';

export type SyncPhase = 'idle' | 'preparing' | 'phase-one' | 'phase-two' | 'finalizing';

export interface SyncStoreState {
  readonly isSyncing: boolean;
  readonly phase: SyncPhase;
  readonly lastResult: SyncResult | null;
}

export type SyncStore = StoreApi<SyncStoreState>;

export function createSyncStore(): SyncStore {
  return createStore<SyncStoreState>(() => ({
    isSyncing: false,
    phase: 'idle',
    lastResult: null,
  }));
}
