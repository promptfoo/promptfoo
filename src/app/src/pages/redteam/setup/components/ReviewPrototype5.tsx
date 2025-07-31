import React, { useCallback, useEffect, useMemo, useState } from 'react';

import Code from '@app/components/Code';
import { useEmailVerification } from '@app/hooks/useEmailVerification';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { useToast } from '@app/hooks/useToast';
import YamlEditor from '@app/pages/eval-creator/components/YamlEditor';
import { callApi } from '@app/utils/api';
import AddIcon from '@mui/icons-material/Add';
import AssessmentIcon from '@mui/icons-material/Assessment';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import DescriptionIcon from '@mui/icons-material/Description';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RemoveIcon from '@mui/icons-material/Remove';
import SaveIcon from '@mui/icons-material/Save';
import SearchIcon from '@mui/icons-material/Search';
import SettingsIcon from '@mui/icons-material/Settings';
import StopIcon from '@mui/icons-material/Stop';
import TimerIcon from '@mui/icons-material/Timer';
import TuneIcon from '@mui/icons-material/Tune';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemSecondaryAction from '@mui/material/ListItemSecondaryAction';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import { useTheme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { REDTEAM_DEFAULTS, pluginDisplayNames, strategyDisplayNames } from '@promptfoo/redteam/constants';
import { getUnifiedConfig } from '@promptfoo/redteam/sharedFrontend';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';
import { generateOrderedYaml } from '../utils/yamlHelpers';
import { EmailVerificationDialog } from './EmailVerificationDialog';
import { LogViewer } from './LogViewer';
import type { RedteamPlugin } from '@promptfoo/redteam/types';
import type { Job } from '@promptfoo/types';

interface PolicyPlugin {
  id: 'policy';
  config: {
    policy: string;
  };
}

interface JobStatusResponse {
  hasRunningJob: boolean;
  jobId?: string;
}

/**
 * Prototype 5: Compact Card-based Layout with Expandable Details
 * - Minimalist design with expandable cards
 * - Space-efficient layout suitable for smaller screens
 * - Quick actions on each card
 * - Inline editing capabilities
 */
export default function ReviewPrototype5() {
  const { config, updateConfig } = useRedTeamConfig();
  const theme = useTheme();
  const { recordEvent } = useTelemetry();
  const [isYamlDialogOpen, setIsYamlDialogOpen] = React.useState(false);
  const yamlContent = useMemo(() => generateOrderedYaml(config), [config]);

  const [isRunning, setIsRunning] = React.useState(false);
  const [logs, setLogs] = React.useState<string[]>([]);
  const [evalId, setEvalId] = React.useState<string | null>(null);
  const { showToast } = useToast();
  const [debugMode, setDebugMode] = React.useState(false);
  const [maxConcurrency, setMaxConcurrency] = React.useState(
    String(config.maxConcurrency || REDTEAM_DEFAULTS.MAX_CONCURRENCY),
  );
  const [delayMs, setDelayMs] = React.useState('0');
  const [isJobStatusDialogOpen, setIsJobStatusDialogOpen] = useState(false);
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);
  const [isRunSettingsDialogOpen, setIsRunSettingsDialogOpen] = useState(false);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [emailVerificationMessage, setEmailVerificationMessage] = useState('');
  const [emailVerificationError, setEmailVerificationError] = useState<string | null>(null);
  const { checkEmailStatus } = useEmailVerification();

  // Expansion states
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({
    context: false,
    plugins: false,
    strategies: false,
    execution: false,
  });

  const handleDescriptionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateConfig('description', event.target.value);
  };

  useEffect(() => {
    recordEvent('webui_page_view', { page: 'redteam_config_review_prototype5' });
  }, []);

  const toggleCard = (cardId: string) => {
    setExpandedCards(prev => ({
      ...prev,
      [cardId]: !prev[cardId],
    }));
  };

  // Calculate stats
  const stats = useMemo(() => {
    const pluginCount = config.plugins.length;
    const strategyCount = config.strategies.length;
    const testsPerPlugin = config.numTests || REDTEAM_DEFAULTS.NUM_TESTS;
    const totalTests = pluginCount * strategyCount * testsPerPlugin;
    const concurrency = Number(maxConcurrency) || REDTEAM_DEFAULTS.MAX_CONCURRENCY;
    const delay = Number(delayMs) || 0;
    const timePerTest = delay > 0 ? delay : 500;
    const totalTime = (totalTests * timePerTest) / concurrency;
    const estimatedMinutes = Math.ceil(totalTime / 60000);

    return {
      pluginCount,
      strategyCount,
      testsPerPlugin,
      totalTests,
      estimatedMinutes,
      concurrency,
      delay,
    };
  }, [config.plugins.length, config.strategies.length, config.numTests, maxConcurrency, delayMs]);

  const getPluginSummary = useCallback((plugin: string | RedteamPlugin) => {
    if (typeof plugin === 'string') {
      return { label: pluginDisplayNames[plugin as keyof typeof pluginDisplayNames] || plugin, count: 1 };
    }
    if (plugin.id === 'policy') {
      return { label: 'Custom Policy', count: 1 };
    }
    if (plugin.id === 'intent') {
      return { label: 'Custom Intent', count: 1 };
    }
    return { label: pluginDisplayNames[plugin.id as keyof typeof pluginDisplayNames] || plugin.id, count: 1 };
  }, []);

  const pluginSummary = useMemo(() => {
    const summary = new Map<string, number>();
    config.plugins.forEach((plugin) => {
      const { label, count } = getPluginSummary(plugin);
      summary.set(label, (summary.get(label) || 0) + count);
    });
    return Array.from(summary.entries()).sort((a, b) => b[1] - a[1]);
  }, [config.plugins, getPluginSummary]);

  const customPolicies = useMemo(() => {
    return config.plugins.filter(
      (p): p is PolicyPlugin => typeof p === 'object' && p.id === 'policy',
    );
  }, [config.plugins]);

  const intents = useMemo(() => {
    return config.plugins
      .filter(
        (p): p is { id: 'intent'; config: { intent: string | string[] } } =>
          typeof p === 'object' && p.id === 'intent' && p.config?.intent !== undefined,
      )
      .map((p) => p.config.intent)
      .flat()
      .filter((intent): intent is string => typeof intent === 'string' && intent.trim() !== '');
  }, [config.plugins]);

  const getStrategyId = (strategy: string | { id: string }): string => {
    return typeof strategy === 'string' ? strategy : strategy.id;
  };

  const strategySummary = useMemo(() => {
    const summary = new Map<string, number>();
    config.strategies.forEach((strategy) => {
      const id = getStrategyId(strategy);
      const label = strategyDisplayNames[id as keyof typeof strategyDisplayNames] || id;
      summary.set(label, (summary.get(label) || 0) + 1);
    });
    return Array.from(summary.entries()).sort((a, b) => b[1] - a[1]);
  }, [config.strategies]);

  const handleSaveYaml = () => {
    const blob = new Blob([yamlContent], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'promptfooconfig.yaml';
    link.click();
    URL.revokeObjectURL(url);
  };

  const checkForRunningJob = async (): Promise<JobStatusResponse> => {
    try {
      const response = await callApi('/redteam/status');
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error checking job status:', error);
      return { hasRunningJob: false };
    }
  };

  const handleRunWithSettings = async () => {
    setIsRunSettingsDialogOpen(false);

    const emailResult = await checkEmailStatus();
    if (!emailResult.canProceed) {
      if (emailResult.needsEmail) {
        setEmailVerificationMessage(
          emailResult.status?.message ||
            'Redteam evals require email verification. Please enter your work email:',
        );
        setIsEmailDialogOpen(true);
        return;
      } else if (emailResult.error) {
        setEmailVerificationError(emailResult.error);
        showToast(emailResult.error, 'error');
        return;
      }
    }

    const { hasRunningJob } = await checkForRunningJob();
    if (hasRunningJob) {
      setIsJobStatusDialogOpen(true);
      return;
    }

    if (pollInterval) {
      clearInterval(pollInterval);
      setPollInterval(null);
    }

    setIsRunning(true);
    setLogs([]);
    setEvalId(null);

    try {
      const response = await callApi('/redteam/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          config: getUnifiedConfig(config),
          force: true,
          verbose: debugMode,
          maxConcurrency,
          delayMs,
        }),
      });

      const { id } = await response.json();

      const interval = setInterval(async () => {
        const statusResponse = await callApi(`/eval/job/${id}`);
        const status = (await statusResponse.json()) as Job;

        if (status.logs) {
          setLogs(status.logs);
        }

        if (status.status === 'complete' || status.status === 'error') {
          clearInterval(interval);
          setPollInterval(null);
          setIsRunning(false);

          if (status.status === 'complete' && status.result && status.evalId) {
            setEvalId(status.evalId);
          } else if (status.status === 'complete') {
            showToast(
              'The evaluation completed but no results were generated. Please check the logs for details.',
              'warning',
            );
          } else {
            showToast(
              'An error occurred during evaluation. Please check the logs for details.',
              'error',
            );
          }
        }
      }, 1000);

      setPollInterval(interval);
    } catch (error) {
      console.error('Error running redteam:', error);
      setIsRunning(false);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showToast(
        `An error occurred while starting the evaluation: ${errorMessage}. Please try again.`,
        'error',
      );
    }
  };

  const handleCancel = async () => {
    try {
      await callApi('/redteam/cancel', {
        method: 'POST',
      });

      if (pollInterval) {
        clearInterval(pollInterval);
        setPollInterval(null);
      }

      setIsRunning(false);
      showToast('Cancel request submitted', 'success');
    } catch (error) {
      console.error('Error cancelling job:', error);
      showToast('Failed to cancel job', 'error');
    }
  };

  const handleCancelExistingAndRun = async () => {
    try {
      await handleCancel();
      setIsJobStatusDialogOpen(false);
      setTimeout(() => {
        handleRunWithSettings();
      }, 500);
    } catch (error) {
      console.error('Error canceling existing job:', error);
      showToast('Failed to cancel existing job', 'error');
    }
  };

  useEffect(() => {
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [pollInterval]);

  const handleNumTestsChange = (delta: number) => {
    const current = config.numTests || REDTEAM_DEFAULTS.NUM_TESTS;
    const newValue = Math.max(1, current + delta);
    updateConfig('numTests', newValue);
  };

  const handleConcurrencyChange = (delta: number) => {
    const current = Number(maxConcurrency) || REDTEAM_DEFAULTS.MAX_CONCURRENCY;
    const newValue = Math.max(1, current + delta);
    setMaxConcurrency(String(newValue));
    updateConfig('maxConcurrency', newValue);
  };

  return (
    <Box maxWidth="lg" mx="auto">
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold', mb: 3 }}>
        Configuration Review
      </Typography>

      <TextField
        fullWidth
        label="Configuration Name"
        placeholder="My Red Team Configuration"
        value={config.description}
        onChange={handleDescriptionChange}
        variant="outlined"
        size="small"
        sx={{ mb: 3 }}
        InputProps={{
          startAdornment: <DescriptionIcon sx={{ mr: 1, color: 'text.secondary' }} />,
        }}
      />

      {/* Quick Summary Strip */}
      <Paper elevation={1} sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={6} sm={3}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h5" fontWeight="bold">{stats.pluginCount}</Typography>
              <Typography variant="caption" color="text.secondary">Plugins</Typography>
            </Box>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h5" fontWeight="bold">{stats.strategyCount}</Typography>
              <Typography variant="caption" color="text.secondary">Strategies</Typography>
            </Box>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h5" fontWeight="bold">{stats.totalTests}</Typography>
              <Typography variant="caption" color="text.secondary">Test Cases</Typography>
            </Box>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h5" fontWeight="bold" color="primary">~{stats.estimatedMinutes}m</Typography>
              <Typography variant="caption" color="text.secondary">Runtime</Typography>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      <Stack spacing={2}>
        {/* Application Context Card */}
        <Card>
          <CardHeader
            avatar={
              <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>
                <InfoOutlinedIcon fontSize="small" />
              </Avatar>
            }
            title="Application Context"
            subheader={config.applicationDefinition?.industry || 'General application'}
            action={
              <IconButton onClick={() => toggleCard('context')}>
                {expandedCards.context ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            }
            sx={{ pb: expandedCards.context ? 1 : 2 }}
          />
          {!expandedCards.context && (
            <CardContent sx={{ pt: 0 }}>
              <Typography variant="body2" color="text.secondary" noWrap>
                {config.purpose || config.applicationDefinition?.purpose || 'No purpose specified'}
              </Typography>
            </CardContent>
          )}
          <Collapse in={expandedCards.context}>
            <CardContent>
              <Stack spacing={2}>
                <Box>
                  <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                    Purpose
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {config.purpose || config.applicationDefinition?.purpose || 'No purpose specified'}
                  </Typography>
                </Box>
                
                {config.applicationDefinition && (
                  <>
                    <Divider />
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6}>
                        <Typography variant="caption" color="text.secondary">Red Team Persona</Typography>
                        <Typography variant="body2">
                          {config.applicationDefinition.redteamUser || 'Default attacker'}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Typography variant="caption" color="text.secondary">Attack Constraints</Typography>
                        <Typography variant="body2">
                          {config.applicationDefinition.attackConstraints || 'None specified'}
                        </Typography>
                      </Grid>
                    </Grid>
                    
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6}>
                        <Alert severity="success" sx={{ py: 0.5 }}>
                          <Typography variant="caption" fontWeight="bold">Allowed Access</Typography>
                          <Typography variant="caption" display="block">
                            {config.applicationDefinition.accessToData || 'Not specified'}
                          </Typography>
                        </Alert>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Alert severity="error" sx={{ py: 0.5 }}>
                          <Typography variant="caption" fontWeight="bold">Forbidden Access</Typography>
                          <Typography variant="caption" display="block">
                            {config.applicationDefinition.forbiddenData || 'Not specified'}
                          </Typography>
                        </Alert>
                      </Grid>
                    </Grid>
                  </>
                )}
                
                {config.testGenerationInstructions && (
                  <>
                    <Divider />
                    <Box>
                      <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                        Test Generation Instructions
                      </Typography>
                      <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                        {config.testGenerationInstructions}
                      </Typography>
                    </Box>
                  </>
                )}
              </Stack>
            </CardContent>
          </Collapse>
        </Card>

        {/* Security Plugins Card */}
        <Card>
          <CardHeader
            avatar={
              <Avatar sx={{ bgcolor: 'error.main', width: 32, height: 32 }}>
                <Typography variant="caption" fontWeight="bold">{stats.pluginCount}</Typography>
              </Avatar>
            }
            title="Security Plugins"
            subheader={`${pluginSummary.length} unique plugin types`}
            action={
              <IconButton onClick={() => toggleCard('plugins')}>
                {expandedCards.plugins ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            }
            sx={{ pb: expandedCards.plugins ? 1 : 2 }}
          />
          {!expandedCards.plugins && (
            <CardContent sx={{ pt: 0 }}>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {pluginSummary.slice(0, 6).map(([label, count]) => (
                  <Chip
                    key={label}
                    label={count > 1 ? `${label} (${count})` : label}
                    size="small"
                    variant="outlined"
                  />
                ))}
                {pluginSummary.length > 6 && (
                  <Chip label={`+${pluginSummary.length - 6} more`} size="small" />
                )}
              </Box>
            </CardContent>
          )}
          <Collapse in={expandedCards.plugins}>
            <CardContent>
              <List dense>
                {pluginSummary.map(([label, count]) => (
                  <ListItem key={label}>
                    <ListItemText 
                      primary={label}
                      secondary={count > 1 ? `${count} instances` : undefined}
                    />
                    <ListItemSecondaryAction>
                      <IconButton 
                        edge="end" 
                        size="small"
                        onClick={() => {
                          const newPlugins = config.plugins.filter((plugin) => {
                            const pluginLabel = getPluginSummary(plugin).label;
                            return pluginLabel !== label;
                          });
                          updateConfig('plugins', newPlugins);
                        }}
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
              
              {customPolicies.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" color="primary" gutterBottom>
                    Custom Policies ({customPolicies.length})
                  </Typography>
                  {customPolicies.map((policy, idx) => (
                    <Alert key={idx} severity="info" sx={{ mb: 1 }}>
                      <Typography variant="caption">{policy.config.policy}</Typography>
                    </Alert>
                  ))}
                </Box>
              )}
              
              {intents.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" color="secondary" gutterBottom>
                    Custom Intents ({intents.length})
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {intents.map((intent, idx) => (
                      <Chip key={idx} label={intent} size="small" color="secondary" variant="outlined" />
                    ))}
                  </Box>
                </Box>
              )}
            </CardContent>
          </Collapse>
        </Card>

        {/* Attack Strategies Card */}
        <Card>
          <CardHeader
            avatar={
              <Avatar sx={{ bgcolor: 'secondary.main', width: 32, height: 32 }}>
                <Typography variant="caption" fontWeight="bold">{stats.strategyCount}</Typography>
              </Avatar>
            }
            title="Attack Strategies"
            subheader="Methods to bypass defenses"
            action={
              <IconButton onClick={() => toggleCard('strategies')}>
                {expandedCards.strategies ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            }
            sx={{ pb: expandedCards.strategies ? 1 : 2 }}
          />
          {!expandedCards.strategies && (
            <CardContent sx={{ pt: 0 }}>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {strategySummary.slice(0, 4).map(([label]) => (
                  <Chip
                    key={label}
                    label={label}
                    size="small"
                    color="secondary"
                    variant="outlined"
                  />
                ))}
                {strategySummary.length > 4 && (
                  <Chip label={`+${strategySummary.length - 4} more`} size="small" />
                )}
              </Box>
            </CardContent>
          )}
          <Collapse in={expandedCards.strategies}>
            <CardContent>
              <List dense>
                {strategySummary.map(([label, count]) => (
                  <ListItem key={label}>
                    <ListItemIcon>
                      <Chip label={count} size="small" color="secondary" />
                    </ListItemIcon>
                    <ListItemText primary={label} />
                    <ListItemSecondaryAction>
                      <IconButton 
                        edge="end" 
                        size="small"
                        onClick={() => {
                          const strategyId = Object.entries(strategyDisplayNames).find(
                            ([id, displayName]) => displayName === label,
                          )?.[0] || label;
                          
                          const newStrategies = config.strategies.filter((strategy) => {
                            const id = getStrategyId(strategy);
                            return id !== strategyId;
                          });
                          
                          updateConfig('strategies', newStrategies);
                        }}
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Collapse>
        </Card>

        {/* Execution Settings Card */}
        <Card>
          <CardHeader
            avatar={
              <Avatar sx={{ bgcolor: 'info.main', width: 32, height: 32 }}>
                <TimerIcon fontSize="small" />
              </Avatar>
            }
            title="Execution Settings"
            subheader={`${stats.totalTests} tests • ${stats.concurrency} threads • ~${stats.estimatedMinutes}m`}
            action={
              <IconButton onClick={() => toggleCard('execution')}>
                {expandedCards.execution ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            }
            sx={{ pb: expandedCards.execution ? 1 : 2 }}
          />
          {!expandedCards.execution && (
            <CardContent sx={{ pt: 0 }}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Box>
                  <Typography variant="caption" color="text.secondary">Tests per plugin</Typography>
                  <ButtonGroup size="small" variant="outlined">
                    <Button onClick={() => handleNumTestsChange(-1)}>
                      <RemoveIcon fontSize="small" />
                    </Button>
                    <Button disabled>{config.numTests || REDTEAM_DEFAULTS.NUM_TESTS}</Button>
                    <Button onClick={() => handleNumTestsChange(1)}>
                      <AddIcon fontSize="small" />
                    </Button>
                  </ButtonGroup>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Concurrency</Typography>
                  <ButtonGroup size="small" variant="outlined">
                    <Button onClick={() => handleConcurrencyChange(-1)}>
                      <RemoveIcon fontSize="small" />
                    </Button>
                    <Button disabled>{maxConcurrency}</Button>
                    <Button onClick={() => handleConcurrencyChange(1)}>
                      <AddIcon fontSize="small" />
                    </Button>
                  </ButtonGroup>
                </Box>
              </Stack>
            </CardContent>
          )}
          <Collapse in={expandedCards.execution}>
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Tests per plugin"
                    value={config.numTests || REDTEAM_DEFAULTS.NUM_TESTS}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (!Number.isNaN(value) && value > 0) {
                        updateConfig('numTests', value);
                      }
                    }}
                    size="small"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Max concurrency"
                    value={maxConcurrency}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (!Number.isNaN(Number(value)) && Number(value) >= 0) {
                        setMaxConcurrency(value);
                        updateConfig('maxConcurrency', Number(value));
                      }
                    }}
                    size="small"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="API delay (ms)"
                    value={delayMs}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (!Number.isNaN(Number(value)) && Number(value) >= 0) {
                        setDelayMs(value);
                      }
                    }}
                    size="small"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={debugMode}
                        onChange={(e) => setDebugMode(e.target.checked)}
                        size="small"
                      />
                    }
                    label="Debug mode"
                  />
                </Grid>
              </Grid>
              
              <Alert severity="info" sx={{ mt: 2 }}>
                <Typography variant="caption">
                  <strong>Total execution:</strong> {stats.pluginCount} plugins × {stats.strategyCount} strategies × {config.numTests || REDTEAM_DEFAULTS.NUM_TESTS} tests = {stats.totalTests} test cases
                </Typography>
              </Alert>
            </CardContent>
          </Collapse>
          <CardActions>
            <Button 
              size="small" 
              startIcon={<SaveIcon />}
              onClick={handleSaveYaml}
            >
              Export YAML
            </Button>
            <Button 
              size="small" 
              startIcon={<VisibilityIcon />}
              onClick={() => setIsYamlDialogOpen(true)}
            >
              Preview
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button
              variant="contained"
              color="success"
              size="small"
              onClick={handleRunWithSettings}
              disabled={isRunning}
              startIcon={isRunning ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
            >
              {isRunning ? 'Running...' : 'Run Now'}
            </Button>
            {isRunning && (
              <IconButton
                size="small"
                color="error"
                onClick={handleCancel}
              >
                <StopIcon />
              </IconButton>
            )}
            {evalId && (
              <>
                <IconButton
                  size="small"
                  href={`/report?evalId=${evalId}`}
                  color="primary"
                >
                  <AssessmentIcon />
                </IconButton>
                <IconButton
                  size="small"
                  href={`/eval?evalId=${evalId}`}
                  color="primary"
                >
                  <SearchIcon />
                </IconButton>
              </>
            )}
          </CardActions>
        </Card>

        {/* Logs */}
        {logs.length > 0 && (
          <Card>
            <CardHeader
              title="Execution Logs"
              titleTypographyProps={{ variant: 'h6' }}
            />
            <CardContent>
              <LogViewer logs={logs} />
            </CardContent>
          </Card>
        )}

        {/* Success Alert */}
        {evalId && (
          <Alert 
            severity="success" 
            action={
              <Stack direction="row" spacing={1}>
                <Button 
                  color="inherit" 
                  size="small" 
                  href={`/report?evalId=${evalId}`}
                  startIcon={<AssessmentIcon />}
                >
                  View Report
                </Button>
                <Button 
                  color="inherit" 
                  size="small" 
                  href={`/eval?evalId=${evalId}`}
                  startIcon={<SearchIcon />}
                >
                  View Details
                </Button>
              </Stack>
            }
          >
            <Typography variant="subtitle2">Evaluation Complete!</Typography>
            <Typography variant="body2">Your red team evaluation has finished successfully.</Typography>
          </Alert>
        )}
      </Stack>

      {/* Dialogs */}
      <Dialog open={isYamlDialogOpen} onClose={() => setIsYamlDialogOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>YAML Configuration Preview</DialogTitle>
        <DialogContent>
          <YamlEditor initialYaml={yamlContent} readOnly />
        </DialogContent>
      </Dialog>

      <Dialog open={isJobStatusDialogOpen} onClose={() => setIsJobStatusDialogOpen(false)}>
        <DialogTitle>Job Already Running</DialogTitle>
        <DialogContent>
          <Typography variant="body1" paragraph>
            There is already a red team evaluation running. Would you like to cancel it and start a new one?
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 2 }}>
            <Button variant="outlined" onClick={() => setIsJobStatusDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="contained" color="primary" onClick={handleCancelExistingAndRun}>
              Cancel Existing & Run New
            </Button>
          </Box>
        </DialogContent>
      </Dialog>

      <EmailVerificationDialog
        open={isEmailDialogOpen}
        onClose={() => setIsEmailDialogOpen(false)}
        onSuccess={() => {
          setIsEmailDialogOpen(false);
          handleRunWithSettings();
        }}
        message={emailVerificationMessage}
      />
    </Box>
  );
}