import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react-native';
import { FlatList, Pressable, Text, View } from 'react-native';

import {
  AccountHibernationNotice,
  HIBERNATION_SYNC_DETAIL,
} from '@/features/auth/AccountHibernationNotice';
import type { SyncResult } from '@/features/sync/SyncEngine';
import { BrandWordmark, PageHeading } from '@/ui/components/PageHeading';
import { useScreenPadding } from '@/ui/theme/useScreenPadding';
import { DashboardSections, type DashboardSection } from './DashboardSections';
import { SyncStatus, type SyncStatusState } from '@/ui/components/SyncStatus';
import { minimumTouchTarget } from '@/ui/theme/spacing';
import { useTheme } from '@/ui/theme/ThemeProvider';
import type { DashboardSnapshot } from './dashboard';

interface HomeScreenProps {
  readonly loadSnapshot: () => Promise<DashboardSnapshot>;
  readonly synchronize: (mode: 'quick' | 'full') => Promise<SyncResult>;
  readonly onPickLessons?: () => void;
  readonly onStartLessons?: () => void;
  readonly onStartReviews?: () => void;
}

export function HomeScreen({
  loadSnapshot,
  synchronize,
  onPickLessons,
  onStartLessons,
  onStartReviews,
}: HomeScreenProps) {
  const theme = useTheme();
  const screenPadding = useScreenPadding();
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [syncState, setSyncState] = useState<SyncStatusState>('idle');
  const [syncDetail, setSyncDetail] = useState<string>();

  const reload = useCallback(async () => {
    setSnapshot(await loadSnapshot());
  }, [loadSnapshot]);
  useEffect(() => {
    let active = true;
    void loadSnapshot().then((loadedSnapshot) => {
      if (active) {
        setSnapshot(loadedSnapshot);
      }
    });
    return () => {
      active = false;
    };
  }, [loadSnapshot]);

  const runSync = useCallback(
    async (mode: 'quick' | 'full') => {
      setRefreshing(true);
      setSyncState('syncing');
      setSyncDetail(
        mode === 'full' ? 'Refreshing local library' : 'Checking for updates',
      );
      try {
        const result = await synchronize(mode);
        if (result.status === 'completed') {
          setSyncState('completed');
          setSyncDetail(`${result.updatedResources} resources updated`);
        } else if (result.status === 'skipped') {
          setSyncState('idle');
          setSyncDetail(
            result.reason === 'offline'
              ? 'Offline — using local data'
              : 'Synchronization already running',
          );
        } else {
          const hibernating =
            result.error.status === 403 && result.error.hibernating;
          setSyncState(hibernating ? 'attention' : 'failed');
          setSyncDetail(
            hibernating ? HIBERNATION_SYNC_DETAIL : result.error.message,
          );
        }
        await reload();
      } catch {
        setSyncState('failed');
        setSyncDetail('Unable to refresh the local library');
      } finally {
        setRefreshing(false);
      }
    },
    [reload, synchronize],
  );

  const sections = useMemo<readonly DashboardSection[]>(
    () => ['counts', 'forecast', 'level', 'srs'],
    [],
  );

  return (
    <FlatList
      testID="home-dashboard"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        gap: theme.spacing.lg,
        ...screenPadding,
      }}
      data={sections}
      keyExtractor={(section) => section}
      onRefresh={() => void runSync('full')}
      refreshing={refreshing}
      style={{ backgroundColor: theme.colors.canvas }}
      ListHeaderComponent={
        <View style={{ gap: theme.spacing.lg }}>
          <View
            style={{
              alignItems: 'center',
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <BrandWordmark />
            <View
              style={{
                backgroundColor: theme.colors.accentSurface,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text
                style={[theme.typography.label, { color: theme.colors.accent }]}
              >
                {snapshot === null ? 'Loading…' : `Level ${snapshot.level}`}
              </Text>
            </View>
          </View>
          <PageHeading
            eyebrow="YOUR DAILY JAPANESE"
            title="Keep your momentum."
            intro={
              <Text
                style={[
                  theme.typography.body,
                  { color: theme.colors.textMuted },
                ]}
              >
                {snapshot === null
                  ? 'Loading your local library…'
                  : 'One subject closer. Every day.'}
              </Text>
            }
          />
          {syncState === 'attention' ? (
            <AccountHibernationNotice onRetry={() => void runSync('quick')} />
          ) : null}
          {snapshot?.vacationActive ? (
            <SyncStatus
              state="idle"
              detail="Vacation mode is active on WaniKani"
            />
          ) : null}
          {snapshot !== null && snapshot.pendingWriteCount > 0 ? (
            <Text
              selectable
              style={[
                theme.typography.caption,
                { color: theme.colors.textMuted },
              ]}
            >
              {snapshot.pendingWriteCount} changes waiting to upload
            </Text>
          ) : null}
          {snapshot?.nextReviewAt !== null &&
          snapshot?.nextReviewAt !== undefined ? (
            <Text
              selectable
              style={[
                theme.typography.caption,
                { color: theme.colors.textMuted },
              ]}
            >
              Next review {formatTimestamp(snapshot.nextReviewAt)}
            </Text>
          ) : null}
        </View>
      }
      ListFooterComponent={
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <SyncStatus
                state={
                  snapshot?.online === false && syncState === 'idle'
                    ? 'offline'
                    : syncState
                }
                detail={
                  snapshot?.online === false && syncState === 'idle'
                    ? 'Offline — local data remains available'
                    : (syncDetail ?? lastSyncDetail(snapshot?.lastSyncAt))
                }
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Quick sync"
              accessibilityState={{ disabled: refreshing }}
              disabled={refreshing}
              onPress={() => void runSync('quick')}
              style={({ pressed }) => ({
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: minimumTouchTarget,
                minWidth: minimumTouchTarget,
                borderRadius: 14,
                backgroundColor: theme.colors.surfaceMuted,
                opacity: pressed || refreshing ? 0.5 : 1,
              })}
            >
              <RefreshCw size={18} color={theme.colors.accent} />
            </Pressable>
          </View>
          <Text
            style={[
              theme.typography.overline,
              {
                color: theme.colors.textMuted,
                fontSize: 9,
                textAlign: 'center',
              },
            ]}
          >
            TAATORU · YOUR WANIKANI COMPANION
          </Text>
        </View>
      }
      renderItem={({ item }) =>
        snapshot === null ? null : (
          <DashboardSections
            section={item}
            snapshot={snapshot}
            onPickLessons={onPickLessons}
            onStartLessons={onStartLessons}
            onStartReviews={onStartReviews}
          />
        )
      }
    />
  );
}

function lastSyncDetail(lastSyncAt: string | null | undefined): string {
  return lastSyncAt === null || lastSyncAt === undefined
    ? 'Local library has not synchronized yet'
    : `Last synchronized ${formatTimestamp(lastSyncAt)}`;
}

function formatTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}
