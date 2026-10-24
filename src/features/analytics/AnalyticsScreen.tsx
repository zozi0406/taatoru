import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { PageHeading } from '@/ui/components/PageHeading';
import { srsColors } from '@/ui/theme/colors';
import { useScreenPadding } from '@/ui/theme/useScreenPadding';
import { Card } from '@/ui/components/Card';
import { minimumTouchTarget } from '@/ui/theme/spacing';
import { type TaatoruTheme, useTheme } from '@/ui/theme/ThemeProvider';
import type { AnalyticsSnapshot, RankedSubject } from './calculations';
import { DonutChart } from './DonutChart';
import { SimpleBarChart } from './SimpleBarChart';

interface AnalyticsScreenProps {
  readonly loadSnapshot: () => Promise<AnalyticsSnapshot>;
  readonly onOpenSubject: (subjectId: number) => void;
}

type AnalyticsSection =
  'upcoming' | 'srs' | 'levels' | 'accuracy' | 'subjects' | 'leeches';

const SECTIONS: readonly AnalyticsSection[] = [
  'upcoming',
  'srs',
  'levels',
  'accuracy',
  'subjects',
  'leeches',
];

const SRS_COLORS = Object.values(srsColors);

export function AnalyticsScreen({
  loadSnapshot,
  onOpenSubject,
}: AnalyticsScreenProps) {
  const theme = useTheme();
  const screenPadding = useScreenPadding();
  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      setSnapshot(await loadSnapshot());
      setError(null);
    } catch {
      setError('Unable to load analytics from the local library');
    } finally {
      setRefreshing(false);
    }
  }, [loadSnapshot]);

  useEffect(() => {
    let active = true;
    void loadSnapshot()
      .then((loaded) => {
        if (active) {
          setSnapshot(loaded);
        }
      })
      .catch(() => {
        if (active) {
          setError('Unable to load analytics from the local library');
        }
      });
    return () => {
      active = false;
    };
  }, [loadSnapshot]);

  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        gap: theme.spacing.lg,
        ...screenPadding,
      }}
      data={SECTIONS}
      extraData={{ error, snapshot }}
      keyExtractor={(section) => section}
      onRefresh={() => void reload()}
      refreshing={refreshing}
      style={{ backgroundColor: theme.colors.canvas }}
      ListHeaderComponent={
        <View style={{ gap: theme.spacing.sm }}>
          <PageHeading
            title="Analytics"
            eyebrow="THE BIGGER PICTURE"
            intro={
              <Text
                style={[
                  theme.typography.body,
                  { color: theme.colors.textMuted },
                ]}
              >
                Small steps. Measurable progress.
              </Text>
            }
          />
          {error === null ? null : (
            <Text
              accessibilityRole="alert"
              selectable
              style={[theme.typography.body, { color: theme.colors.danger }]}
            >
              {error}
            </Text>
          )}
        </View>
      }
      renderItem={({ item }) =>
        snapshot === null
          ? null
          : renderSection(item, snapshot, theme, onOpenSubject)
      }
    />
  );
}

