import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface AttackSuccessRateDataPoint {
  date: string;
  attackSuccessRate: number;
  successfulAttacks: number;
}

interface AttackSuccessRateChartProps {
  data: AttackSuccessRateDataPoint[];
}

export default function AttackSuccessRateChart({ data }: AttackSuccessRateChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
        <YAxis
          yAxisId="left"
          width={40}
          domain={[0, 100]}
          tickFormatter={(value) => `${value}%`}
          tick={{ fontSize: 12 }}
        />
        <YAxis yAxisId="right" orientation="right" width={40} tick={{ fontSize: 12 }} />
        <Tooltip
          formatter={(value: number | string, name: string) => {
            if (name === 'attackSuccessRate') {
              return [
                typeof value === 'number'
                  ? value.toLocaleString(undefined, {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    }) + '%'
                  : value,
                'Attack Success Rate',
              ];
            } else if (name === 'successfulAttacks') {
              return [value, 'Successful Attacks:'];
            }
            return [value, name];
          }}
        />
        <defs>
          <linearGradient id="attackSuccessRateGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f44336" stopOpacity={0.8} />
            <stop offset="95%" stopColor="#f44336" stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <Area
          yAxisId="left"
          type="monotone"
          dataKey="attackSuccessRate"
          stroke="#f44336"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#attackSuccessRateGradient)"
          dot={false}
          activeDot={{ r: 6, fill: '#d32f2f', stroke: '#fff', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
