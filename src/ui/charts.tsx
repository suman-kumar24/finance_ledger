/**
 * Hand-built charts on react-native-svg. Each chart is one accessible
 * element with a spoken summary; the numbers are repeated as text below it
 * by the screen, so nothing depends on seeing colour.
 */
import { View } from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';

import { niceMax } from '@/domain/reports';

import { T } from './kit';
import { space, useTheme } from './theme';

/** A progress ring with content in the middle. */
export function Ring({
  fraction,
  size = 72,
  stroke = 8,
  color,
  label,
  children,
}: {
  fraction: number;
  size?: number;
  stroke?: number;
  color?: string;
  label: string;
  children?: React.ReactNode;
}) {
  const c = useTheme();
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={c.track}
          strokeWidth={stroke}
          fill="none"
        />
        {clamped > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color ?? c.accent}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circumference * clamped} ${circumference}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      {children}
    </View>
  );
}

export interface BarSeries {
  key: string;
  label: string;
  color: string;
}

export interface BarGroup {
  label: string;
  /** One value per series, in minor units (negatives are drawn as zero). */
  values: number[];
  highlighted?: boolean;
}

/** Grouped vertical bars, e.g. spending vs income vs saved per month. */
export function GroupedBars({
  groups,
  series,
  height = 180,
  formatAxis,
  summary,
}: {
  groups: BarGroup[];
  series: BarSeries[];
  height?: number;
  formatAxis: (value: number) => string;
  summary: string;
}) {
  const c = useTheme();
  const max = niceMax(Math.max(1, ...groups.flatMap((g) => g.values.map((v) => Math.max(0, v)))));
  const chartHeight = height - 22;
  const gridLines = [0, 0.5, 1];
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={summary}
      style={{ gap: space.sm }}
    >
      <View style={{ flexDirection: 'row', height }}>
        <View style={{ width: 44, height: chartHeight, justifyContent: 'space-between' }}>
          {[...gridLines].reverse().map((g) => (
            <T
              key={g}
              variant="caption"
              tone="muted"
              numeric
              maxFontSizeMultiplier={1.2}
              style={{ fontSize: 10.5, lineHeight: 12 }}
            >
              {formatAxis(max * g)}
            </T>
          ))}
        </View>
        <View style={{ flex: 1 }}>
          <Svg width="100%" height={chartHeight} style={{ position: 'absolute' }}>
            {gridLines.map((g) => (
              <Line
                key={g}
                x1="0"
                x2="100%"
                y1={Math.max(0.5, chartHeight * (1 - g) - 0.5)}
                y2={Math.max(0.5, chartHeight * (1 - g) - 0.5)}
                stroke={c.border}
                strokeWidth={1}
              />
            ))}
          </Svg>
          <View style={{ flexDirection: 'row', flex: 1 }}>
            {groups.map((group) => (
              <View key={group.label} style={{ flex: 1, alignItems: 'center' }}>
                <View
                  style={{
                    height: chartHeight,
                    flexDirection: 'row',
                    alignItems: 'flex-end',
                    gap: 2,
                  }}
                >
                  {group.values.map((value, i) => {
                    const h = Math.max(
                      value > 0 ? 2 : 0,
                      (Math.max(0, value) / max) * (chartHeight - 4),
                    );
                    return (
                      <Svg key={series[i]?.key ?? i} width={7} height={h}>
                        <Rect
                          x={0}
                          y={0}
                          width={7}
                          height={h}
                          rx={2}
                          fill={series[i]?.color ?? c.accent}
                        />
                      </Svg>
                    );
                  })}
                </View>
                <T
                  variant="caption"
                  tone={group.highlighted ? 'accent' : 'muted'}
                  maxFontSizeMultiplier={1.2}
                  numberOfLines={1}
                  style={{
                    fontSize: 10.5,
                    lineHeight: 20,
                    fontWeight: group.highlighted ? '700' : '400',
                  }}
                >
                  {group.label}
                </T>
              </View>
            ))}
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
        {series.map((s) => (
          <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: s.color }} />
            <T variant="caption" tone="muted">
              {s.label}
            </T>
          </View>
        ))}
      </View>
    </View>
  );
}
