import React from 'react';
import CheckIcon from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { Tabs, Tab, List, ListItem } from '@mui/material';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Drawer from '@mui/material/Drawer';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import LinearProgress, { linearProgressClasses } from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import type { TypographyProps } from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { alpha } from '@mui/material/styles';
import { styled } from '@mui/system';
import { displayNameOverrides, subCategoryDescriptions } from '@promptfoo/redteam/constants';
import type { GradingResult } from '@promptfoo/types';
import { getStrategyIdFromGradingResult } from './shared';
import './StrategyStats.css';

interface StrategyStatsProps {
  strategyStats: Record<string, { pass: number; total: number }>;
  failuresByPlugin?: Record<
    string,
    { prompt: string; output: string; gradingResult?: GradingResult }[]
  >;
  passesByPlugin?: Record<
    string,
    { prompt: string; output: string; gradingResult?: GradingResult }[]
  >;
}

const DangerLinearProgress = styled(LinearProgress)(({ theme }) => ({
  height: 10,
  borderRadius: 5,
  [`&.${linearProgressClasses.colorPrimary}`]: {
    backgroundColor:
      theme.palette.mode === 'light'
        ? alpha(theme.palette.error.main, 0.1)
        : alpha(theme.palette.error.dark, 0.2),
  },
  [`& .${linearProgressClasses.bar}`]: {
    borderRadius: 5,
    backgroundColor:
      theme.palette.mode === 'light' ? theme.palette.error.main : theme.palette.error.light,
    transition: 'transform 1s cubic-bezier(0.4, 0, 0.2, 1)',
    backgroundImage: `linear-gradient(45deg, 
      rgba(255, 255, 255, 0.15) 25%, 
      transparent 25%, 
      transparent 50%, 
      rgba(255, 255, 255, 0.15) 50%, 
      rgba(255, 255, 255, 0.15) 75%, 
      transparent 75%, 
      transparent
    )`,
    backgroundSize: '40px 40px',
    animation: 'progress-bar-stripes 1s linear infinite',
  },
  '@keyframes progress-bar-stripes': {
    '0%': { backgroundPosition: '40px 0' },
    '100%': { backgroundPosition: '0 0' },
  },
}));

const CodeBlock = styled(Typography)(({ theme }) => ({
  padding: theme.spacing(1.5),
  backgroundColor:
    theme.palette.mode === 'dark'
      ? alpha(theme.palette.common.black, 0.2)
      : alpha(theme.palette.grey[100], 0.5),
  borderRadius: theme.shape.borderRadius,
  fontFamily: 'monospace',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  border: `1px solid ${theme.palette.divider}`,
  position: 'relative',
  '&:hover .copy-button': {
    opacity: 1,
  },
}));

const CopyButton = styled(IconButton)(({ theme }) => ({
  position: 'absolute',
  top: 8,
  right: 8,
  opacity: 0,
  transition: 'opacity 0.2s ease-in-out',
  backgroundColor: theme.palette.background.paper,
  '&:hover': {
    backgroundColor: theme.palette.action.hover,
  },
}));

const EnhancedCodeBlock: React.FC<{ content: string } & TypographyProps> = ({
  content,
  ...props
}) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <CodeBlock {...props}>
      {content}
      <CopyButton
        className="copy-button"
        size="small"
        onClick={handleCopy}
        title="Copy to clipboard"
      >
        {copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
      </CopyButton>
    </CodeBlock>
  );
};

const StyledPaper = styled(Paper)(({ theme }) => ({
  marginBottom: theme.spacing(2),
  padding: theme.spacing(2),
  backgroundColor:
    theme.palette.mode === 'dark'
      ? alpha(theme.palette.background.paper, 0.4)
      : theme.palette.background.paper,
  border: `1px solid ${theme.palette.divider}`,
}));

interface FunctionCallOutput {
  type: 'function';
  id: string;
  function?: {
    name: string;
    arguments: string;
  };
}

const LoadingBox = styled(Box)(({ theme }) => ({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  minHeight: '200px',
  animation: 'fadeIn 0.3s ease-in-out',
  '@keyframes fadeIn': {
    '0%': {
      opacity: 0,
    },
    '100%': {
      opacity: 1,
    },
  },
}));

