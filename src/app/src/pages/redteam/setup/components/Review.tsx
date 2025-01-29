import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { useToast } from '@app/hooks/useToast';
import YamlEditor from '@app/pages/eval-creator/components/YamlEditor';
import { callApi } from '@app/utils/api';
import AssessmentIcon from '@mui/icons-material/Assessment';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SaveIcon from '@mui/icons-material/Save';
import SearchIcon from '@mui/icons-material/Search';
import SettingsIcon from '@mui/icons-material/Settings';
import StopIcon from '@mui/icons-material/Stop';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { strategyDisplayNames } from '@promptfoo/redteam/constants';
import { getUnifiedConfig } from '@promptfoo/redteam/sharedFrontend';
import type { RedteamPlugin } from '@promptfoo/redteam/types';
import type { Job } from '@promptfoo/types';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';
import { generateOrderedYaml } from '../utils/yamlHelpers';
import { LogViewer } from './LogViewer';

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

export default function Review() {
  const { config, updateConfig } = useRedTeamConfig();
  const theme = useTheme();
  const { recordEvent } = useTelemetry();
  const [isYamlDialogOpen, setIsYamlDialogOpen] = React.useState(false);
  const yamlContent = useMemo(() => generateOrderedYaml(config), [config]);
  const [isRunning, setIsRunning] = React.useState(false);
  const [logs, setLogs] = React.useState<string[]>([]);
  const [evalId, setEvalId] = React.useState<string | null>(null);
  const { showToast } = useToast();
  const [forceRegeneration /*, setForceRegeneration*/] = React.useState(true);
  const [debugMode, setDebugMode] = React.useState(false);
  const [delay, setDelay] = React.useState('0');
  const [isJobStatusDialogOpen, setIsJobStatusDialogOpen] = useState(false);
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);
  const [isRunSettingsDialogOpen, setIsRunSettingsDialogOpen] = useState(false);

  const handleDescriptionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateConfig('description', event.target.value);
  };

  useEffect(() => {
    recordEvent('webui_page_view', { page: 'redteam_config_review' });
  }, []);

  const handleSaveYaml = () => {
    const blob = new Blob([yamlContent], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'promptfooconfig.yaml';
    link.click();
    URL.revokeObjectURL(url);
    recordEvent('feature_used', {
      feature: 'redteam_config_download',
      numPlugins: config.plugins.length,
      numStrategies: config.strategies.length,
      targetType: config.target.id,
    });
  };

  const handleOpenYamlDialog = () => {
    setIsYamlDialogOpen(true);
  };

  const handleCloseYamlDialog = () => {
    setIsYamlDialogOpen(false);
  };

  const getPluginSummary = useCallback((plugin: string | RedteamPlugin) => {
    if (typeof plugin === 'string') {
      return { label: plugin, count: 1 };
    }

    if (plugin.id === 'policy') {
      return { label: 'Custom Policy', count: 1 };
    }

    return { label: plugin.id, count: 1 };
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
    const { hasRunningJob } = await checkForRunningJob();

    if (hasRunningJob) {
      setIsJobStatusDialogOpen(true);
      return;
    }

    if (pollInterval) {
      clearInterval(pollInterval);
      setPollInterval(null);
    }

    recordEvent('feature_used', {
      feature: 'redteam_config_run',
      numPlugins: config.plugins.length,
      numStrategies: config.strategies.length,
      targetType: config.target.id,
    });

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
          force: forceRegeneration,
          verbose: debugMode,
          delay,
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
            console.warn('No evaluation result was generated');
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
      showToast('An error occurred while starting the evaluation. Please try again.', 'error');
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

  return (
    <Box maxWidth="lg" mx="auto">
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold', mb: 4 }}>
        Review Your Configuration
      </Typography>

      <TextField
        fullWidth
        label="Configuration Description"
        placeholder="My Red Team Configuration"
        value={config.description}
        onChange={handleDescriptionChange}
        variant="outlined"
        sx={{ mb: 4 }}
      />

      <Typography variant="h5" gutterBottom sx={{ mb: 3 }}>
        Configuration Summary
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper elevation={2} sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Plugins ({pluginSummary.length})
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {pluginSummary.map(([label, count]) => (
                <Chip
                  key={label}
                  label={count > 1 ? `${label} (${count})` : label}
                  size="small"
                  sx={{
                    backgroundColor:
                      label === 'Custom Policy' ? theme.palette.primary.main : undefined,
                    color:
                      label === 'Custom Policy' ? theme.palette.primary.contrastText : undefined,
                  }}
                />
              ))}
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper elevation={2} sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Strategies ({strategySummary.length})
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {strategySummary.map(([label, count]) => (
                <Chip key={label} label={count > 1 ? `${label} (${count})` : label} size="small" />
              ))}
            </Box>
          </Paper>
        </Grid>

        {customPolicies.length > 0 && (
          <Grid item xs={12} md={6}>
            <Paper elevation={2} sx={{ p: 3, height: '100%' }}>
              <Typography variant="h6" gutterBottom>
                Custom Policies ({customPolicies.length})
              </Typography>
              <Stack spacing={1}>
                {customPolicies.map((policy, index) => (
                  <Box
                    key={index}
                    sx={{
                      p: 1.5,
                      borderRadius: 1,
                      bgcolor: theme.palette.action.hover,
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {policy.config.policy}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Paper>
          </Grid>
        )}

        {intents.length > 0 && (
          <Grid item xs={12} md={6}>
            <Paper elevation={2} sx={{ p: 3, height: '100%' }}>
              <Typography variant="h6" gutterBottom>
                Intents ({intents.length})
              </Typography>
              <Stack spacing={1}>
                {intents.map((intent, index) => (
                  <Box
                    key={index}
                    sx={{
                      p: 1.5,
                      borderRadius: 1,
                      bgcolor: theme.palette.action.hover,
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {intent}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Paper>
          </Grid>
        )}

        <Grid item xs={12}>
          <Paper elevation={2} sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Additional Details
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={12}>
                <Typography variant="subtitle2">Purpose</Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {config.purpose || 'Not specified'}
                </Typography>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      </Grid>

      <Divider sx={{ my: 4 }} />

      <Typography variant="h5" gutterBottom sx={{ mb: 3 }}>
        Running Your Configuration
      </Typography>

      <Paper elevation={2} sx={{ p: 3 }}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            Option 1: Save and Run via CLI
          </Typography>
          <Typography variant="body1">
            Save your configuration and run it from the command line. Full control over the
            evaluation process, good for larger scans:
          </Typography>
          <Box
            component="pre"
            sx={{
              p: 2,
              mb: 2,
              backgroundColor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#f5f5f5',
              borderRadius: 1,
              fontFamily: 'monospace',
              fontSize: '0.875rem',
            }}
          >
            promptfoo redteam run
          </Box>
          <Stack spacing={2}>
            <Box>
              <Button
                variant="contained"
                color="primary"
                onClick={handleSaveYaml}
                startIcon={<SaveIcon />}
              >
                Save YAML
              </Button>
              <Button
                variant="outlined"
                color="primary"
                startIcon={<VisibilityIcon />}
                onClick={handleOpenYamlDialog}
                sx={{ ml: 2 }}
              >
                View YAML
              </Button>
            </Box>
          </Stack>
        </Box>

        <Divider sx={{ my: 3 }} />

        <Box>
          <Typography variant="h6" gutterBottom>
            Option 2: Run Directly in Browser
          </Typography>
          <Typography variant="body1" paragraph>
            Run the red team evaluation right here. Simpler but less powerful than the CLI, good for
            tests and small scans:
          </Typography>
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <Button
                variant="contained"
                color="primary"
                onClick={handleRunWithSettings}
                disabled={isRunning}
                startIcon={
                  isRunning ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />
                }
              >
                {isRunning ? 'Running...' : 'Run Now'}
              </Button>
              {isRunning && (
                <Button
                  variant="contained"
                  color="error"
                  onClick={handleCancel}
                  startIcon={<StopIcon />}
                >
                  Cancel
                </Button>
              )}
              {evalId && (
                <>
                  <Button
                    variant="contained"
                    color="success"
                    href={`/report?evalId=${evalId}`}
                    startIcon={<AssessmentIcon />}
                  >
                    View Report
                  </Button>
                  <Button
                    variant="contained"
                    color="success"
                    href={`/eval?evalId=${evalId}`}
                    startIcon={<SearchIcon />}
                  >
                    View Probes
                  </Button>
                </>
              )}
              <Tooltip title="Run Settings">
                <IconButton
                  onClick={() => setIsRunSettingsDialogOpen(true)}
                  disabled={isRunning}
                  size="small"
                >
                  <SettingsIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
          {logs.length > 0 && <LogViewer logs={logs} />}
        </Box>
      </Paper>

      <Dialog open={isYamlDialogOpen} onClose={handleCloseYamlDialog} maxWidth="lg" fullWidth>
        <DialogTitle>YAML Configuration</DialogTitle>
        <DialogContent>
          <YamlEditor initialYaml={yamlContent} readOnly />
        </DialogContent>
      </Dialog>

      <Dialog open={isJobStatusDialogOpen} onClose={() => setIsJobStatusDialogOpen(false)}>
        <DialogTitle>Job Already Running</DialogTitle>
        <DialogContent>
          <Typography variant="body1" paragraph>
            There is already a red team evaluation running. Would you like to cancel it and start a
            new one?
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

      <Dialog open={isRunSettingsDialogOpen} onClose={() => setIsRunSettingsDialogOpen(false)}>
        <DialogTitle>Run Settings</DialogTitle>
        <DialogContent>
          <Stack spacing={4} sx={{ mt: 1, minWidth: 300 }}>
            {/*
            <FormControlLabel
              control={
                <Switch
                  checked={forceRegeneration}
                  onChange={(e) => setForceRegeneration(e.target.checked)}
                  disabled={isRunning}
                />
              }
              label={
                <Box>
                  <Typography variant="body1">Force regeneration</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Generate new test cases even if no changes are detected
                  </Typography>
                </Box>
              }
            />
            */}
            <FormControlLabel
              control={
                <Switch
                  checked={debugMode}
                  onChange={(e) => setDebugMode(e.target.checked)}
                  disabled={isRunning}
                />
              }
              label={
                <Box>
                  <Typography variant="body1">Debug mode</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Show additional debug information in logs
                  </Typography>
                </Box>
              }
            />
            <Box>
              <TextField
                fullWidth
                type="number"
                label="Number of test cases"
                value={config.numTests}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (!Number.isNaN(value) && value > 0 && Number.isInteger(value)) {
                    updateConfig('numTests', value);
                  }
                }}
                disabled={isRunning}
                helperText="Number of test cases to generate for each plugin"
              />
            </Box>
            <Box>
              <TextField
                fullWidth
                type="number"
                label="Delay between API calls (ms)"
                value={delay}
                onChange={(e) => {
                  const value = e.target.value;
                  // Ensure non-negative numbers only
                  if (!Number.isNaN(Number(value)) && Number(value) >= 0) {
                    setDelay(value);
                  }
                }}
                disabled={isRunning}
                InputProps={{
                  endAdornment: <Typography variant="caption">ms</Typography>,
                }}
                helperText="Add a delay between API calls to avoid rate limits"
              />
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
              <Button onClick={() => setIsRunSettingsDialogOpen(false)}>Close</Button>
            </Box>
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
