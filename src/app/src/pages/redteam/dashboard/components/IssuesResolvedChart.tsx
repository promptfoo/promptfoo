import React, { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export interface IssuesResolvedDataPoint {
  date: string;
  resolved: number;
}

interface IssuesResolvedChartProps {
  data: IssuesResolvedDataPoint[];
}

export default function IssuesResolvedChart({ data }: IssuesResolvedChartProps) {
  const aggregatedData = useMemo(() => {
    const dataMap = new Map<string, IssuesResolvedDataPoint>();

    data.forEach((point) => {
      if (dataMap.has(point.date)) {
        const existing = dataMap.get(point.date)!;
        existing.resolved += point.resolved;
      } else {
        dataMap.set(point.date, { ...point });
      }
    });

    return Array.from(dataMap.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
  }, [data]);

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
        <YAxis width={40} tick={{ fontSize: 12 }} />
        <Tooltip formatter={(value: number) => [value, 'Issues Resolved']} />
        <defs>
          <linearGradient id="issuesResolvedGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#4caf50" stopOpacity={0.8} />
            <stop offset="95%" stopColor="#4caf50" stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="resolved"
          stroke="#4caf50"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#issuesResolvedGradient)"
          dot={false}
          activeDot={{ r: 6, fill: '#2e7d32', stroke: '#fff', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
