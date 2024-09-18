import React from 'react';
import {
  categoryAliases,
  displayNameOverrides,
  subCategoryDescriptions,
} from '@app/pages/report/components/constants';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { StandaloneEval } from '@promptfoo/util';
import { processCategoryData, calculateTrend } from './utils';

interface EmergingRisksProps {
  evals: StandaloneEval[];
}

const EmergingRisks: React.FC<EmergingRisksProps> = ({ evals }) => {
  const categoryData = processCategoryData(evals);

  const emergingRisks = Object.entries(categoryData)
    .filter(
      ([, data]) =>
        data.currentTotalCount > 0 &&
        data.historicalTotalCount > 0 &&
        data.historicalPassCount > data.currentPassCount,
    )
    .sort(([, a], [, b]) => b.historicalChange - a.historicalChange)
    .slice(0, 5);

  return (
    <Paper elevation={3} sx={{ p: 3, borderRadius: 2 }}>
      <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
        Trending Risks
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {emergingRisks.map(([category, data], index) => {
          const displayName =
            displayNameOverrides[category as keyof typeof displayNameOverrides] ||
            categoryAliases[category as keyof typeof categoryAliases] ||
            category;
          const trend = calculateTrend(
            data.currentFailCount / data.currentTotalCount,
            data.historicalFailCount / data.historicalTotalCount,
            true /* more is bad */,
          );
          return (
            <Box
              key={index}
              sx={{
                flexGrow: 1,
                flexBasis: '0',
                minWidth: '200px',
                maxWidth: '300px',
                p: 2,
                borderRadius: 2,
                bgcolor: '#f8f8f8',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              }}
            >
              <Box
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <Box display="flex" alignItems="center" mb={1}>
                  <Tooltip
                    title={
                      subCategoryDescriptions[category as keyof typeof subCategoryDescriptions]
                    }
                    arrow
                  >
                    <Typography
                      variant="subtitle1"
                      sx={{
                        flexGrow: 1,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {displayName}
                    </Typography>
                  </Tooltip>
                  <Tooltip title="Increasing failure rate" arrow>
                    <TrendingUpIcon color="error" />
                  </Tooltip>
                </Box>
                <Box
                  sx={{
                    flexGrow: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <Typography variant="body2">
                    Recent: {((data.currentFailCount / data.currentTotalCount) * 100).toFixed(1)}%
                    passed probes
                  </Typography>
                  <Typography variant="body2">
                    Historical:{' '}
                    {((data.historicalFailCount / data.historicalTotalCount) * 100).toFixed(1)}%
                    passed probes
                  </Typography>
                  {trend.value === Infinity ? (
                    <Typography variant="body2" color="error">
                      New failures
                    </Typography>
                  ) : (
                    <Typography
                      variant="body2"
                      color={trend.sentiment === 'bad' ? 'error' : 'success'}
                    >
                      {trend.value.toLocaleString(undefined, {
                        style: 'percent',
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}{' '}
                      {trend.direction === 'up' ? 'increase' : 'decrease'} in failures
                    </Typography>
                  )}
                </Box>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
};

export default EmergingRisks;
