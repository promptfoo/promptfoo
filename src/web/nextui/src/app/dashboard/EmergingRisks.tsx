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

interface EmergingRisksProps {
  evals: StandaloneEval[];
}

interface CategoryRisk {
  category: string;
  recentFailureRate: number;
  historicalFailureRate: number;
  increaseFactor: number;
}

const EmergingRisks: React.FC<EmergingRisksProps> = ({ evals }) => {
  const calculateEmergingRisks = (): CategoryRisk[] => {
    const recentEvals = evals.slice(0, Math.ceil(evals.length / 3));
    const historicalEvals = evals.slice(Math.ceil(evals.length / 3));

    const calculateFailureRate = (evalSet: StandaloneEval[]) => {
      const categoryFailures: { [key: string]: { fails: number; total: number } } = {};

      evalSet.forEach((eval_) => {
        Object.entries(eval_.metrics?.namedScores || {}).forEach(([scoreName, score]) => {
          const category = Object.keys(categoryAliases).find(
            (key) => categoryAliases[key as keyof typeof categoryAliases] === scoreName,
          );
          if (category) {
            if (!categoryFailures[category]) {
              categoryFailures[category] = { fails: 0, total: 0 };
            }
            categoryFailures[category].total++;
            if (score <= 0) {
              categoryFailures[category].fails++;
            }
          }
        });
      });

      return Object.entries(categoryFailures).reduce(
        (acc, [category, { fails, total }]) => {
          acc[category] = fails / total;
          return acc;
        },
        {} as { [key: string]: number },
      );
    };

    const recentFailureRates = calculateFailureRate(recentEvals);
    const historicalFailureRates = calculateFailureRate(historicalEvals);

    const emergingRisks = Object.keys(recentFailureRates).map((category) => ({
      category,
      recentFailureRate: recentFailureRates[category],
      historicalFailureRate: historicalFailureRates[category] || 0,
      increaseFactor:
        (recentFailureRates[category] - (historicalFailureRates[category] || 0)) /
        (historicalFailureRates[category] || 0.01),
    }));

    return emergingRisks
      .filter((risk) => risk.increaseFactor > 0.1) // Only show risks with at least 10% increase
      .sort((a, b) => b.increaseFactor - a.increaseFactor)
      .slice(0, 5);
  };

  const emergingRisks = calculateEmergingRisks();

  return (
    <>
      <Typography variant="h6" gutterBottom>
        Emerging Risks
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {emergingRisks.map((risk, index) => {
          const displayName =
            displayNameOverrides[risk.category as keyof typeof displayNameOverrides] ||
            categoryAliases[risk.category as keyof typeof categoryAliases] ||
            risk.category;
          return (
            <Paper
              key={index}
              elevation={2}
              sx={{
                flexGrow: 1,
                flexBasis: '0',
                minWidth: '200px',
                maxWidth: '300px',
                p: 2,
                borderRadius: 2,
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
                      subCategoryDescriptions[risk.category as keyof typeof subCategoryDescriptions]
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
                    Recent:{' '}
                    {risk.recentFailureRate.toLocaleString(undefined, {
                      style: 'percent',
                      minimumFractionDigits: 2,
                    })}
                  </Typography>
                  <Typography variant="body2">
                    Historical:{' '}
                    {risk.historicalFailureRate.toLocaleString(undefined, {
                      style: 'percent',
                      minimumFractionDigits: 2,
                    })}
                  </Typography>
                  <Typography variant="body2" color="error">
                    {risk.increaseFactor.toLocaleString(undefined, {
                      style: 'percent',
                      minimumFractionDigits: 2,
                    })}{' '}
                    increase
                  </Typography>
                </Box>
              </Box>
            </Paper>
          );
        })}
      </Box>
    </>
  );
};

export default EmergingRisks;
