import {
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  Layers3,
  Repeat2,
} from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/ui/components/Card';
import { srsColors, subjectColors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme/ThemeProvider';
import type { DashboardSnapshot, LevelProgressSlice } from './dashboard';

export type DashboardSection = 'counts' | 'forecast' | 'level' | 'srs';

export function DashboardSections({
  section,
  snapshot,
  onPickLessons,
  onStartLessons,
  onStartReviews,
}: {
  readonly section: DashboardSection;
  readonly snapshot: DashboardSnapshot;
  readonly onPickLessons?: () => void;
  readonly onStartLessons?: () => void;
  readonly onStartReviews?: () => void;
}) {
  const theme = useTheme();
  if (section === 'counts') {
    return (
      <View style={{ gap: 12 }}>
        <View style={styles.actions}>
          <CountAction
            label="Lessons"
            count={snapshot.lessonCount}
            onPress={onStartLessons}
          />
          <CountAction
            label="Reviews"
            count={snapshot.reviewCount}
            onPress={onStartReviews}
          />
        </View>
        {snapshot.lessonCount === 0 || onPickLessons === undefined ? null : (
          <Pressable
            accessibilityLabel="Choose lessons"
            accessibilityRole="button"
            onPress={onPickLessons}
            style={({ pressed }) => [
              styles.pickerLink,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                opacity: pressed ? 0.65 : 1,
              },
            ]}
          >
            <Layers3 size={18} color={theme.colors.accent} />
            <Text
              style={[
                theme.typography.label,
                { color: theme.colors.text, flex: 1 },
              ]}
            >
              Choose your lessons
            </Text>
            <ChevronRight size={18} color={theme.colors.textMuted} />
          </Pressable>
        )}
      </View>
    );
  }
  if (section === 'forecast') return <ReviewForecast snapshot={snapshot} />;
  if (section === 'level') {
    return (
      <Card style={{ gap: 20 }}>
        <SectionLabel
          title={`Level ${snapshot.level} progress`}
          detail="GURU / TOTAL"
        />
        {(['radical', 'kanji', 'vocabulary'] as const).map((type) => (
          <LevelMeter
            key={type}
            type={type}
            counts={snapshot.currentLevel[type]}
          />
        ))}
        <Text
          style={[theme.typography.caption, { color: theme.colors.textMuted }]}
        >
          Each subject reaches Guru through spaced repetition.
        </Text>
      </Card>
    );
  }
  const total = Object.values(snapshot.srs).reduce(
    (sum, count) => sum + count,
    0,
  );
  return (
    <Card style={{ gap: 16 }}>
      <SectionLabel title="SRS distribution" detail={`${total} SUBJECTS`} />
      <View
        accessible
        accessibilityLabel={`SRS distribution. ${Object.entries(snapshot.srs)
          .map(([stage, count]) => `${stage}: ${count}`)
          .join(', ')}`}
        style={[
          styles.distribution,
          { backgroundColor: theme.colors.surfaceMuted },
        ]}
      >
        {Object.entries(snapshot.srs).map(([stage, count]) =>
          count === 0 ? null : (
            <View
              key={stage}
              style={{
                backgroundColor: srsColors[stage as keyof typeof srsColors],
                flex: count,
              }}
            />
          ),
        )}
      </View>
      <View style={styles.srsLegend}>
        {Object.entries(snapshot.srs).map(([stage, count]) => (
          <View key={stage} style={styles.srsItem}>
            <View
              style={[
                styles.dot,
                { backgroundColor: srsColors[stage as keyof typeof srsColors] },
              ]}
            />
            <Text
              style={[
                theme.typography.caption,
                { color: theme.colors.textMuted, textTransform: 'capitalize' },
              ]}
            >
              {stage}
            </Text>
            <Text
              style={[
                theme.typography.label,
                { color: theme.colors.text, fontVariant: ['tabular-nums'] },
              ]}
            >
              {count}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function CountAction({
  label,
  count,
  onPress,
}: {
  readonly label: 'Lessons' | 'Reviews';
  readonly count: number;
  readonly onPress?: () => void;
}) {
  const disabled = count === 0 || onPress === undefined;
  const color = label === 'Lessons' ? '#BF1D78' : '#6650C5';
  const Icon = label === 'Lessons' ? BookOpen : Repeat2;
  return (
    <Pressable
      accessibilityLabel={`Start ${label.toLowerCase()}`}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        {
          backgroundColor: color,
          opacity: disabled ? 0.55 : pressed ? 0.8 : 1,
        },
      ]}
    >
      <View style={styles.actionTop}>
        <Icon color="#FFFFFF" size={22} strokeWidth={1.6} />
        <ArrowUpRight size={19} color="#FFFFFF" />
      </View>
      <Text style={styles.actionCount}>{count}</Text>
      <Text style={styles.actionLabel}>{label}</Text>
      <Text style={styles.actionHint}>
        {count === 0
          ? 'All caught up'
          : label === 'Lessons'
            ? 'Learn something new'
            : 'Ready when you are'}
      </Text>
    </Pressable>
  );
}

function ReviewForecast({
  snapshot,
}: {
  readonly snapshot: DashboardSnapshot;
}) {
  const theme = useTheme();
  // Aggregate actual arrivals into four-hour windows; never invent empty activity.
  const buckets = Array.from({ length: 7 }, (_, index) => ({
    label: index === 0 ? 'Now' : `+${index * 4}h`,
    count: snapshot.reviewBuckets
      .filter(({ hoursFromNow }) => Math.ceil(hoursFromNow / 4) === index)
      .reduce((sum, { count }) => sum + count, 0),
  }));
  const maximum = Math.max(1, ...buckets.map(({ count }) => count));
  const total = buckets.reduce((sum, { count }) => sum + count, 0);
  return (
    <Card style={{ gap: 18 }}>
      <SectionLabel title="Next 24 hours" detail="REVIEW FORECAST" />
      <View
        accessible
        accessibilityLabel={`Next 24 hours. ${buckets.map(({ label, count }) => `${label}: ${count} reviews`).join(', ')}`}
        style={styles.forecast}
      >
        {buckets.map(({ label, count }, index) => (
          <View key={label} style={styles.forecastColumn}>
            <View
              style={[
                styles.forecastTrack,
                { backgroundColor: theme.colors.surfaceMuted },
              ]}
            >
              {count === 0 ? null : (
                <View
                  style={{
                    backgroundColor:
                      index === 0 ? theme.colors.accent : srsColors.guru,
                    borderRadius: 5,
                    height: `${(count / maximum) * 100}%`,
                    width: '100%',
                  }}
                />
              )}
            </View>
            <Text style={[styles.axisLabel, { color: theme.colors.textMuted }]}>
              {label}
            </Text>
          </View>
        ))}
      </View>
      <Text
        style={[theme.typography.caption, { color: theme.colors.textMuted }]}
      >
        {total === 0
          ? 'No reviews scheduled. Enjoy the breathing room.'
          : `${total} reviews available across the next 24 hours`}
      </Text>
    </Card>
  );
}

function LevelMeter({
  type,
  counts,
}: {
  readonly type: 'radical' | 'kanji' | 'vocabulary';
  readonly counts: LevelProgressSlice;
}) {
  const theme = useTheme();
  const label = {
    radical: 'Radicals',
    kanji: 'Kanji',
    vocabulary: 'Vocabulary',
  }[type];
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const color = subjectColors[type].background;
  return (
    <View style={{ gap: 9 }}>
      <View style={styles.meterTitle}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text
          style={[
            theme.typography.label,
            { color: theme.colors.text, flex: 1 },
          ]}
        >
          {label}
        </Text>
        <Text
          style={[
            theme.typography.caption,
            { color: theme.colors.textMuted, fontVariant: ['tabular-nums'] },
          ]}
        >
          {counts.guru} / {total}
        </Text>
      </View>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`${label}. ${counts.guru} guru, ${counts.apprentice} apprentice, ${counts.lesson} lessons, ${counts.locked} locked`}
        accessibilityValue={{
          min: 0,
          max: Math.max(1, total),
          now: counts.guru,
          text:
            total === 0 ? 'No subjects' : `${counts.guru} of ${total} at Guru`,
        }}
        style={[styles.meter, { backgroundColor: theme.colors.surfaceMuted }]}
      >
        <View
          style={{
            backgroundColor: color,
            height: '100%',
            width: `${total === 0 ? 0 : (counts.guru / total) * 100}%`,
          }}
        />

      </View>
    </View>
  );
}

function SectionLabel({
  title,
  detail,
}: {
  readonly title: string;
  readonly detail: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 3 }}>
      <Text
        accessibilityRole="header"
        style={[theme.typography.sectionTitle, { color: theme.colors.text }]}
      >
        {title}
      </Text>
      <Text
        style={[
          theme.typography.overline,
          { color: theme.colors.textMuted, fontSize: 9, letterSpacing: 1.1 },
        ]}
      >
        {detail}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  action: {
    borderCurve: 'continuous',
    borderRadius: 22,
    flex: 1,
    minWidth: 135,
    padding: 18,
  },
  actionTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  actionCount: {
    color: '#FFFFFF',
    fontSize: 44,
    fontWeight: '700',
    letterSpacing: -1.8,
    fontVariant: ['tabular-nums'],
  },
  actionLabel: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 2,
  },
  actionHint: { color: '#FFFFFF', fontSize: 11, lineHeight: 17, marginTop: 6 },
  pickerLink: {
    alignItems: 'center',
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  forecast: { flexDirection: 'row', gap: 13 },
  forecastColumn: { flex: 1, alignItems: 'center', gap: 10 },
  forecastTrack: {
    borderRadius: 5,
    height: 76,
    justifyContent: 'flex-end',
    width: '100%',
    overflow: 'hidden',
  },
  axisLabel: { fontSize: 10, fontWeight: '500' },
  meterTitle: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  meter: {
    borderRadius: 8,
    flexDirection: 'row',
    height: 7,
    overflow: 'hidden',
  },
  distribution: {
    borderRadius: 8,
    flexDirection: 'row',
    height: 12,
    overflow: 'hidden',
  },
  dot: { borderRadius: 3, height: 7, width: 7 },
  srsLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  srsItem: { alignItems: 'center', flexDirection: 'row', gap: 6 },
});
