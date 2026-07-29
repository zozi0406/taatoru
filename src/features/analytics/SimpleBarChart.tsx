import { Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import type { ChartDatum } from './calculations';
import { useTheme } from '@/ui/theme/ThemeProvider';

interface SimpleBarChartProps {
  readonly data: readonly ChartDatum[];
  readonly summary: string;
  readonly title: string;
}

const CHART_WIDTH = 320;
const CHART_HEIGHT = 140;
const BAR_GAP = 8;

export function SimpleBarChart({
  data,
  summary,
  title,
}: SimpleBarChartProps) {
  const theme = useTheme();
  const maximum = Math.max(1, ...data.map(({ value }) => value));
  const barWidth =
    data.length === 0
      ? 0
      : (CHART_WIDTH - BAR_GAP * Math.max(0, data.length - 1)) / data.length;
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
      {data.length === 0 ? null : (
        <Svg
          accessibilityElementsHidden
          height={CHART_HEIGHT}
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          width="100%"
        >
          {data.map(({ label, value }, index) => {
            const height = (value / maximum) * CHART_HEIGHT;
            return (
              <Rect
                key={label}
                fill={theme.colors.accent}
                height={height}
                rx={4}
                width={barWidth}
                x={index * (barWidth + BAR_GAP)}
                y={CHART_HEIGHT - height}
              />
            );
          })}
        </Svg>
      )}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: theme.spacing.md,
        }}
      >
        {data.map(({ label, value }) => (
          <Text
            key={label}
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
        ))}
      </View>
    </View>
  );
}
