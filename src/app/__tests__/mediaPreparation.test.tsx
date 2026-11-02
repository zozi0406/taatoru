import { useEffect } from 'react';
import { act, waitFor } from '@testing-library/react-native';
import { AppProviders, useAppServices, type AppServices } from '../AppProviders';
import { ExpoDatabase } from '@/db/ExpoDatabase';
import { NodeTestDatabase } from '@/db/NodeTestDatabase';
import { AuthManager } from '@/features/auth/AuthProvider';
import { RadicalImagePreparation } from '@/features/media/radicalImages';
import { OwnedSyncEngine } from '@/features/sync/OwnedSyncEngine';
import { renderApp } from '@/test/render';
import { ThemeProvider } from '@/ui/theme/ThemeProvider';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('@/features/auth/AuthProvider', () => ({
  AuthManager: jest.fn(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ status: 'unauthenticated' }),
}));
jest.mock('@/features/sync/OwnedSyncEngine', () => ({
  OwnedSyncEngine: jest.fn().mockImplementation(() => ({ synchronize: jest.fn() })),
}));
jest.mock('@/features/notifications/NotificationService', () => ({
  NotificationService: jest.fn(),
  ExpoNotificationPlatform: jest.fn().mockImplementation(() => ({
    cancelAll: jest.fn(async () => {}), setBadge: jest.fn(async () => {}),
  })),
}));
jest.mock('@/features/notifications/backgroundTask', () => ({
  registerReviewBackgroundTask: jest.fn(async () => undefined),
}));

let services: AppServices;
function Probe() {
  const current = useAppServices();
  useEffect(() => { services = current; }, [current]);
  return null;
}

test('local pending writes only invalidate UI; sync requests media and runtime boundaries stop preparation', async () => {
  const db = await NodeTestDatabase.open();
  jest.spyOn(ExpoDatabase, 'open').mockResolvedValue(db as unknown as ExpoDatabase);
  const prepare = jest.spyOn(RadicalImagePreparation.prototype, 'prepare').mockResolvedValue();
  const setActive = jest.spyOn(RadicalImagePreparation.prototype, 'setActive');
  const cancel = jest.spyOn(RadicalImagePreparation.prototype, 'cancel');
  const dispose = jest.spyOn(RadicalImagePreparation.prototype, 'dispose');
  try {
    const rendered = await renderApp(<ThemeProvider scheme="light"><AppProviders><Probe /></AppProviders></ThemeProvider>);
    await waitFor(() => expect(services).toBeDefined());
    const libraryReads = jest.spyOn(db, 'all');
    const changed = jest.fn();
    services.subscribeToData(changed);
    services.notifyPendingWrites();
    services.notifyPendingWrites();
    expect(changed).toHaveBeenCalledTimes(2);
    expect(prepare).not.toHaveBeenCalled();
    expect(libraryReads).not.toHaveBeenCalled();

    const options = jest.mocked(AuthManager).mock.calls[0]![0];
    options.syncFactory('synthetic', { userId: 'synthetic', accountEpoch: 1, credentialRevision: 1 });
    await jest.mocked(OwnedSyncEngine).mock.calls[0]![0].invalidate();
    expect(prepare).toHaveBeenCalledTimes(1);
    services.setForeground(false);
    expect(setActive).toHaveBeenLastCalledWith(false);
    const beforeReplacement = cancel.mock.calls.length;
    options.syncFactory('replacement', { userId: 'synthetic', accountEpoch: 2, credentialRevision: 1 });
    expect(cancel).toHaveBeenCalledTimes(beforeReplacement + 1);
    await act(async () => { await options.clearAccount(); });
    expect(cancel).toHaveBeenCalledTimes(beforeReplacement + 2);
    await rendered.unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  } finally { jest.restoreAllMocks(); }
});