function renderSection(
  section: AnalyticsSection,
  snapshot: AnalyticsSnapshot,
  theme: TaatoruTheme,
  onOpenSubject: (subjectId: number) => void,
) {
  if (section === 'upcoming') {
    const total = sum(snapshot.upcoming.map(({ value }) => value));
    return (
      <Card>
        <SimpleBarChart
          data={snapshot.upcoming}
          summary={
            total === 0
              ? 'No reviews in the next 24 hours'
              : `${total} reviews across ${snapshot.upcoming.length} time ${snapshot.upcoming.length === 1 ? 'bucket' : 'buckets'}`
          }
          title="Upcoming reviews"
        />
      </Card>
    );
  }
  if (section === 'srs') {
    const total = sum(snapshot.srs.map(({ value }) => value));
    return (
      <Card>
        <DonutChart
          data={snapshot.srs.map((datum, index) => ({
            ...datum,
            color: SRS_COLORS[index] ?? theme.colors.accent,
          }))}
          summary={
            total === 0
              ? 'No active SRS subjects'
              : `${total} subjects with local progress`
          }
          title="SRS distribution"
        />
      </Card>
    );
  }
  if (section === 'levels') {
    return (
      <Card>
        <SimpleBarChart
          data={snapshot.levelTimings.map(({ hours, level }) => ({
            label: `L${level}`,
            value: hours,
          }))}
          summary={
            snapshot.levelTimings.length === 0
              ? 'No completed level timing yet'
              : `${snapshot.levelTimings.length} completed levels`
          }
          title="Level timing in hours"
        />
      </Card>
    );
  }
  if (section === 'accuracy') {
    return (
      <AnalyticsCard title="Answer accuracy" theme={theme}>
        <Text
          selectable
          style={[
            theme.typography.screenTitle,
            {
              color: theme.colors.text,
              fontVariant: ['tabular-nums'],
            },
          ]}
        >
          {snapshot.accuracy === null
            ? 'No answers yet'
            : `${snapshot.accuracy.percentage}%`}
        </Text>
        {snapshot.accuracy === null ? null : (
          <Text
            selectable
            style={[
              theme.typography.caption,
              { color: theme.colors.textMuted },
            ]}
          >
            {snapshot.accuracy.correct} correct of {snapshot.accuracy.total}
          </Text>
        )}
      </AnalyticsCard>
    );
  }
  if (section === 'subjects') {
    return (
      <View style={{ gap: theme.spacing.lg }}>
        <RankedList
          emptyLabel="No answered subjects"
          onOpenSubject={onOpenSubject}
          subjects={snapshot.strongest}
          theme={theme}
          title="Strongest subjects"
        />
        <RankedList
          emptyLabel="No answered subjects"
          onOpenSubject={onOpenSubject}
          subjects={snapshot.weakest}
          theme={theme}
          title="Weakest subjects"
        />
      </View>
    );
  }
  return (
    <AnalyticsCard title="Leeches" theme={theme}>
      {snapshot.leeches.length === 0 ? (
        <Text selectable style={{ color: theme.colors.textMuted }}>
          No subjects meet the current leech threshold
        </Text>
      ) : (
        snapshot.leeches.map((subject) => (
          <Pressable
            key={subject.id}
            accessibilityLabel={`Open ${subject.label}`}
            accessibilityRole="button"
            onPress={() => onOpenSubject(subject.id)}
            style={{
              justifyContent: 'center',
              minHeight: minimumTouchTarget,
            }}
          >
            <Text
              style={[theme.typography.label, { color: theme.colors.text }]}
            >
              {subject.label} · score {subject.score}
            </Text>
          </Pressable>
        ))
      )}
    </AnalyticsCard>
  );
}

function RankedList({
  emptyLabel,
  onOpenSubject,
  subjects,
  theme,
  title,
}: {
  readonly emptyLabel: string;
  readonly onOpenSubject: (subjectId: number) => void;
  readonly subjects: readonly RankedSubject[];
  readonly theme: TaatoruTheme;
  readonly title: string;
}) {
  return (
    <AnalyticsCard title={title} theme={theme}>
      {subjects.length === 0 ? (
        <Text selectable style={{ color: theme.colors.textMuted }}>
          {emptyLabel}
        </Text>
      ) : (
        subjects.map((subject) => (
          <Pressable
            key={subject.id}
            accessibilityLabel={`Open ${subject.label}`}
            accessibilityRole="button"
            onPress={() => onOpenSubject(subject.id)}
            style={{
              justifyContent: 'center',
              minHeight: minimumTouchTarget,
            }}
          >
            <Text
              style={[theme.typography.label, { color: theme.colors.text }]}
            >
              {subject.label} · {subject.percentage}% · {subject.totalAnswers}{' '}
              answers
            </Text>
          </Pressable>
        ))
      )}
    </AnalyticsCard>
  );
}

function AnalyticsCard({
  children,
  theme,
  title,
}: {
  readonly children: ReactNode;
  readonly theme: TaatoruTheme;
  readonly title: string;
}) {
  return (
    <Card>
      <Text
        accessibilityRole="header"
        selectable
        style={[theme.typography.sectionTitle, { color: theme.colors.text }]}
      >
        {title}
      </Text>
      {children}
    </Card>
  );
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
