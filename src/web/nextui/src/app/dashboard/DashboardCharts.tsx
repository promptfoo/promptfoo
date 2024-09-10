import React from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import AttackSuccessRateChart, { type AttackSuccessRateDataPoint } from './AttackSuccessRateChart';
import IssuesResolvedChart, { type IssuesResolvedDataPoint } from './IssuesResolvedChart';

interface DashboardChartsProps {
  attackSuccessRateData: AttackSuccessRateDataPoint[];
  issuesResolvedData: IssuesResolvedDataPoint[];
  activeChart: 'attackSuccess' | 'issuesResolved';
  setActiveChart: (value: 'attackSuccess' | 'issuesResolved') => void;
}

export default function DashboardCharts({
  attackSuccessRateData,
  issuesResolvedData,
  activeChart,
  setActiveChart,
}: DashboardChartsProps) {
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
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
        }}
      >
        <Typography variant="h6">
          {activeChart === 'attackSuccess'
            ? 'Attack Success Over Time'
            : 'Issues Resolved Over Time'}
        </Typography>
        <ToggleButtonGroup
          value={activeChart}
          exclusive
          onChange={(event, newValue) => {
            if (newValue !== null) {
              setActiveChart(newValue);
            }
          }}
          size="small"
        >
          <ToggleButton value="attackSuccess">Attacks</ToggleButton>
          <ToggleButton value="issuesResolved">Resolutions</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {activeChart === 'attackSuccess' ? (
        <AttackSuccessRateChart data={attackSuccessRateData} />
      ) : (
        <IssuesResolvedChart data={issuesResolvedData} />
      )}
    </Paper>
  );
}
