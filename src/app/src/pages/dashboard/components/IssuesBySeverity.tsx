import React from 'react';
import { Severity } from '@app/pages/report/components/constants';
import { Paper, Typography } from '@mui/material';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface IssuesBySeverityProps {
  severityCounts: Record<Severity, number>;
  totalIssues: number;
}

export default function IssuesBySeverity({ severityCounts, totalIssues }: IssuesBySeverityProps) {
  const data = [
    { severity: 'Critical', count: severityCounts[Severity.Critical] },
    { severity: 'High', count: severityCounts[Severity.High] },
    { severity: 'Medium', count: severityCounts[Severity.Medium] },
    { severity: 'Low', count: severityCounts[Severity.Low] },
  ].filter((item) => item.count > 0);

  const COLORS = {
    Critical: '#d32f2f',
    High: '#f57c00',
    Medium: '#fbc02d',
    Low: '#388e3c',
  };

  return (
    <Paper
      elevation={3}
      sx={{
        p: 3,
        display: 'flex',
        flexDirection: 'column',
        height: 350,
        borderRadius: 2,
      }}
    >
      <Typography variant="h6" gutterBottom>
        Issues by Severity
      </Typography>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="severity"
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={4}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[entry.severity as Severity]} stroke="none" />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, name) => [`${value} attack types`, `Severity ${name}`]}
            contentStyle={{
              backgroundColor: 'rgba(255, 255, 255, 0.8)',
              backdropFilter: 'blur(4px)',
              border: 'none',
              borderRadius: '8px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            }}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            iconType="circle"
            iconSize={10}
            formatter={(value) => <span style={{ color: '#666', fontSize: '12px' }}>{value}</span>}
          />
          <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
            <tspan x="50%" dy="-1em" fontSize="24" fontWeight="bold">
              {totalIssues}
            </tspan>
            <tspan x="50%" dy="1.2em" fontSize="14">
              total
            </tspan>
          </text>
        </PieChart>
      </ResponsiveContainer>
    </Paper>
  );
}
