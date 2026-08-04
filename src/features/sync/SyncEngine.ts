// Copyright 2026 David Sansome
// Copyright 2026 Taatoru contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Modified by Taatoru from Tsurukame's LocalCachingClient.swift at revision
// 8e18ddf7f12c44e91cb0ad63bab31af7440648ea.

import type { WaniKaniApi } from '@/api/WaniKaniApi';
import { ApiDecodeError, ApiError, NetworkError } from '@/api/errors';
import { selectPendingWrites } from './budget';
import type {
  SafeSyncErrorRecord,
  SyncDataRepository,
  SyncStateSnapshot,
} from './SyncRepository';
import { createSyncStore, type SyncPhase, type SyncStore } from './syncStore';
import type { SelectedPendingWrites } from './types';

export type SyncMode = 'quick' | 'full';

export interface SafeSyncError extends SafeSyncErrorRecord {
  readonly hibernating: boolean;
}

export type SyncResult =
  | { readonly status: 'completed'; readonly updatedResources: number }
  | {
      readonly status: 'skipped';
      readonly reason: 'offline' | 'already-running';
    }
  | { readonly status: 'failed'; readonly error: SafeSyncError };

export interface SyncEngine {
  synchronize(mode: SyncMode): Promise<SyncResult>;
}

export interface PendingWriteDelivery {
  sendSelectedPendingWrites(
    selection: SelectedPendingWrites,
    now: Date,
    signal?: AbortSignal,
  ): Promise<void>;
}

interface SynchronizationEngineOptions {
  readonly api: WaniKaniApi;
  readonly repository: SyncDataRepository;
  readonly pendingWrites: PendingWriteDelivery;
  readonly isOnline: () => Promise<boolean>;
  readonly invalidate: () => void | Promise<void>;
  readonly updateNotifications: () => void | Promise<void>;
  readonly now: () => Date;
  readonly store?: SyncStore;
}

export class SynchronizationEngine implements SyncEngine {
  readonly store: SyncStore;
  private busy = false;
  private phase: SyncPhase = 'idle';

  constructor(private readonly options: SynchronizationEngineOptions) {
    this.store = options.store ?? createSyncStore();
  }

  async synchronize(mode: SyncMode): Promise<SyncResult> {
    if (this.busy) {
      return { status: 'skipped', reason: 'already-running' };
    }

    this.busy = true;
    this.setPhase('preparing');
    const now = this.options.now();
    let result: SyncResult;

    try {
      if (!(await this.options.isOnline())) {
        result = { status: 'skipped', reason: 'offline' };
      } else {
        const updatedResources = await this.runSynchronization(mode, now);
        if (mode === 'quick') {
          await this.options.repository.markSyncCompleted(mode, now);
        }
        result = { status: 'completed', updatedResources };
      }
    } catch (error) {
      const safeError = toSafeSyncError(error);
      if (shouldRecordError(error)) {
        try {
          await this.options.repository.recordSyncError(
            this.phase,
            safeError,
            now,
          );
        } catch {
          // The original synchronization error remains the useful result.
        }
      }
      result = { status: 'failed', error: safeError };
    } finally {
      this.setPhase('finalizing');
      await settleFinalizer(this.options.invalidate);
      await settleFinalizer(this.options.updateNotifications);
      this.busy = false;
    }

    this.phase = 'idle';
    this.store.setState({
      isSyncing: false,
      phase: 'idle',
      lastResult: result,
    });
    return result;
  }

  private async runSynchronization(
    mode: SyncMode,
    now: Date,
  ): Promise<number> {
    if (mode === 'full') {
      return this.runFullSynchronization(now);
    }

    const state = await this.options.repository.getStateSnapshot();
    const selectedWrites = this.selectWrites(state, mode);
    this.setPhase('phase-one');
    let subjectCount = 0;
    await allOrThrow([
      this.options.pendingWrites.sendSelectedPendingWrites(
        { progressIds: selectedWrites.progressIds, studyMaterialIds: [] },
        now,
      ),
      this.options.pendingWrites.sendSelectedPendingWrites(
        {
          progressIds: [],
          studyMaterialIds: selectedWrites.studyMaterialIds,
        },
        now,
      ),
      (async () => {
        const page = await this.options.api.getSubjects(
          state.cursors.subjects,
        );
        await this.options.repository.replaceSubjects(
          page.data,
          page.data_updated_at,
        );
        subjectCount = page.data.length;
      })(),
    ]);

    this.setPhase('phase-two');
    const resources = await Promise.allSettled([
        this.options.api.getAssignments(state.cursors.assignments),
        this.options.api.getStudyMaterials(state.cursors.studyMaterials),
        this.options.api.getUser(),
        this.options.api.getLevelProgressions(),
        this.options.api.getVoiceActors(state.cursors.voiceActors),
        this.options.api.getReviewStatistics(
          state.cursors.reviewStatistics,
        ),
    ] as const);
    const failures: unknown[] = [];
    const store = async <T>(
      result: PromiseSettledResult<T>,
      operation: (value: T) => Promise<number>,
    ): Promise<number> => {
      if (result.status === 'rejected') {
        failures.push(result.reason);
        return 0;
      }
      try {
        return await operation(result.value);
      } catch (error) {
        failures.push(error);
        return 0;
      }
    };
    const phaseTwoCounts = [
      await store(resources[0], async (page) => {
          await this.options.repository.replaceAssignments(
            page.data,
            page.data_updated_at,
          );
          return page.data.length;
      }),
      await store(resources[1], async (page) => {
          await this.options.repository.replaceStudyMaterials(
            page.data,
            page.data_updated_at,
          );
          return page.data.length;
      }),
      await store(resources[2], async (resource) => {
          await this.options.repository.replaceUser(resource);
          return 1;
      }),
      await store(resources[3], async (page) => {
          await this.options.repository.replaceLevelProgressions(page.data);
          return page.data.length;
      }),
      await store(resources[4], async (page) => {
          await this.options.repository.replaceVoiceActors(
            page.data,
            page.data_updated_at,
          );
          return page.data.length;
      }),
      await store(resources[5], async (page) => {
          await this.options.repository.replaceReviewStatistics(
            page.data,
            page.data_updated_at,
          );
          return page.data.length;
      }),
    ];
    if (failures.length > 0) {
      throw failures[0];
    }
    return (
      subjectCount +
      phaseTwoCounts.reduce((total, count) => total + count, 0)
    );
  }

