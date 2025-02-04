import React from 'react';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  categoryAliases,
  displayNameOverrides,
  type Strategy,
  strategyDescriptions,
} from '@promptfoo/redteam/constants';
import type { EvaluateResult, GradingResult } from '@promptfoo/types';
import EvalOutputPromptDialog from '../../../eval/components/EvalOutputPromptDialog';
import PluginStrategyFlow from './PluginStrategyFlow';
import SuggestionsDialog from './SuggestionsDialog';
import { getStrategyIdFromGradingResult } from './shared';
import './RiskCategoryDrawer.css';

interface RiskCategoryDrawerProps {
  open: boolean;
  onClose: () => void;
  category: string;
  failures: {
    prompt: string;
    output: string;
    gradingResult?: GradingResult;
    result?: EvaluateResult;
  }[];
  passes: {
    prompt: string;
    output: string;
    gradingResult?: GradingResult;
    result?: EvaluateResult;
  }[];
  evalId: string;
  numPassed: number;
  numFailed: number;
  strategyStats: Record<string, { pass: number; total: number }>;
}

const PRIORITY_STRATEGIES = ['jailbreak:composite', 'pliny', 'prompt-injections'];

// Sort function for prioritizing specific strategies
function sortByPriorityStrategies(
  a: { gradingResult?: GradingResult },
  b: { gradingResult?: GradingResult },
): number {
  const strategyA = a.gradingResult ? getStrategyIdFromGradingResult(a.gradingResult) : '';
  const strategyB = b.gradingResult ? getStrategyIdFromGradingResult(b.gradingResult) : '';

  const priorityA = PRIORITY_STRATEGIES.indexOf(strategyA || '');
  const priorityB = PRIORITY_STRATEGIES.indexOf(strategyB || '');

  // If both have priority, sort by priority index
  if (priorityA !== -1 && priorityB !== -1) {
    return priorityA - priorityB;
  }
  // If only one has priority, it should come first
  if (priorityA !== -1) {
    return -1;
  }
  if (priorityB !== -1) {
    return 1;
  }
  // If neither has priority, maintain original order
  return 0;
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
  passes,
  evalId,
  numPassed,
  numFailed,
  strategyStats,
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

  const [activeTab, setActiveTab] = React.useState(0);
  const [detailsDialogOpen, setDetailsDialogOpen] = React.useState(false);
  const [selectedTest, setSelectedTest] = React.useState<{
    prompt: string;
    output: string;
    gradingResult?: GradingResult;
    result?: EvaluateResult;
  } | null>(null);

  const sortedFailures = React.useMemo(() => {
    return [...failures].sort(sortByPriorityStrategies);
  }, [failures]);

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: 750, p: 2 }} className="risk-category-drawer">
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

        <Tabs
          value={activeTab}
          onChange={(_, newValue) => setActiveTab(newValue)}
          sx={{ borderBottom: 1, borderColor: 'divider', mt: 2 }}
        >
          <Tab label={`Flagged Tests (${failures.length})`} />
          <Tab label={`Passed Tests (${passes.length})`} />
          <Tab label="Flow Diagram" />
        </Tabs>

        {activeTab === 0 ? (
          failures.length > 0 ? (
            <List>
              {sortedFailures.map((failure, index) => (
                <ListItem
                  key={index}
                  className="failure-item"
                  sx={{ position: 'relative', cursor: 'pointer' }}
                  onClick={() => {
                    setSelectedTest(failure);
                    setDetailsDialogOpen(true);
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', width: '100%' }}>
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography variant="subtitle1" className="prompt">
                        {getPromptDisplayString(failure.prompt)}
                      </Typography>
                      <Typography variant="body2" className="output">
                        {getOutputDisplay(failure.output)}
                      </Typography>
                      {failure.gradingResult &&
                        (() => {
                          const strategyId = getStrategyIdFromGradingResult(failure.gradingResult);
                          return (
                            strategyId && (
                              <Tooltip title={strategyDescriptions[strategyId as Strategy] || ''}>
                                <Chip
                                  size="small"
                                  label={
                                    displayNameOverrides[
                                      strategyId as keyof typeof displayNameOverrides
                                    ] || strategyId
                                  }
                                  sx={{ mt: 1 }}
                                />
                              </Tooltip>
                            )
                          );
                        })()}
                    </Box>
                    <Box
                      sx={{
                        display: 'flex',
                        opacity: 0,
                        transition: 'opacity 0.2s',
                        '.failure-item:hover &': {
                          opacity: 1,
                        },
                      }}
                    >
                      {failure.gradingResult?.componentResults?.some(
                        (result) => (result.suggestions?.length || 0) > 0,
                      ) && (
                        <IconButton
                          onClick={(e) => {
                            e.stopPropagation(); // Prevent list item click
                            setCurrentGradingResult(failure.gradingResult);
                            setSuggestionsDialogOpen(true);
                          }}
                          sx={{ ml: 1 }}
                        >
                          <LightbulbOutlinedIcon color="primary" />
                        </IconButton>
                      )}
                    </Box>
                  </Box>
                </ListItem>
              ))}
            </List>
          ) : (
            <Box sx={{ mt: 2, textAlign: 'center' }}>
              <Typography variant="body1">No failed tests</Typography>
            </Box>
          )
        ) : activeTab === 1 ? (
          passes.length > 0 ? (
            <List>
              {passes.map((pass, index) => (
                <ListItem key={index} className="failure-item">
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', width: '100%' }}>
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography variant="subtitle1" className="prompt">
                        {getPromptDisplayString(pass.prompt)}
                      </Typography>
                      <Typography variant="body2" className="output">
                        {getOutputDisplay(pass.output)}
                      </Typography>
                    </Box>
                  </Box>
                </ListItem>
              ))}
            </List>
          ) : (
            <Box sx={{ mt: 2, textAlign: 'center' }}>
              <Typography variant="body1">No passed tests</Typography>
            </Box>
          )
        ) : (
          <Box sx={{ mt: 2 }}>
            <Typography
              variant="h6"
              gutterBottom
              align="center"
              sx={{ mb: 3, color: 'text.primary' }}
            >
              Simulated User - Attack Performance
            </Typography>
            <PluginStrategyFlow
              failuresByPlugin={failures}
              passesByPlugin={passes}
              strategyStats={strategyStats}
            />
          </Box>
        )}
      </Box>
      <SuggestionsDialog
        open={suggestionsDialogOpen}
        onClose={() => setSuggestionsDialogOpen(false)}
        gradingResult={currentGradingResult}
      />
      <EvalOutputPromptDialog
        open={detailsDialogOpen}
        onClose={() => setDetailsDialogOpen(false)}
        prompt={selectedTest?.result?.prompt.raw || 'Unknown'}
        output={
          typeof selectedTest?.result?.response?.output === 'object'
            ? JSON.stringify(selectedTest?.result?.response?.output)
            : selectedTest?.result?.response?.output
        }
        gradingResults={selectedTest?.gradingResult ? [selectedTest.gradingResult] : undefined}
        metadata={selectedTest?.result?.metadata}
      />
    </Drawer>
  );
};

export default RiskCategoryDrawer;
