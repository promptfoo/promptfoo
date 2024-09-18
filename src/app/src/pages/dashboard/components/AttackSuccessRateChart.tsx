import React, { useMemo } from 'react';
import { Severity } from '@app/pages/report/components/constants';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

export interface AttackSuccessRateDataPoint {
  date: string;
  [Severity.Critical]: number;
  [Severity.High]: number;
  [Severity.Medium]: number;
  [Severity.Low]: number;
  total: number;
}

interface AttackSuccessRateChartProps {
  data: AttackSuccessRateDataPoint[];
}

export default function AttackSuccessRateChart({ data }: AttackSuccessRateChartProps) {
  const aggregatedData = useMemo(() => {
    const dataMap = new Map<string, AttackSuccessRateDataPoint>();

    data.forEach((point) => {
      if (dataMap.has(point.date)) {
        const existing = dataMap.get(point.date)!;
        existing[Severity.Critical] += point[Severity.Critical];
        existing[Severity.High] += point[Severity.High];
        existing[Severity.Medium] += point[Severity.Medium];
        existing[Severity.Low] += point[Severity.Low];
        existing.total += point.total;
      } else {
        dataMap.set(point.date, { ...point });
      }
    });

    return Array.from(dataMap.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
  }, [data]);

  const severityColors = {
    [Severity.Critical]: '#d32f2f',
    [Severity.High]: '#f57c00',
    [Severity.Medium]: '#fbc02d',
    [Severity.Low]: '#388e3c',
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={aggregatedData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10 }}
          type="category"
          tickFormatter={(value) => new Date(value).toLocaleDateString()}
        />
        <YAxis width={40} domain={[0, 'dataMax']} tick={{ fontSize: 12 }} />
        <Tooltip
          formatter={(value: number, name: string) => {
            return [value, name === 'total' ? 'Total' : name];
          }}
        />
        <Legend />
        {Object.values(Severity).map((severity) => (
          <Area
            key={severity}
            type="monotone"
            dataKey={severity}
            stackId="1"
            stroke={severityColors[severity]}
            fill={severityColors[severity]}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
