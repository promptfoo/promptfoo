import React, { useCallback, useEffect, useMemo, useState } from 'react';

import Code from '@app/components/Code';
import { useEmailVerification } from '@app/hooks/useEmailVerification';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { useToast } from '@app/hooks/useToast';
import YamlEditor from '@app/pages/eval-creator/components/YamlEditor';
import { callApi } from '@app/utils/api';
import AssessmentIcon from '@mui/icons-material/Assessment';
import BusinessIcon from '@mui/icons-material/Business';
import CategoryIcon from '@mui/icons-material/Category';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import DangerousIcon from '@mui/icons-material/Dangerous';
import DataObjectIcon from '@mui/icons-material/DataObject';
import DescriptionIcon from '@mui/icons-material/Description';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExtensionIcon from '@mui/icons-material/Extension';
import GroupIcon from '@mui/icons-material/Group';
import InfoIcon from '@mui/icons-material/Info';
import LockIcon from '@mui/icons-material/Lock';
import PersonIcon from '@mui/icons-material/Person';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PsychologyIcon from '@mui/icons-material/Psychology';
import SaveIcon from '@mui/icons-material/Save';
import SearchIcon from '@mui/icons-material/Search';
import SecurityIcon from '@mui/icons-material/Security';
import SettingsIcon from '@mui/icons-material/Settings';
import SpeedIcon from '@mui/icons-material/Speed';
import StopIcon from '@mui/icons-material/Stop';
import StorageIcon from '@mui/icons-material/Storage';
import TuneIcon from '@mui/icons-material/Tune';
import VisibilityIcon from '@mui/icons-material/Visibility';
import WarningIcon from '@mui/icons-material/Warning';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
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
import DefaultTestVariables from './DefaultTestVariables';
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
 * Prototype 1: Comprehensive Dashboard Layout
 * - Rich application context section with visual indicators
 * - Enhanced plugin and strategy summaries with better grouping
 * - Detailed test run configuration with visual metrics
 * - Progressive disclosure for complex information
 */
