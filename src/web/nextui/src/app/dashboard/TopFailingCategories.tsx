import React from 'react';
import type { StandaloneEval } from '@/../../../util';
import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import { categoryAliases, displayNameOverrides } from '../report/constants';
import { processCategoryData, CategoryData } from './utils';

interface TopFailingCategoriesProps {
  evals: StandaloneEval[];
}

const TopFailingCategories: React.FC<TopFailingCategoriesProps> = ({ evals }) => {
  const categoryData = processCategoryData(evals);

  const sortedCategories = Object.entries(categoryData)
    .sort(([, a], [, b]) => b.failCount - a.failCount)
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
                  secondary={`${((data.failCount / data.totalCount) * 100).toFixed(1)}% failing (${data.failCount}/${data.totalCount} runs)`}
                />
                <LinearProgress
                  variant="determinate"
                  value={(data.failCount / data.totalCount) * 100}
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
