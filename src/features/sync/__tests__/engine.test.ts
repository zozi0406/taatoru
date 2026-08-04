import type { WaniKaniApi } from '@/api/WaniKaniApi';
import {
  assignmentFixture,
  collectionPage,
  kanjiFixture,
  levelProgressionFixture,
  reviewStatisticFixture,
  studyMaterialFixture,
  userFixture,
  voiceActorFixture,
} from '@/fixtures/api';
import {
  SynchronizationEngine,
  type PendingWriteDelivery,
} from '../SyncEngine';
import type {
  SyncDataRepository,
  SyncStateSnapshot,
} from '../SyncRepository';
import type { RecentMistake } from '../types';

const NOW = new Date('2026-07-29T12:00:00.000Z');

test('runs pending writes and subjects before concurrent phase two resources', async () => {
  const events: string[] = [];
  const repository = syncRepository();
  const api = eventApi(events);
  const engine = new SynchronizationEngine({
    api,
    repository,
    pendingWrites: eventPendingWrites(events),
    isOnline: async () => true,
    invalidate: () => {
      events.push('invalidate');
    },
    updateNotifications: async () => {
      events.push('notifications');
    },
    now: () => NOW,
  });

  await expect(engine.synchronize('quick')).resolves.toEqual({
    status: 'completed',
    updatedResources: 7,
  });
  expect(events).toEqual([
    'pending-progress:start',
    'pending-study:start',
    'subjects:start',
    'pending-progress:end',
    'pending-study:end',
    'subjects:end',
    'assignments:start',
    'study-materials:start',
    'user:start',
    'level-progressions:start',
    'voice-actors:start',
    'review-statistics:start',
    'assignments:end',
    'study-materials:end',
    'user:end',
    'level-progressions:end',
    'voice-actors:end',
    'review-statistics:end',
    'invalidate',
    'notifications',
  ]);
  expect(repository.replaceSubjects).toHaveBeenCalledWith(
    [kanjiFixture],
    '2026-07-29T12:34:56.123456Z',
  );
  expect(api.getUser).toHaveBeenCalledWith();
  expect(api.getLevelProgressions).toHaveBeenCalledWith();
});

test('skips offline and overlapping synchronization requests', async () => {
  const offlineRepository = syncRepository();
  const offlineApi = eventApi([]);
  const offlineInvalidate = jest.fn();
  const offlineEngine = new SynchronizationEngine({
    api: offlineApi,
    repository: offlineRepository,
    pendingWrites: eventPendingWrites([]),
    isOnline: async () => false,
    invalidate: offlineInvalidate,
    updateNotifications: jest.fn(),
    now: () => NOW,
  });

  await expect(offlineEngine.synchronize('quick')).resolves.toEqual({
    status: 'skipped',
    reason: 'offline',
  });
  expect(offlineApi.getSubjects).not.toHaveBeenCalled();
  expect(offlineInvalidate).toHaveBeenCalledTimes(1);

  let releaseOnline!: (online: boolean) => void;
  const online = new Promise<boolean>((resolve) => {
    releaseOnline = resolve;
  });
  const busyEngine = new SynchronizationEngine({
    api: eventApi([]),
    repository: syncRepository(),
    pendingWrites: eventPendingWrites([]),
    isOnline: () => online,
    invalidate: jest.fn(),
    updateNotifications: jest.fn(),
    now: () => NOW,
  });
  const first = busyEngine.synchronize('quick');

  await expect(busyEngine.synchronize('quick')).resolves.toEqual({
    status: 'skipped',
    reason: 'already-running',
  });
  releaseOnline(true);
  await expect(first).resolves.toMatchObject({ status: 'completed' });
});

test('a phase-one failure prevents phase two and always finalizes', async () => {
  const events: string[] = [];
  const api = eventApi(events);
  api.getSubjects.mockRejectedValueOnce(new Error('subject failure'));
  const engine = new SynchronizationEngine({
    api,
    repository: syncRepository(),
    pendingWrites: eventPendingWrites(events),
    isOnline: async () => true,
    invalidate: () => {
      events.push('invalidate');
    },
    updateNotifications: async () => {
      events.push('notifications');
    },
    now: () => NOW,
  });

  await expect(engine.synchronize('quick')).resolves.toMatchObject({
    status: 'failed',
  });
  expect(api.getAssignments).not.toHaveBeenCalled();
  expect(events.slice(-2)).toEqual(['invalidate', 'notifications']);

  api.getSubjects.mockResolvedValueOnce(collectionPage([kanjiFixture]));
  await expect(engine.synchronize('quick')).resolves.toMatchObject({
    status: 'completed',
  });
});