export default function ReviewPrototype1() {
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

  const handleDescriptionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateConfig('description', event.target.value);
  };

  useEffect(() => {
    recordEvent('webui_page_view', { page: 'redteam_config_review_prototype1' });
  }, []);

  // Calculate estimated test cases
  const estimatedTestCases = useMemo(() => {
    const pluginCount = config.plugins.length;
    const strategyCount = config.strategies.length;
    const testsPerPlugin = config.numTests || REDTEAM_DEFAULTS.NUM_TESTS;
    return pluginCount * strategyCount * testsPerPlugin;
  }, [config.plugins.length, config.strategies.length, config.numTests]);

  // Calculate estimated runtime
  const estimatedRuntime = useMemo(() => {
    const concurrency = Number(maxConcurrency) || REDTEAM_DEFAULTS.MAX_CONCURRENCY;
    const delay = Number(delayMs) || 0;
    const totalTests = estimatedTestCases;
    const timePerTest = delay > 0 ? delay : 500; // Assume 500ms per test if no delay
    const totalTime = (totalTests * timePerTest) / concurrency;
    return Math.ceil(totalTime / 60000); // Convert to minutes
  }, [estimatedTestCases, maxConcurrency, delayMs]);

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

  // Group plugins by category
  const pluginsByCategory = useMemo(() => {
    const categories = new Map<string, string[]>();
    
    config.plugins.forEach((plugin) => {
      const pluginId = typeof plugin === 'string' ? plugin : plugin.id;
      let category = 'Other';
      
      if (pluginId.startsWith('harmful:')) category = 'Harmful Content';
      else if (pluginId.startsWith('pii:')) category = 'PII & Privacy';
      else if (pluginId.startsWith('bias:')) category = 'Bias';
      else if (pluginId.startsWith('medical:')) category = 'Medical';
      else if (pluginId.startsWith('financial:')) category = 'Financial';
      else if (pluginId === 'policy') category = 'Custom Policies';
      else if (pluginId === 'intent') category = 'Custom Intents';
      else if (['contracts', 'excessive-agency', 'hallucination', 'hijacking', 'politics'].includes(pluginId)) {
        category = 'Core Security';
      }
      
      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category)!.push(pluginId);
    });
    
    return categories;
  }, [config.plugins]);

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

  return (
    <Box maxWidth="xl" mx="auto">
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold', mb: 4 }}>
        Review Your Red Team Configuration
      </Typography>

      <TextField
        fullWidth
        label="Configuration Name"
        placeholder="My Red Team Configuration"
        value={config.description}
        onChange={handleDescriptionChange}
        variant="outlined"
        sx={{ mb: 4 }}
        InputProps={{
          startAdornment: <DescriptionIcon sx={{ mr: 1, color: 'text.secondary' }} />,
        }}
      />

      {/* Application Context Section */}
      <Paper elevation={3} sx={{ p: 4, mb: 4, background: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
        <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
          <BusinessIcon /> Application Context
        </Typography>
        
        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom color="primary">
                  Application Purpose & Overview
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 2 }}>
                  {config.purpose || config.applicationDefinition?.purpose || 'No purpose specified'}
                </Typography>
                
                {config.applicationDefinition && (
                  <>
                    <Divider sx={{ my: 2 }} />
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6}>
                        <Typography variant="caption" color="text.secondary">Industry</Typography>
                        <Typography variant="body2">{config.applicationDefinition.industry || 'Not specified'}</Typography>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Typography variant="caption" color="text.secondary">User Types</Typography>
                        <Typography variant="body2">{config.applicationDefinition.userTypes || 'Not specified'}</Typography>
                      </Grid>
                    </Grid>
                  </>
                )}
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Stack spacing={2}>
              <Card variant="outlined">
                <CardContent>
                  <Box display="flex" alignItems="center" gap={1} mb={1}>
                    <Avatar sx={{ bgcolor: 'error.main', width: 32, height: 32 }}>
                      <PersonIcon fontSize="small" />
                    </Avatar>
                    <Typography variant="subtitle2" fontWeight="bold">Red Team Persona</Typography>
                  </Box>
                  <Typography variant="body2">
                    {config.applicationDefinition?.redteamUser || 'Default attacker persona'}
                  </Typography>
                </CardContent>
              </Card>
              
              <Card variant="outlined">
                <CardContent>
                  <Box display="flex" alignItems="center" gap={1} mb={1}>
                    <Avatar sx={{ bgcolor: 'info.main', width: 32, height: 32 }}>
                      <SecurityIcon fontSize="small" />
                    </Avatar>
                    <Typography variant="subtitle2" fontWeight="bold">Attack Constraints</Typography>
                  </Box>
                  <Typography variant="body2">
                    {config.applicationDefinition?.attackConstraints || 'No specific constraints'}
                  </Typography>
                </CardContent>
              </Card>
            </Stack>
          </Grid>
        </Grid>

        {/* Security Requirements */}
        <Grid container spacing={3} sx={{ mt: 2 }}>
          <Grid item xs={12} md={6}>
            <Card variant="outlined" sx={{ borderColor: 'success.main', borderWidth: 2 }}>
              <CardContent>
                <Typography variant="subtitle2" fontWeight="bold" color="success.main" gutterBottom>
                  <CheckCircleIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                  Allowed Access
                </Typography>
                <List dense>
                  <ListItem>
                    <ListItemIcon><DataObjectIcon fontSize="small" /></ListItemIcon>
                    <ListItemText 
                      primary="Data Access"
                      secondary={config.applicationDefinition?.accessToData || 'Not specified'}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><ExtensionIcon fontSize="small" /></ListItemIcon>
                    <ListItemText 
                      primary="Action Access"
                      secondary={config.applicationDefinition?.accessToActions || 'Not specified'}
                    />
                  </ListItem>
                </List>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Card variant="outlined" sx={{ borderColor: 'error.main', borderWidth: 2 }}>
              <CardContent>
                <Typography variant="subtitle2" fontWeight="bold" color="error.main" gutterBottom>
                  <DangerousIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                  Forbidden Access
                </Typography>
                <List dense>
                  <ListItem>
                    <ListItemIcon><LockIcon fontSize="small" color="error" /></ListItemIcon>
                    <ListItemText 
                      primary="Forbidden Data"
                      secondary={config.applicationDefinition?.forbiddenData || 'Not specified'}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><WarningIcon fontSize="small" color="error" /></ListItemIcon>
                    <ListItemText 
                      primary="Forbidden Actions"
                      secondary={config.applicationDefinition?.forbiddenActions || 'Not specified'}
                    />
                  </ListItem>
                </List>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {config.testGenerationInstructions && (
          <Alert severity="info" sx={{ mt: 3 }}>
            <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
              Test Generation Instructions
            </Typography>
            <Typography variant="body2">
              {config.testGenerationInstructions}
            </Typography>
          </Alert>
        )}
      </Paper>

      {/* Testing Configuration Section */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} lg={6}>
          <Paper elevation={2} sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CategoryIcon /> Plugins by Category
            </Typography>
            <Box sx={{ mt: 2 }}>
              {Array.from(pluginsByCategory.entries()).map(([category, plugins]) => (
                <Box key={category} sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    {category} ({plugins.length})
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {plugins.map((pluginId) => (
                      <Chip
                        key={pluginId}
                        label={pluginDisplayNames[pluginId as keyof typeof pluginDisplayNames] || pluginId}
                        size="small"
                        variant="outlined"
                        sx={{ 
                          borderColor: category === 'Harmful Content' ? 'error.main' : 
                                      category === 'Custom Policies' ? 'primary.main' : 
                                      'divider'
                        }}
                      />
                    ))}
                  </Box>
                </Box>
              ))}
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} lg={6}>
          <Paper elevation={2} sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <PsychologyIcon /> Strategies ({strategySummary.length})
            </Typography>
            <Box sx={{ mt: 2 }}>
              {strategySummary.map(([label, count]) => (
                <Box key={label} sx={{ mb: 1.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                    <Typography variant="body2">{label}</Typography>
                    <Chip label={count} size="small" color="primary" />
                  </Box>
                  <LinearProgress 
                    variant="determinate" 
                    value={(count / config.strategies.length) * 100} 
                    sx={{ height: 6, borderRadius: 3 }}
                  />
                </Box>
              ))}
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Test Run Configuration */}
      <Paper elevation={3} sx={{ p: 4, mb: 4, background: theme.palette.mode === 'dark' ? 'rgba(25,118,210,0.08)' : 'rgba(25,118,210,0.04)' }}>
        <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
          <SpeedIcon /> Test Run Configuration
        </Typography>
        
        <Grid container spacing={3}>
          <Grid item xs={12} md={3}>
            <Card variant="outlined">
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="h3" color="primary" fontWeight="bold">
                  {estimatedTestCases}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Total Test Cases
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {config.plugins.length} plugins × {config.strategies.length} strategies × {config.numTests || REDTEAM_DEFAULTS.NUM_TESTS} tests
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={3}>
            <Card variant="outlined">
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="h3" color="secondary" fontWeight="bold">
                  {maxConcurrency}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Concurrent Threads
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Max parallel executions
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={3}>
            <Card variant="outlined">
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="h3" color="warning.main" fontWeight="bold">
                  {delayMs || 0}ms
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  API Call Delay
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Rate limiting protection
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={3}>
            <Card variant="outlined">
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="h3" color="info.main" fontWeight="bold">
                  ~{estimatedRuntime}m
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Estimated Runtime
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Based on current settings
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Box sx={{ mt: 3, display: 'flex', gap: 2, alignItems: 'center' }}>
          <FormControlLabel
            control={
              <Switch
                checked={debugMode}
                onChange={(e) => setDebugMode(e.target.checked)}
                disabled={isRunning}
              />
            }
            label="Debug Mode"
          />
          <Chip 
            icon={<InfoIcon />} 
            label="Shows detailed logs during execution" 
            size="small" 
            variant="outlined"
          />
        </Box>
      </Paper>

      <Divider sx={{ my: 4 }} />

      {/* Advanced Configuration */}
      <Accordion sx={{ mb: 4, '&:before': { display: 'none' }, boxShadow: theme.shadows[1] }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TuneIcon fontSize="small" color="action" />
            <Typography variant="h6">Advanced Configuration</Typography>
            <Chip label="Optional" size="small" variant="outlined" sx={{ ml: 1 }} />
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <DefaultTestVariables />
        </AccordionDetails>
      </Accordion>

      {/* Action Buttons */}
      <Paper elevation={2} sx={{ p: 3 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Box>
              <Typography variant="h6" gutterBottom>
                Option 1: Export for CLI
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Save configuration for command-line execution with full control
              </Typography>
              <Stack direction="row" spacing={2}>
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
                  onClick={() => setIsYamlDialogOpen(true)}
                  startIcon={<VisibilityIcon />}
                >
                  Preview YAML
                </Button>
              </Stack>
            </Box>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Box>
              <Typography variant="h6" gutterBottom>
                Option 2: Run in Browser
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Execute red team evaluation directly in your browser
              </Typography>
              <Stack direction="row" spacing={2} alignItems="center">
                <Button
                  variant="contained"
                  color="success"
                  onClick={handleRunWithSettings}
                  disabled={isRunning}
                  startIcon={isRunning ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />}
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
                      variant="outlined"
                      href={`/report?evalId=${evalId}`}
                      startIcon={<AssessmentIcon />}
                    >
                      View Report
                    </Button>
                    <Button
                      variant="outlined"
                      href={`/eval?evalId=${evalId}`}
                      startIcon={<SearchIcon />}
                    >
                      View Details
                    </Button>
                  </>
                )}
                <IconButton onClick={() => setIsRunSettingsDialogOpen(true)} disabled={isRunning}>
                  <SettingsIcon />
                </IconButton>
              </Stack>
            </Box>
          </Grid>
        </Grid>
        
        {logs.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <LogViewer logs={logs} />
          </Box>
        )}
      </Paper>

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

      <Dialog open={isRunSettingsDialogOpen} onClose={() => setIsRunSettingsDialogOpen(false)}>
        <DialogTitle>Run Settings</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1, minWidth: 400 }}>
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
                    Show detailed logs during execution
                  </Typography>
                </Box>
              }
            />
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
              helperText="Tests to generate per plugin"
            />
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
              disabled={isRunning}
              helperText="Maximum parallel evaluations"
            />
            <TextField
              fullWidth
              type="number"
              label="API call delay (ms)"
              value={delayMs}
              onChange={(e) => {
                const value = e.target.value;
                if (!Number.isNaN(Number(value)) && Number(value) >= 0) {
                  setDelayMs(value);
                }
              }}
              disabled={isRunning}
              helperText="Delay between API calls"
            />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
              <Button onClick={() => setIsRunSettingsDialogOpen(false)}>Done</Button>
            </Box>
          </Stack>
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