  private async runFullSynchronization(now: Date): Promise<number> {
    const state = await this.options.repository.getStateSnapshot();
    const selectedWrites = this.selectWrites(state, 'full');
    this.setPhase('phase-one');
    const subjectsPromise = this.options.api.getSubjects(null);
    await allOrThrow([
      this.options.pendingWrites.sendSelectedPendingWrites(
        { progressIds: selectedWrites.progressIds, studyMaterialIds: [] },
        now,
      ),
      this.options.pendingWrites.sendSelectedPendingWrites(
        {
          progressIds: [],
          studyMaterialIds: selectedWrites.studyMaterialIds,
        },
        now,
      ),
      subjectsPromise.then(() => undefined),
    ]);
    const subjects = await subjectsPromise;

    this.setPhase('phase-two');
    const resourcePromises = [
      this.options.api.getAssignments(null),
      this.options.api.getStudyMaterials(null),
      this.options.api.getUser(),
      this.options.api.getLevelProgressions(),
      this.options.api.getVoiceActors(null),
      this.options.api.getReviewStatistics(null),
    ] as const;
    await allOrThrow(resourcePromises as readonly Promise<unknown>[]);
    const [
      assignments,
      studyMaterials,
      user,
      levelProgressions,
      voiceActors,
      reviewStatistics,
    ] = await Promise.all(resourcePromises);
    await this.options.repository.replaceFullRefresh(
      {
        assignments,
        levelProgressions,
        reviewStatistics,
        studyMaterials,
        subjects,
        user,
        voiceActors,
      },
      now,
    );
    return (
      subjects.data.length +
      assignments.data.length +
      studyMaterials.data.length +
      1 +
      levelProgressions.data.length +
      voiceActors.data.length +
      reviewStatistics.data.length
    );
  }

  private selectWrites(
    state: SyncStateSnapshot,
    mode: SyncMode,
  ): SelectedPendingWrites {
    return selectPendingWrites({
      requestsRemaining: this.options.api.rateLimit.requestsRemaining,
      assignmentUnits: mode === 'quick' ? 1 : 8,
      subjectUnits: mode === 'quick' ? 1 : 20,
      fixedUnits: 6,
      progressIds: state.progressIds,
      studyMaterialIds: state.studyMaterialIds,
    });
  }

  private setPhase(phase: SyncPhase): void {
    this.phase = phase;
    this.store.setState({
      isSyncing: phase !== 'idle',
      phase,
    });
  }
}

async function allOrThrow<T>(
  operations: readonly Promise<T>[],
): Promise<readonly T[]> {
  const results = await Promise.allSettled(operations);
  const failure = results.find(
    (result): result is PromiseRejectedResult =>
      result.status === 'rejected',
  );
  if (failure !== undefined) {
    throw failure.reason;
  }
  return results.map((result) => (result as PromiseFulfilledResult<T>).value);
}

function toSafeSyncError(error: unknown): SafeSyncError {
  if (error instanceof ApiError) {
    return {
      kind:
        error instanceof ApiDecodeError
          ? 'decode'
          : error instanceof NetworkError
            ? 'network'
            : 'api',
      message: error.message,
      status: error.status,
      safeUrl: error.safeUrl,
      retryAt: error.retryAt?.toISOString() ?? null,
      hibernating: error.isHibernating,
    };
  }

  return {
    kind: 'unexpected',
    message: 'Synchronization failed',
    status: null,
    safeUrl: null,
    retryAt: null,
    hibernating: false,
  };
}

function shouldRecordError(error: unknown): boolean {
  if (error instanceof NetworkError) {
    return false;
  }
  if (error instanceof ApiError) {
    return (
      error.status !== 401 &&
      error.status !== 429 &&
      !(error.status === 403 && error.isHibernating)
    );
  }
  return true;
}

async function settleFinalizer(
  finalizer: () => void | Promise<void>,
): Promise<void> {
  try {
    await finalizer();
  } catch {
    //
  }
}
