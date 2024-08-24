import React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import { categoryAliases } from './constants';
import './RiskCategoryDrawer.css';

interface RiskCategoryDrawerProps {
  open: boolean;
  onClose: () => void;
  category: string;
  failures: { prompt: string; output: string }[];
  numPassed: number;
  numFailed: number;
  evalId: string;
}

function getPromptDisplayString(prompt: string): string {
  try {
    const parsedPrompt = JSON.parse(prompt);
    if (Array.isArray(parsedPrompt)) {
      const lastPrompt = parsedPrompt[parsedPrompt.length - 1];
      if (lastPrompt.content) {
        return lastPrompt.content;
      }
    }
  } catch (e) {}
  return prompt;
}

const RiskCategoryDrawer: React.FC<RiskCategoryDrawerProps> = ({
  open,
  onClose,
  category,
  failures,
  evalId,
  numPassed,
  numFailed,
}) => {
  const totalTests = numPassed + numFailed;
  const passPercentage = totalTests > 0 ? Math.round((numPassed / totalTests) * 100) : 0;

  if (totalTests === 0) {
    return (
      <Drawer anchor="right" open={open} onClose={onClose}>
        <Box sx={{ width: 500, p: 2 }} className="risk-category-drawer">
          <Typography variant="h6" gutterBottom>
            {categoryAliases[category as keyof typeof categoryAliases]}
          </Typography>
          <Typography variant="body1" sx={{ mt: 2, textAlign: 'center' }}>
            No tests have been run for this category.
          </Typography>
        </Box>
      </Drawer>
    );
  }

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: 500, p: 2 }} className="risk-category-drawer">
        <Typography variant="h6" gutterBottom>
          {categoryAliases[category as keyof typeof categoryAliases]}
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ textAlign: 'center', flex: 1 }}>
            <Typography variant="h4" color="primary">
              {numPassed.toString()}
            </Typography>
            <Typography variant="body2">Passed</Typography>
          </Box>
          <Box sx={{ textAlign: 'center', flex: 1 }}>
            <Typography variant="h4">{totalTests.toString()}</Typography>
            <Typography variant="body2">Total</Typography>
          </Box>
          <Box sx={{ textAlign: 'center', flex: 1 }}>
            <Typography variant="h4" color={passPercentage >= 70 ? 'success.main' : 'error.main'}>
              {`${passPercentage}%`}
            </Typography>
            <Typography variant="body2">Pass Rate</Typography>
          </Box>
        </Box>
        <Button
          variant="contained"
          color="inherit"
          fullWidth
          onClick={(event) => {
            const descriptiveName = categoryAliases[category as keyof typeof categoryAliases];
            const url = `/eval/?evalId=${evalId}&search=${encodeURIComponent(`(var=${descriptiveName}|metric=${descriptiveName})`)}`;
            if (event.ctrlKey || event.metaKey) {
              window.open(url, '_blank');
            } else {
              window.location.href = url;
            }
          }}
        >
          View All Logs
        </Button>
        {failures.length > 0 ? (
          <List>
            {failures.slice(0, 5).map((failure, index) => (
              <ListItem key={index} className="failure-item">
                <Box>
                  <Typography variant="subtitle1" className="prompt">
                    {getPromptDisplayString(failure.prompt)}
                  </Typography>
                  <Typography variant="body2" className="output">
                    {failure.output}
                  </Typography>
                </Box>
              </ListItem>
            ))}
          </List>
        ) : (
          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Typography variant="body1">All tests passed successfully</Typography>
          </Box>
        )}
      </Box>
    </Drawer>
  );
};

export default RiskCategoryDrawer;
