import React from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import ApplicationAttackSuccessChart, {
  type ApplicationAttackSuccessDataPoint,
} from './ApplicationAttackSuccessChart';
import AttackSuccessRateChart, { type AttackSuccessRateDataPoint } from './AttackSuccessRateChart';
import IssuesResolvedChart, { type IssuesResolvedDataPoint } from './IssuesResolvedChart';

interface DashboardChartsProps {
  attackSuccessRateData: AttackSuccessRateDataPoint[];
  issuesResolvedData: IssuesResolvedDataPoint[];
  applicationAttackSuccessData: ApplicationAttackSuccessDataPoint[];
  activeChart: 'attackSuccess' | 'issuesResolved' | 'applicationSuccess';
  setActiveChart: (value: 'attackSuccess' | 'issuesResolved' | 'applicationSuccess') => void;
}

export default function DashboardCharts({
  attackSuccessRateData,
  issuesResolvedData,
  applicationAttackSuccessData,
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
            : activeChart === 'issuesResolved'
              ? 'Issues Resolved Over Time'
              : 'Successful Attacks by Application'}
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
          <ToggleButton value="attackSuccess">Severity</ToggleButton>
          <ToggleButton value="applicationSuccess">Applications</ToggleButton>
          <ToggleButton value="issuesResolved">Resolutions</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {activeChart === 'attackSuccess' ? (
        <AttackSuccessRateChart data={attackSuccessRateData} />
      ) : activeChart === 'issuesResolved' ? (
        <IssuesResolvedChart data={issuesResolvedData} />
      ) : (
        <ApplicationAttackSuccessChart data={applicationAttackSuccessData} />
      )}
    </Paper>
  );
}
