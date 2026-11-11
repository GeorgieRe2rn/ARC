import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';
import { down, hairline, muted, sheet, up } from '../theme';

export default function MarketChart({ closes, rising, height = 176 }: { closes: number[]; rising: boolean; height?: number }) {
  const [width, setWidth] = useState(0);
  const color = rising ? up : down;
  const geometry = useMemo(() => {
    if (width < 20 || closes.length < 2) return null;
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const span = max - min || Math.abs(max) * 0.02 || 1;
    const left = 4;
    const right = width - 58;
    const top = 14;
    const bottom = height - 12;
    const points = closes.map((value, index) => {
      const x = left + (index / (closes.length - 1)) * (right - left);
      const y = bottom - ((value - min) / span) * (bottom - top);
      return { x, y };
    });
    const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
    const area = `${line} L${right.toFixed(2)} ${bottom} L${left} ${bottom} Z`;
    return { min, max, left, right, top, bottom, line, area };
  }, [closes, width, height]);

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ height, borderWidth: 1, borderColor: hairline, borderRadius: 18, overflow: 'hidden', backgroundColor: sheet }}>
      {geometry && (
        <Svg width={width} height={height}>
          {[0.25, 0.5, 0.75].map((step) => {
            const y = geometry.top + (geometry.bottom - geometry.top) * step;
            return <Line key={step} x1={geometry.left} y1={y} x2={geometry.right} y2={y} stroke={hairline} strokeWidth={1} />;
          })}
          <Path d={geometry.area} fill={color} opacity={0.1} />
          <Path d={geometry.line} fill="none" stroke={color} strokeWidth={1.6} />
          <SvgText x={width - 6} y={geometry.top + 4} fill={muted} fontSize={10} textAnchor="end">{formatTick(geometry.max)}</SvgText>
          <SvgText x={width - 6} y={geometry.bottom} fill={muted} fontSize={10} textAnchor="end">{formatTick(geometry.min)}</SvgText>
        </Svg>
      )}
    </View>
  );
}

function formatTick(value: number) {
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  if (Math.abs(value) >= 100) return value.toFixed(1);
  return value.toFixed(2);
}

export function Spark({ closes, rising }: { closes: number[]; rising: boolean }) {
  const width = 76;
  const height = 28;
  if (closes.length < 2) return <View style={{ width, height }} />;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const line = closes.map((value, index) => {
    const x = (index / (closes.length - 1)) * width;
    const y = height - 3 - ((value - min) / span) * (height - 6);
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
  return (
    <Svg width={width} height={height}>
      <Path d={line} fill="none" stroke={rising ? up : down} strokeWidth={1.4} />
    </Svg>
  );
}