const StrategyStats: React.FC<StrategyStatsProps> = ({
  strategyStats,
  failuresByPlugin = {},
  passesByPlugin = {},
}) => {
  const [selectedStrategy, setSelectedStrategy] = React.useState<string | null>(null);
  const strategies = Object.entries(strategyStats).sort(
    (a, b) => (b[1].total - b[1].pass) / b[1].total - (a[1].total - a[1].pass) / a[1].total,
  );

  const [isLoading, setIsLoading] = React.useState(false);

  const handleStrategyClick = async (strategy: string) => {
    try {
      setIsLoading(true);
      setSelectedStrategy(strategy);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrawerClose = () => {
    setSelectedStrategy(null);
  };

  const getPluginStats = (strategy: string) => {
    const pluginStats: Record<string, { passes: number; total: number }> = {};

    // Process failures
    Object.entries(failuresByPlugin).forEach(([plugin, tests]) => {
      tests.forEach((test) => {
        const testStrategy = getStrategyIdFromGradingResult(test.gradingResult);
        if (
          (strategy === 'basic' && !testStrategy) || // Handle basic strategy case
          testStrategy === strategy
        ) {
          if (!pluginStats[plugin]) {
            pluginStats[plugin] = { passes: 0, total: 0 };
          }
          pluginStats[plugin].total++;
        }
      });
    });

    // Process passes
    Object.entries(passesByPlugin).forEach(([plugin, tests]) => {
      tests.forEach((test) => {
        const testStrategy = getStrategyIdFromGradingResult(test.gradingResult);
        if (
          (strategy === 'basic' && !testStrategy) || // Handle basic strategy case
          testStrategy === strategy
        ) {
          if (!pluginStats[plugin]) {
            pluginStats[plugin] = { passes: 0, total: 0 };
          }
          pluginStats[plugin].passes++;
          pluginStats[plugin].total++;
        }
      });
    });

    return Object.entries(pluginStats)
      .map(([plugin, stats]) => ({
        plugin,
        ...stats,
        failRate: ((stats.total - stats.passes) / stats.total) * 100,
      }))
      .sort((a, b) => b.failRate - a.failRate);
  };

  const getExamplesByStrategy = (strategy: string) => {
    const failures: (typeof failuresByPlugin)[string] = [];
    const passes: (typeof passesByPlugin)[string] = [];

    // Collect failures for this strategy
    Object.values(failuresByPlugin).forEach((tests) => {
      tests.forEach((test) => {
        const testStrategy = getStrategyIdFromGradingResult(test.gradingResult);
        if ((strategy === 'basic' && !testStrategy) || testStrategy === strategy) {
          failures.push(test);
        }
      });
    });

    // Collect passes for this strategy
    Object.values(passesByPlugin).forEach((tests) => {
      tests.forEach((test) => {
        const testStrategy = getStrategyIdFromGradingResult(test.gradingResult);
        if ((strategy === 'basic' && !testStrategy) || testStrategy === strategy) {
          passes.push(test);
        }
      });
    });

    return { failures, passes };
  };

  const getPromptDisplayString = (prompt: string): string => {
    try {
      const parsedPrompt = JSON.parse(prompt);
      if (Array.isArray(parsedPrompt)) {
        const lastPrompt = parsedPrompt[parsedPrompt.length - 1];
        if (lastPrompt?.content) {
          return lastPrompt.content || '-';
        }
      }
    } catch {
      console.debug('Failed to parse prompt as JSON, using raw string');
    }
    return prompt;
  };

  const getOutputDisplay = (output: string | FunctionCallOutput[] | object) => {
    if (typeof output === 'string') {
      return output;
    }
    if (Array.isArray(output)) {
      const items = output.filter((item): item is FunctionCallOutput => item.type === 'function');
      if (items.length > 0) {
        return JSON.stringify(
          items.map((item) => ({
            tool: item.function?.name,
            args: item.function?.arguments,
          })),
        );
      }
    }
    return JSON.stringify(output);
  };

  const [tabValue, setTabValue] = React.useState(0);
  const theme = useTheme();

  const pluginStats = React.useMemo(
    () => (selectedStrategy ? getPluginStats(selectedStrategy) : []),
    [selectedStrategy, failuresByPlugin, passesByPlugin],
  );

  const examplesByStrategy = React.useMemo(
    () =>
      selectedStrategy ? getExamplesByStrategy(selectedStrategy) : { failures: [], passes: [] },
    [selectedStrategy, failuresByPlugin, passesByPlugin],
  );

  return (
    <>
      <Card
        className="strategy-stats-card"
        sx={{
          backgroundColor:
            theme.palette.mode === 'dark'
              ? alpha(theme.palette.background.paper, 0.8)
              : theme.palette.background.paper,
          boxShadow: theme.shadows[theme.palette.mode === 'dark' ? 2 : 1],
        }}
      >
        <CardContent className="strategy-stats-content">
          <Typography variant="h5" mb={2}>
            Attack Methods
          </Typography>
          <Box className="strategy-grid">
            {strategies.map(([strategy, { pass, total }]) => {
              const failRate = ((total - pass) / total) * 100;
              return (
                <Box
                  key={strategy}
                  className="strategy-item"
                  onClick={() => handleStrategyClick(strategy)}
                  sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.04)' } }}
                >
                  <Typography variant="body1" className="strategy-name">
                    {displayNameOverrides[strategy as keyof typeof displayNameOverrides] ||
                      strategy}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    className="strategy-description"
                  >
                    {subCategoryDescriptions[strategy as keyof typeof subCategoryDescriptions] ||
                      ''}
                  </Typography>
                  <Box display="flex" alignItems="center" className="progress-container">
                    <Box width="100%" mr={1}>
                      <DangerLinearProgress variant="determinate" value={failRate} />
                    </Box>
                    <Box minWidth={45} className="fail-rate">
                      <Typography variant="body2" color="text.secondary">
                        {failRate.toFixed(1)}%
                      </Typography>
                    </Box>
                  </Box>
                  <Typography variant="caption" color="text.secondary" className="attack-stats">
                    {total - pass} / {total} attacks succeeded
                  </Typography>
                </Box>
              );
            })}
          </Box>
        </CardContent>
      </Card>

      <Drawer
        aria-label="Strategy details"
        anchor="right"
        open={Boolean(selectedStrategy)}
        onClose={handleDrawerClose}
        PaperProps={{
          sx: {
            backgroundColor:
              theme.palette.mode === 'dark'
                ? alpha(theme.palette.background.paper, 0.9)
                : theme.palette.background.paper,
            borderLeft: `1px solid ${theme.palette.divider}`,
            overflowY: 'auto',
            '&::-webkit-scrollbar': {
              width: '8px',
            },
            '&::-webkit-scrollbar-track': {
              background: 'transparent',
            },
            '&::-webkit-scrollbar-thumb': {
              background:
                theme.palette.mode === 'dark'
                  ? alpha(theme.palette.common.white, 0.2)
                  : alpha(theme.palette.common.black, 0.2),
              borderRadius: '4px',
            },
            '&::-webkit-scrollbar-thumb:hover': {
              background:
                theme.palette.mode === 'dark'
                  ? alpha(theme.palette.common.white, 0.3)
                  : alpha(theme.palette.common.black, 0.3),
            },
          },
        }}
        transitionDuration={250}
        SlideProps={{
          easing: theme.transitions.easing.easeInOut,
        }}
      >
        <Box
          role="dialog"
          aria-modal="true"
          sx={{
            width: 750,
            p: 3,
            color: theme.palette.text.primary,
          }}
        >
          {isLoading ? (
            <LoadingBox>
              <CircularProgress />
            </LoadingBox>
          ) : (
            <>
              <Typography variant="h5" gutterBottom>
                {selectedStrategy &&
                  (displayNameOverrides[selectedStrategy as keyof typeof displayNameOverrides] ||
                    selectedStrategy)}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {selectedStrategy &&
                  (subCategoryDescriptions[
                    selectedStrategy as keyof typeof subCategoryDescriptions
                  ] ||
                    '')}
              </Typography>

              <Box
                sx={{
                  mt: 3,
                  mb: 4,
                  p: 2,
                  bgcolor:
                    theme.palette.mode === 'dark'
                      ? alpha(theme.palette.background.paper, 0.6)
                      : theme.palette.grey[50],
                  borderRadius: 1,
                  border: `1px solid ${theme.palette.divider}`,
                }}
              >
                <Grid container spacing={3}>
                  <Grid item xs={4}>
                    <Typography variant="h6" align="center">
                      {selectedStrategy && strategyStats[selectedStrategy]?.total}
                    </Typography>
                    <Typography variant="body2" align="center" color="text.secondary">
                      Total Attempts
                    </Typography>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography variant="h6" align="center" color="error.main">
                      {selectedStrategy &&
                        strategyStats[selectedStrategy].total -
                          strategyStats[selectedStrategy].pass}
                    </Typography>
                    <Typography variant="body2" align="center" color="text.secondary">
                      Successful Attacks
                    </Typography>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography variant="h6" align="center">
                      {selectedStrategy &&
                        `${(
                          ((strategyStats[selectedStrategy].total -
                            strategyStats[selectedStrategy].pass) /
                            strategyStats[selectedStrategy].total) *
                          100
                        ).toFixed(1)}%`}
                    </Typography>
                    <Typography variant="body2" align="center" color="text.secondary">
                      Success Rate
                    </Typography>
                  </Grid>
                </Grid>
              </Box>

              <Typography variant="h6" gutterBottom sx={{ mt: 4, mb: 2 }}>
                Attack Performance by Plugin
              </Typography>

              {selectedStrategy && (
                <TableContainer
                  sx={{
                    '& .MuiTableCell-root': {
                      borderColor: theme.palette.divider,
                      padding: theme.spacing(2),
                    },
                    '& .MuiTableHead-root .MuiTableCell-root': {
                      fontWeight: 600,
                      backgroundColor:
                        theme.palette.mode === 'dark'
                          ? alpha(theme.palette.background.paper, 0.5)
                          : alpha(theme.palette.grey[50], 0.8),
                    },
                    '& .MuiTableRow-root:hover': {
                      backgroundColor:
                        theme.palette.mode === 'dark'
                          ? alpha(theme.palette.action.hover, 0.1)
                          : theme.palette.action.hover,
                      transition: 'background-color 0.2s ease',
                    },
                    borderRadius: theme.shape.borderRadius,
                    overflow: 'hidden',
                    border: `1px solid ${theme.palette.divider}`,
                  }}
                >
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Plugin</TableCell>
                        <TableCell align="right">Attack Success Rate</TableCell>
                        <TableCell align="right"># Successful Attacks</TableCell>
                        <TableCell align="right"># Attempts</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {pluginStats.map((stat) => (
                        <TableRow key={stat.plugin}>
                          <TableCell component="th" scope="row">
                            {displayNameOverrides[
                              stat.plugin as keyof typeof displayNameOverrides
                            ] || stat.plugin}
                          </TableCell>
                          <TableCell align="right">{stat.failRate.toFixed(1)}%</TableCell>
                          <TableCell align="right">{stat.total - stat.passes}</TableCell>
                          <TableCell align="right">{stat.total}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}

              <Typography variant="h6" gutterBottom sx={{ mt: 4, mb: 2 }}>
                Example Attacks
              </Typography>

              <Tabs
                value={tabValue}
                onChange={(_, newValue) => setTabValue(newValue)}
                sx={{
                  mb: 2,
                  '& .MuiTab-root': {
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      backgroundColor: alpha(theme.palette.action.hover, 0.1),
                    },
                    maxWidth: 'none',
                    padding: '12px 24px',
                  },
                  '& .Mui-selected': {
                    fontWeight: 600,
                  },
                  '& .MuiTabs-indicator': {
                    height: 3,
                    borderRadius: '3px 3px 0 0',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  },
                }}
              >
                <Tab
                  label={`Successful Attacks (${selectedStrategy ? strategyStats[selectedStrategy].total - strategyStats[selectedStrategy].pass : 0})`}
                  id="tab-0"
                  aria-controls="tabpanel-0"
                />
                <Tab
                  label={`Failed Attempts (${selectedStrategy ? strategyStats[selectedStrategy].pass : 0})`}
                  id="tab-1"
                  aria-controls="tabpanel-1"
                />
              </Tabs>

              {tabValue === 0 && selectedStrategy && (
                <List>
                  {examplesByStrategy.failures.slice(0, 5).map((failure, index) => (
                    <StyledPaper key={`failure-${index}`}>
                      <ListItem
                        sx={{
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          p: 2,
                        }}
                      >
                        <Box sx={{ width: '100%' }}>
                          <Typography
                            variant="subtitle2"
                            color="text.secondary"
                            gutterBottom
                            sx={{ fontWeight: 'bold' }}
                          >
                            Prompt:
                          </Typography>
                          <EnhancedCodeBlock
                            variant="body2"
                            sx={{ mb: 2 }}
                            content={getPromptDisplayString(failure.prompt)}
                          />
                          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                            Response:
                          </Typography>
                          <EnhancedCodeBlock
                            variant="body2"
                            content={getOutputDisplay(failure.output)}
                          />
                        </Box>
                      </ListItem>
                    </StyledPaper>
                  ))}
                </List>
              )}

              {tabValue === 1 && selectedStrategy && (
                <List>
                  {examplesByStrategy.passes.slice(0, 5).map((pass, index) => (
                    <StyledPaper key={`pass-${index}`}>
                      <ListItem
                        sx={{
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          p: 2,
                        }}
                      >
                        <Box sx={{ width: '100%' }}>
                          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                            Prompt:
                          </Typography>
                          <EnhancedCodeBlock
                            variant="body2"
                            sx={{ mb: 2 }}
                            content={getPromptDisplayString(pass.prompt)}
                          />
                          <Typography
                            variant="subtitle2"
                            color="text.secondary"
                            gutterBottom
                            sx={{ fontWeight: 'bold' }}
                          >
                            Response:
                          </Typography>
                          <EnhancedCodeBlock
                            variant="body2"
                            content={getOutputDisplay(pass.output)}
                          />
                        </Box>
                      </ListItem>
                    </StyledPaper>
                  ))}
                </List>
              )}
            </>
          )}
        </Box>
      </Drawer>
    </>
  );
};

export default StrategyStats;
