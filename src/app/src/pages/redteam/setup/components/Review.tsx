import React, { useCallback, useMemo } from 'react';
import { useTelemetry } from '@app/hooks/useTelemetry';
import YamlEditor from '@app/pages/eval-creator/components/YamlEditor';
import { callApi } from '@app/utils/api';
import SaveIcon from '@mui/icons-material/Save';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { strategyDisplayNames } from '@promptfoo/redteam/constants';
import type { RedteamPlugin } from '@promptfoo/redteam/types';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';
import { generateOrderedYaml, getUnifiedConfig } from '../utils/yamlHelpers';
import { LogViewer } from './LogViewer';

interface PolicyPlugin {
  id: 'policy';
  config: {
    policy: string;
  };
}

export default function Review() {
  const { config, updateConfig } = useRedTeamConfig();
  const theme = useTheme();
  const { recordEvent } = useTelemetry();
  const [isYamlDialogOpen, setIsYamlDialogOpen] = React.useState(false);
  const yamlContent = useMemo(() => generateOrderedYaml(config), [config]);
  const [isRunning, setIsRunning] = React.useState(false);
  const [logs, setLogs] = React.useState<string[]>([]);

  const handleDescriptionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateConfig('description', event.target.value);
  };

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

  const handleRun = async () => {
    setIsRunning(true);
    setLogs([]);
    try {
      const response = await callApi('/redteam/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(getUnifiedConfig(config)),
      });

      const { id } = await response.json();

      // Poll for job status
      const pollInterval = setInterval(async () => {
        const statusResponse = await callApi(`/eval/job/${id}`);
        const status = await statusResponse.json();

        if (status.logs) {
          setLogs(status.logs);
        }

        if (status.status === 'complete') {
          clearInterval(pollInterval);
          setIsRunning(false);

          // Check if we have a result before navigating
          if (status.result) {
            // Navigate to the report page with the eval ID
            window.location.href = `/report?id=${status.result.evalId || id}`;
          } else {
            console.warn('No evaluation result was generated');
            alert(
              'The evaluation completed but no results were generated. Please check the logs for details.',
            );
          }
        } else if (status.status === 'error') {
          clearInterval(pollInterval);
          setIsRunning(false);
          // Handle error state
          alert('An error occurred during evaluation. Please check the logs for details.');
        }
      }, 1000);
    } catch (error) {
      console.error('Error running redteam:', error);
      setIsRunning(false);
      alert('An error occurred while starting the evaluation. Please try again.');
    }
  };

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
            evaluation process:
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
            Run the red team evaluation right here. Simpler but less powerful than the CLI:
          </Typography>
          <Box sx={{ mb: 2 }}>
            <Button
              variant="contained"
              color="primary"
              onClick={handleRun}
              disabled={isRunning}
              startIcon={isRunning && <CircularProgress size={20} color="inherit" />}
            >
              {isRunning ? 'Running...' : 'Run Now'}
            </Button>
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
    </Box>
  );
}
