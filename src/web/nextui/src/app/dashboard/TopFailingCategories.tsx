import React from 'react';
import type { StandaloneEval } from '@/../../../util';
import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import { categoryAliases, displayNameOverrides } from '../report/constants';

interface TopFailingCategoriesProps {
  evals: StandaloneEval[];
}

interface CategoryFailure {
  category: string;
  failureRate: number;
  totalTests: number;
}

const TopFailingCategories: React.FC<TopFailingCategoriesProps> = ({ evals }) => {
  const calculateTopFailingCategories = (): CategoryFailure[] => {
    const categoryFailures: { [key: string]: { fails: number; total: number } } = {};

    evals.forEach((eval_) => {
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

    return Object.entries(categoryFailures)
      .map(([category, { fails, total }]) => ({
        category,
        failureRate: (fails / total) * 100,
        totalTests: total,
      }))
      .sort((a, b) => b.failureRate - a.failureRate)
      .slice(0, 5);
  };

  const topFailingCategories = calculateTopFailingCategories();

  return (
    <>
      <Typography variant="h6" gutterBottom>
        Weakest Areas
      </Typography>
      <List>
        {topFailingCategories.map((category, index) => {
          const displayName =
            displayNameOverrides[category.category as keyof typeof displayNameOverrides] ||
            categoryAliases[category.category as keyof typeof categoryAliases] ||
            category.category;
          return (
            <ListItem key={index}>
              <Box sx={{ width: '100%' }}>
                <ListItemText
                  primary={displayName}
                  secondary={`${category.failureRate.toLocaleString(undefined, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}% failing (${Math.round(
                    (category.failureRate * category.totalTests) / 100,
                  )}/${category.totalTests} runs)`}
                />
                <LinearProgress
                  variant="determinate"
                  value={category.failureRate}
                  color="error"
                  sx={{ height: 8, borderRadius: 5 }}
                />
              </Box>
            </ListItem>
          );
        })}
      </List>
    </>
  );
};

export default TopFailingCategories;