test('phase-two resources commit independently when a sibling fails', async () => {
  const api = eventApi([]);
  api.getAssignments.mockRejectedValueOnce(new Error('assignment failure'));
  const repository = syncRepository();
  const engine = new SynchronizationEngine({
    api,
    repository,
    pendingWrites: eventPendingWrites([]),
    isOnline: async () => true,
    invalidate: jest.fn(),
    updateNotifications: jest.fn(),
    now: () => NOW,
  });

  await expect(engine.synchronize('quick')).resolves.toMatchObject({
    status: 'failed',
  });
  expect(repository.replaceAssignments).not.toHaveBeenCalled();
  expect(repository.replaceStudyMaterials).toHaveBeenCalledTimes(1);
  expect(repository.replaceUser).toHaveBeenCalledTimes(1);
  expect(repository.replaceLevelProgressions).toHaveBeenCalledTimes(1);
  expect(repository.replaceVoiceActors).toHaveBeenCalledTimes(1);
  expect(repository.replaceReviewStatistics).toHaveBeenCalledTimes(1);
});

test('does not overlap repository writes in phase two', async () => {
  const repository = syncRepository();
  let writeInProgress = false;
  const exclusiveWrite = jest.fn(
    async (..._args: readonly unknown[]): Promise<undefined> => {
      if (writeInProgress) {
        throw new Error('database is locked');
      }
      writeInProgress = true;
      await Promise.resolve();
      writeInProgress = false;
      return undefined;
    },
  );
  repository.replaceAssignments.mockImplementation(exclusiveWrite);
  repository.replaceStudyMaterials.mockImplementation(exclusiveWrite);
  repository.replaceUser.mockImplementation(exclusiveWrite);
  repository.replaceLevelProgressions.mockImplementation(exclusiveWrite);
  repository.replaceVoiceActors.mockImplementation(exclusiveWrite);
  repository.replaceReviewStatistics.mockImplementation(exclusiveWrite);
  const engine = new SynchronizationEngine({
    api: eventApi([]),
    repository,
    pendingWrites: eventPendingWrites([]),
    isOnline: async () => true,
    invalidate: jest.fn(),
    updateNotifications: jest.fn(),
    now: () => NOW,
  });

  await expect(engine.synchronize('quick')).resolves.toMatchObject({
    status: 'completed',
  });
});

test('full synchronization clears before fetching and restores recent mistakes', async () => {
  const events: string[] = [];
  const api = eventApi(events);
  const repository = syncRepository();
  const recentMistakes = [
    { subjectId: 201, mistakenAt: '2026-07-29T11:00:00.000Z' },
  ];
  repository.prepareFullRefresh.mockImplementationOnce(async () => {
    events.push('clear');
    return recentMistakes;
  });
  repository.getStateSnapshot.mockImplementationOnce(async () => ({
    cursors: {
      assignments: null,
      studyMaterials: null,
      subjects: null,
      voiceActors: null,
      reviewStatistics: null,
    },
    progressIds: [],
    studyMaterialIds: [],
  }));
  repository.restoreRecentMistakes.mockImplementationOnce(async () => {
    events.push('restore');
  });
  const engine = new SynchronizationEngine({
    api,
    repository,
    pendingWrites: eventPendingWrites(events),
    isOnline: async () => true,
    invalidate: jest.fn(),
    updateNotifications: jest.fn(),
    now: () => NOW,
  });

  await expect(engine.synchronize('full')).resolves.toMatchObject({
    status: 'completed',
  });
  expect(events.indexOf('clear')).toBeLessThan(
    events.indexOf('subjects:start'),
  );
  expect(events.indexOf('restore')).toBeGreaterThan(
    events.indexOf('review-statistics:end'),
  );
  expect(api.getSubjects).toHaveBeenCalledWith(null);
  expect(api.getAssignments).toHaveBeenCalledWith(null);
  expect(repository.restoreRecentMistakes).toHaveBeenCalledWith(
    recentMistakes,
    NOW,
  );
});

