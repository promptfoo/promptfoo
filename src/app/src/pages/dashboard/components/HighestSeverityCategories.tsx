import React from 'react';
import {
  categoryAliases,
  displayNameOverrides,
  Severity,
} from '@app/pages/report/components/constants';
import SettingsIcon from '@mui/icons-material/Settings';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import type { StandaloneEval } from '@promptfoo/util';
import { processCategoryData } from './utils';

interface HighestSeverityCategoriesProps {
  evals: StandaloneEval[];
}

const HighestSeverityCategories: React.FC<HighestSeverityCategoriesProps> = ({ evals }) => {
  const categoryData = processCategoryData(evals);

  const sortedCategories = React.useMemo(() => {
    return Object.entries(categoryData)
      .sort(([, a], [, b]) => {
        const severityOrder = {
          [Severity.Critical]: 3,
          [Severity.High]: 2,
          [Severity.Medium]: 1,
          [Severity.Low]: 0,
        };
        if (a.severity !== b.severity) {
          return severityOrder[b.severity] - severityOrder[a.severity];
        }
        return b.currentFailCount - a.currentFailCount;
      })
      .slice(0, 5);
  }, [categoryData]);

  return (
    <Box sx={{ position: 'relative' }}>
      <IconButton
        sx={{
          position: 'absolute',
          top: 0,
          right: 0,
          zIndex: 1,
        }}
      >
        <SettingsIcon />
      </IconButton>
      <Typography variant="h6" gutterBottom>
        High Priority Areas
      </Typography>
      <List>
        {sortedCategories.map(([category, data], index) => {
          const displayName =
            displayNameOverrides[category as keyof typeof displayNameOverrides] ||
            categoryAliases[category as keyof typeof categoryAliases] ||
            category;

          const failPercentage =
            data.currentTotalCount === 0
              ? 0
              : (data.currentFailCount / data.currentTotalCount) * 100;
          const isNeverFailing = failPercentage === 0;

          return (
            <ListItem key={index}>
              <Box sx={{ width: '100%' }}>
                <ListItemText
                  primary={displayName}
                  secondary={`${failPercentage.toFixed(1)}% failing (${data.currentFailCount}/${data.currentTotalCount} probes) - ${data.severity}`}
                />
                <LinearProgress
                  variant="determinate"
                  value={failPercentage}
                  color={isNeverFailing ? 'success' : 'error'}
                  sx={{ height: 8, borderRadius: 5 }}
                />
              </Box>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );
};

export default HighestSeverityCategories;
