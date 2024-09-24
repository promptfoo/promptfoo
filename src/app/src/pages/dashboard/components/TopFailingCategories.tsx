import React from 'react';
import type { StandaloneEval } from '@/../../../util';
import { categoryAliases, displayNameOverrides } from '@app/pages/report/components/constants';
import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import { processCategoryData } from './utils';

interface TopFailingCategoriesProps {
  evals: StandaloneEval[];
}

const TopFailingCategories: React.FC<TopFailingCategoriesProps> = ({ evals }) => {
  const categoryData = processCategoryData(evals);

  const sortedCategories = Object.entries(categoryData)
    .sort(([, a], [, b]) => b.currentFailCount - a.currentFailCount)
    .slice(0, 5);

  return (
    <>
      <Typography variant="h6" gutterBottom>
        Weakest Areas
      </Typography>
      <List>
        {sortedCategories.map(([category, data], index) => {
          const displayName =
            displayNameOverrides[category as keyof typeof displayNameOverrides] ||
            categoryAliases[category as keyof typeof categoryAliases] ||
            category;
          return (
            <ListItem key={index}>
              <Box sx={{ width: '100%' }}>
                <ListItemText
                  primary={displayName}
                  secondary={`${((data.currentFailCount / data.currentTotalCount) * 100).toFixed(1)}% failing (${data.currentFailCount}/${data.currentTotalCount} probes)`}
                />
                <LinearProgress
                  variant="determinate"
                  value={(data.currentFailCount / data.currentTotalCount) * 100}
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