function eventApi(events: string[]) {
  const operation = <T>(name: string, value: T) =>
    jest.fn(async () => {
      events.push(`${name}:start`);
      await Promise.resolve();
      events.push(`${name}:end`);
      return value;
    });

  return {
    getSubjects: operation('subjects', collectionPage([kanjiFixture])),
    getAssignments: operation(
      'assignments',
      collectionPage([assignmentFixture]),
    ),
    getStudyMaterials: operation(
      'study-materials',
      collectionPage([studyMaterialFixture]),
    ),
    getUser: operation('user', userFixture),
    getLevelProgressions: operation(
      'level-progressions',
      collectionPage([levelProgressionFixture]),
    ),
    getVoiceActors: operation(
      'voice-actors',
      collectionPage([voiceActorFixture]),
    ),
    getReviewStatistics: operation(
      'review-statistics',
      collectionPage([reviewStatisticFixture]),
    ),
    rateLimit: {
      limit: 60,
      requestsInServerMinute: 0,
      requestsRemaining: 20,
      resetAfterMs: 60_000,
      estimatedClockSkewMs: 0,
    },
  } as unknown as WaniKaniApi & {
    [K in
      | 'getAssignments'
      | 'getLevelProgressions'
      | 'getReviewStatistics'
      | 'getStudyMaterials'
      | 'getSubjects'
      | 'getUser'
      | 'getVoiceActors']: jest.MockedFunction<WaniKaniApi[K]>;
  };
}

function eventPendingWrites(events: string[]): PendingWriteDelivery {
  return {
    async sendSelectedPendingWrites(selection) {
      const name =
        selection.progressIds.length > 0
          ? 'pending-progress'
          : 'pending-study';
      events.push(`${name}:start`);
      await Promise.resolve();
      events.push(`${name}:end`);
    },
  };
}

function syncRepository() {
  const snapshot: SyncStateSnapshot = {
    cursors: {
      assignments: 'assignments-cursor',
      studyMaterials: 'study-materials-cursor',
      subjects: 'subjects-cursor',
      voiceActors: 'voice-actors-cursor',
      reviewStatistics: 'review-statistics-cursor',
    },
    progressIds: [1],
    studyMaterialIds: [2],
  };

  return {
    getStateSnapshot: jest.fn(async () => snapshot),
    prepareFullRefresh: jest.fn(
      async (
        ..._args: Parameters<SyncDataRepository['prepareFullRefresh']>
      ): Promise<readonly RecentMistake[]> => [],
    ),
    restoreRecentMistakes: jest.fn(
      async (..._args: Parameters<SyncDataRepository['restoreRecentMistakes']>) =>
        undefined,
    ),
    replaceSubjects: jest.fn(
      async (..._args: Parameters<SyncDataRepository['replaceSubjects']>) =>
        undefined,
    ),
    replaceAssignments: jest.fn(
      async (..._args: Parameters<SyncDataRepository['replaceAssignments']>) =>
        undefined,
    ),
    replaceStudyMaterials: jest.fn(
      async (
        ..._args: Parameters<SyncDataRepository['replaceStudyMaterials']>
      ) => undefined,
    ),
    replaceUser: jest.fn(
      async (..._args: Parameters<SyncDataRepository['replaceUser']>) =>
        undefined,
    ),
    replaceLevelProgressions: jest.fn(
      async (
        ..._args: Parameters<SyncDataRepository['replaceLevelProgressions']>
      ) => undefined,
    ),
    replaceVoiceActors: jest.fn(
      async (..._args: Parameters<SyncDataRepository['replaceVoiceActors']>) =>
        undefined,
    ),
    replaceReviewStatistics: jest.fn(
      async (
        ..._args: Parameters<SyncDataRepository['replaceReviewStatistics']>
      ) => undefined,
    ),
    markSyncCompleted: jest.fn(
      async (..._args: Parameters<SyncDataRepository['markSyncCompleted']>) =>
        undefined,
    ),
    recordSyncError: jest.fn(
      async (..._args: Parameters<SyncDataRepository['recordSyncError']>) =>
        undefined,
    ),
  } satisfies SyncDataRepository;
}
