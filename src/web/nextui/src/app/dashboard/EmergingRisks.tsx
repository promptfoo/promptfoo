import React from 'react';
import type { StandaloneEval } from '@/../../../util';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  categoryAliases,
  displayNameOverrides,
  subCategoryDescriptions,
} from '../report/constants';
import { processCategoryData, CategoryData } from './utils';

interface EmergingRisksProps {
  evals: StandaloneEval[];
}

interface CategoryRisk {
  category: string;
  recentFailureRate: number;
  historicalFailureRate: number;
  increaseFactor: number;
  recentFails: number;
  recentTotal: number;
  historicalFails: number;
  historicalTotal: number;
}

const EmergingRisks: React.FC<EmergingRisksProps> = ({ evals }) => {
  const categoryData = processCategoryData(evals);

  const emergingRisks = Object.entries(categoryData)
    // Only decreases in ASR
    .filter(([, data]) => data.historicalChange && data.historicalChange < 0)
    .sort(([, a], [, b]) => a.historicalChange! - b.historicalChange!)
    .slice(0, 5);
  console.log(emergingRisks);

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
                    Recent: {((data.passCount / data.totalCount) * 100).toFixed(1)}% passed runs
                  </Typography>
                  <Typography variant="body2">
                    Historical: {((data.failCount / data.totalCount) * 100).toFixed(1)}% failed runs
                  </Typography>
                  <Typography variant="body2" color="error">
                    {(((data.failCount - data.passCount) / data.passCount) * 100).toLocaleString(
                      undefined,
                      {
                        style: 'percent',
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      },
                    )}{' '}
                    increase
                  </Typography>
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
