import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from '@/ui/theme/ThemeProvider';

export interface DonutDatum {
  readonly color: string;
  readonly label: string;
  readonly value: number;
}

interface DonutChartProps {
  readonly data: readonly DonutDatum[];
  readonly summary: string;
  readonly title: string;
}

const SIZE = 144;
const CENTER = SIZE / 2;
const RADIUS = 48;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function DonutChart({
  data,
  summary,
  title,
}: DonutChartProps) {
  const theme = useTheme();
  const total = data.reduce((sum, { value }) => sum + value, 0);
  const segments = data.map((datum, index) => {
    if (total === 0) {
      return { datum, length: 0, offset: 0 };
    }
    const consumed = data
      .slice(0, index)
      .reduce(
        (sum, previous) =>
          sum + (previous.value / total) * CIRCUMFERENCE,
        0,
      );
    return {
      datum,
      length: (datum.value / total) * CIRCUMFERENCE,
      offset: -consumed,
    };
  });
  return (
    <View
      accessible
      accessibilityLabel={`${title}. ${summary}`}
      style={{ gap: theme.spacing.md }}
    >
      <Text
        accessibilityRole="header"
        selectable
        style={[
          theme.typography.sectionTitle,
          { color: theme.colors.text },
        ]}
      >
        {title}
      </Text>
      <Text
        selectable
        style={[theme.typography.caption, { color: theme.colors.textMuted }]}
      >
        {summary}
      </Text>
      {total === 0 ? null : (
        <Svg
          accessibilityElementsHidden
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          width="100%"
        >
          <Circle
            cx={CENTER}
            cy={CENTER}
            fill="none"
            r={RADIUS}
            stroke={theme.colors.surfaceMuted}
            strokeWidth={20}
          />
          {segments.map(({ datum, length, offset }) => {
            return (
              <Circle
                key={datum.label}
                cx={CENTER}
                cy={CENTER}
                fill="none"
                origin={`${CENTER}, ${CENTER}`}
                r={RADIUS}
                rotation={-90}
                stroke={datum.color}
                strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
                strokeDashoffset={offset}
                strokeWidth={20}
              />
            );
          })}
        </Svg>
      )}
      <View style={{ gap: theme.spacing.sm }}>
        {data.map(({ color, label, value }) => (
          <View
            key={label}
            style={{
              alignItems: 'center',
              flexDirection: 'row',
              gap: theme.spacing.sm,
            }}
          >
            <View
              accessibilityElementsHidden
              style={{
                backgroundColor: color,
                borderRadius: 999,
                height: 12,
                width: 12,
              }}
            />
            <Text
              selectable
              style={[
                theme.typography.caption,
                {
                  color: theme.colors.text,
                  fontVariant: ['tabular-nums'],
                },
              ]}
            >
              {label}: {value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
