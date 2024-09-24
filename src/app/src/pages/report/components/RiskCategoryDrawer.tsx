import React from 'react';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Typography from '@mui/material/Typography';
import type { GradingResult } from '@promptfoo/types';
import SuggestionsDialog from './SuggestionsDialog';
import { categoryAliases, displayNameOverrides } from './constants';
import './RiskCategoryDrawer.css';

interface RiskCategoryDrawerProps {
  open: boolean;
  onClose: () => void;
  category: string;
  failures: { prompt: string; output: string; gradingResult?: GradingResult }[];
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
        return lastPrompt.content || '-';
      }
    }
  } catch {
    // Ignore error
  }
  return prompt;
}

function getOutputDisplay(output: string | object) {
  if (typeof output === 'string') {
    return output;
  }
  if (Array.isArray(output)) {
    const items = output.filter((item) => item.type === 'function');
    if (items.length > 0) {
      return (
        <>
          {items.map((item) => (
            <div key={item.id}>
              <strong>Used tool {item.function?.name}</strong>: ({item.function?.arguments})
            </div>
          ))}
        </>
      );
    }
  }
  return JSON.stringify(output);
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
  const categoryName = categoryAliases[category as keyof typeof categoryAliases];
  if (!categoryName) {
    console.error('[RiskCategoryDrawer] Could not load category', category);
    return null;
  }

  const displayName =
    displayNameOverrides[category as keyof typeof displayNameOverrides] || categoryName;

  const totalTests = numPassed + numFailed;
  const passPercentage = totalTests > 0 ? Math.round((numPassed / totalTests) * 100) : 0;

  if (totalTests === 0) {
    return (
      <Drawer anchor="right" open={open} onClose={onClose}>
        <Box sx={{ width: 500, p: 2 }} className="risk-category-drawer">
          <Typography variant="h6" gutterBottom>
            {displayName}
          </Typography>
          <Typography variant="body1" sx={{ mt: 2, textAlign: 'center' }}>
            No tests have been run for this category.
          </Typography>
        </Box>
      </Drawer>
    );
  }

  const [suggestionsDialogOpen, setSuggestionsDialogOpen] = React.useState(false);
  const [currentGradingResult, setCurrentGradingResult] = React.useState<GradingResult | undefined>(
    undefined,
  );

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: 500, p: 2 }} className="risk-category-drawer">
        <Typography variant="h6" gutterBottom>
          {displayName}
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
            const url = `/eval/?evalId=${evalId}&search=${encodeURIComponent(`(var=${categoryName}|metric=${categoryName})`)}`;
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
          <>
            <Typography variant="h6" className="failed-tests-header">
              Flagged Tests
            </Typography>
            <List>
              {failures.slice(0, 5).map((failure, index) => (
                <ListItem key={index} className="failure-item">
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', width: '100%' }}>
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography variant="subtitle1" className="prompt">
                        {getPromptDisplayString(failure.prompt)}
                      </Typography>
                      <Typography variant="body2" className="output">
                        {getOutputDisplay(failure.output)}
                      </Typography>
                    </Box>
                    {failure.gradingResult?.componentResults?.some(
                      (result) => (result.suggestions?.length || 0) > 0,
                    ) && (
                      <IconButton
                        onClick={() => {
                          setCurrentGradingResult(failure.gradingResult);
                          setSuggestionsDialogOpen(true);
                        }}
                        sx={{ ml: 1 }}
                      >
                        <LightbulbOutlinedIcon color="primary" />
                      </IconButton>
                    )}
                  </Box>
                </ListItem>
              ))}
            </List>
          </>
        ) : (
          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Typography variant="body1">All tests passed successfully</Typography>
          </Box>
        )}
      </Box>
      <SuggestionsDialog
        open={suggestionsDialogOpen}
        onClose={() => setSuggestionsDialogOpen(false)}
        gradingResult={currentGradingResult}
      />
    </Drawer>
  );
};

export default RiskCategoryDrawer;
