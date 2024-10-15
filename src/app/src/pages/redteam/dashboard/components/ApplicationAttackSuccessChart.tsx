import React from 'react';
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

export interface ApplicationAttackSuccessDataPoint {
  date: string;
  applications: { [name: string]: number };
}

interface ApplicationAttackSuccessChartProps {
  data: ApplicationAttackSuccessDataPoint[];
}

export default function ApplicationAttackSuccessChart({
  data,
}: ApplicationAttackSuccessChartProps) {
  // Calculate aggregate totals for all applications
  const aggregateTotals: { [name: string]: number } = {};
  data.forEach((dataPoint) => {
    Object.entries(dataPoint.applications).forEach(([app, value]) => {
      aggregateTotals[app] = (aggregateTotals[app] || 0) + value;
    });
  });

  // Get top 3 applications based on aggregate totals
  const top3Apps = Object.entries(aggregateTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([app]) => app);

  const applications = ['Other', ...top3Apps];

  const processedData = data.map((dataPoint) => {
    const applications: { [key: string]: number } = {
      Other: 0,
    };

    // Initialize all top3Apps with 0
    top3Apps.forEach((app) => {
      applications[app] = 0;
    });

    Object.entries(dataPoint.applications).forEach(([app, value]) => {
      if (top3Apps.includes(app)) {
        applications[app] = value;
      } else {
        applications['Other'] += value;
      }
    });

    return {
      date: dataPoint.date,
      applications,
    };
  });

  const colors = ['#d0ed57', '#8884d8', '#82ca9d', '#ffc658'];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={processedData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10 }}
          tickFormatter={(value) => new Date(value).toLocaleDateString()}
        />
        <YAxis domain={[0, 'auto']} />
        <Legend />
        <Tooltip
          formatter={(value, name, props) => [value, name]}
          labelFormatter={(label) => new Date(label).toLocaleDateString()}
        />
        {applications.map((app, index) => (
          <Area
            key={app}
            type="monotone"
            dataKey={`applications.${app}`}
            stackId="1"
            stroke={colors[index % colors.length]}
            fill={colors[index % colors.length]}
            name={app}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
