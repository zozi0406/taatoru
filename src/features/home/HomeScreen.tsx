import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import type { SyncResult } from '@/features/sync/SyncEngine';
import { Card } from '@/ui/components/Card';
import { SyncStatus, type SyncStatusState } from '@/ui/components/SyncStatus';
import { minimumTouchTarget } from '@/ui/theme/spacing';
import {
  type TaatoruTheme,
  useTheme,
} from '@/ui/theme/ThemeProvider';
import type { DashboardSnapshot } from './dashboard';

interface HomeScreenProps {
  readonly loadSnapshot: () => Promise<DashboardSnapshot>;
  readonly synchronize: (mode: 'quick' | 'full') => Promise<SyncResult>;
  readonly onPickLessons?: () => void;
  readonly onStartLessons?: () => void;
  readonly onStartReviews?: () => void;
}

type DashboardSection = 'counts' | 'forecast' | 'level' | 'srs';

export function HomeScreen({
  loadSnapshot,
  synchronize,
  onPickLessons,
  onStartLessons,
  onStartReviews,
}: HomeScreenProps) {
  const theme = useTheme();
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
          setSyncState('failed');
          setSyncDetail(result.error.message);
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
        padding: theme.spacing.xl,
      }}
      data={sections}
      keyExtractor={(section) => section}
      onRefresh={() => void runSync('full')}
      refreshing={refreshing}
      style={{ backgroundColor: theme.colors.canvas }}
      ListHeaderComponent={
        <View style={{ gap: theme.spacing.lg }}>
          <View style={{ gap: theme.spacing.sm }}>
            <Text
              accessibilityRole="header"
              selectable
              style={[
                theme.typography.screenTitle,
                { color: theme.colors.text },
              ]}
            >
              Home
            </Text>
            <Text
              selectable
              style={[
                theme.typography.body,
                { color: theme.colors.textMuted },
              ]}
            >
              {snapshot === null
                ? 'Loading your local library…'
                : `Level ${snapshot.level}`}
            </Text>
          </View>
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quick sync"
            disabled={refreshing}
            onPress={() => void runSync('quick')}
            style={{
              alignItems: 'center',
              alignSelf: 'flex-start',
              backgroundColor: theme.colors.surfaceMuted,
              borderCurve: 'continuous',
              borderRadius: 12,
              justifyContent: 'center',
              minHeight: minimumTouchTarget,
              paddingHorizontal: theme.spacing.lg,
            }}
          >
            <Text
              style={[
                theme.typography.label,
                { color: theme.colors.accent },
              ]}
            >
              Quick sync
            </Text>
          </Pressable>
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
      renderItem={({ item }) =>
        snapshot === null
          ? null
          : renderSection(
              item,
              snapshot,
              theme,
              onPickLessons,
              onStartLessons,
              onStartReviews,
            )
      }
    />
  );
}

function renderSection(
  section: DashboardSection,
  snapshot: DashboardSnapshot,
  theme: TaatoruTheme,
  onPickLessons?: () => void,
  onStartLessons?: () => void,
  onStartReviews?: () => void,
) {
  if (section === 'counts') {
    return (
      <View style={{ gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          <CountAction
            label="Lessons"
            count={snapshot.lessonCount}
            onPress={onStartLessons}
            theme={theme}
          />
          <CountAction
            label="Reviews"
            count={snapshot.reviewCount}
            onPress={onStartReviews}
            theme={theme}
          />
        </View>
        {snapshot.lessonCount === 0 || onPickLessons === undefined ? null : (
          <Pressable
            accessibilityLabel="Choose lessons"
            accessibilityRole="button"
            onPress={onPickLessons}
            style={{
              alignItems: 'center',
              backgroundColor: theme.colors.surfaceMuted,
              borderRadius: 12,
              justifyContent: 'center',
              minHeight: minimumTouchTarget,
            }}
          >
            <Text
              style={[
                theme.typography.label,
                { color: theme.colors.accent },
              ]}
            >
              Choose lessons
            </Text>
          </Pressable>
        )}
      </View>
    );
  }
  if (section === 'forecast') {
    return (
      <Card>
        <SectionTitle title="Next 24 hours" theme={theme} />
        <Text selectable style={{ color: theme.colors.textMuted }}>
          {snapshot.reviewBuckets.length === 0
            ? 'No reviews scheduled'
            : snapshot.reviewBuckets
                .map(
                  ({ hoursFromNow, cumulative }) =>
                    `${hoursFromNow}h: ${cumulative}`,
                )
                .join('  •  ')}
        </Text>
      </Card>
    );
  }
  if (section === 'level') {
    return (
      <Card>
        <SectionTitle title={`Level ${snapshot.level} progress`} theme={theme} />
        {Object.entries(snapshot.currentLevel).map(([type, counts]) => (
          <Text
            key={type}
            selectable
            style={{
              color: theme.colors.textMuted,
              fontVariant: ['tabular-nums'],
            }}
          >
            {type}: {counts.guru} guru, {counts.apprentice} apprentice,{' '}
            {counts.lesson} lessons, {counts.locked} locked
          </Text>
        ))}
      </Card>
    );
  }
  return (
    <Card>
      <SectionTitle title="SRS distribution" theme={theme} />
      <Text
        selectable
        style={{
          color: theme.colors.textMuted,
          fontVariant: ['tabular-nums'],
        }}
      >
        Apprentice {snapshot.srs.apprentice}  •  Guru {snapshot.srs.guru}  •
        Master {snapshot.srs.master}  •  Enlightened{' '}
        {snapshot.srs.enlightened}  •  Burned {snapshot.srs.burned}
      </Text>
    </Card>
  );
}

function CountAction({
  count,
  label,
  onPress,
  theme,
}: {
  readonly count: number;
  readonly label: string;
  readonly onPress?: () => void;
  readonly theme: TaatoruTheme;
}) {
  const disabled = count === 0 || onPress === undefined;
  return (
    <Pressable
      accessibilityLabel={`Start ${label.toLowerCase()}`}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{ flex: 1, opacity: disabled ? 0.55 : 1 }}
    >
      <Card style={{ minHeight: 112 }}>
        <Text
          selectable
          style={[
            theme.typography.screenTitle,
            { color: theme.colors.text, fontVariant: ['tabular-nums'] },
          ]}
        >
          {count}
        </Text>
        <Text
          style={[
            theme.typography.label,
            { color: theme.colors.textMuted },
          ]}
        >
          {label}
        </Text>
      </Card>
    </Pressable>
  );
}

function SectionTitle({
  theme,
  title,
}: {
  readonly theme: TaatoruTheme;
  readonly title: string;
}) {
  return (
    <Text
      selectable
      style={[
        theme.typography.sectionTitle,
        { color: theme.colors.text },
      ]}
    >
      {title}
    </Text>
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
