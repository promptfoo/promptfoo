import React, { useCallback, useEffect, useMemo, useState } from 'react';

import Code from '@app/components/Code';
import { useEmailVerification } from '@app/hooks/useEmailVerification';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { useToast } from '@app/hooks/useToast';
import YamlEditor from '@app/pages/eval-creator/components/YamlEditor';
import { callApi } from '@app/utils/api';
import AssessmentIcon from '@mui/icons-material/Assessment';
import AutoGraphIcon from '@mui/icons-material/AutoGraph';
import BugReportIcon from '@mui/icons-material/BugReport';
import CloseIcon from '@mui/icons-material/Close';
import CodeIcon from '@mui/icons-material/Code';
import DashboardIcon from '@mui/icons-material/Dashboard';
import DescriptionIcon from '@mui/icons-material/Description';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import GppBadIcon from '@mui/icons-material/GppBad';
import GroupWorkIcon from '@mui/icons-material/GroupWork';
import HubIcon from '@mui/icons-material/Hub';
import InfoIcon from '@mui/icons-material/Info';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import MemoryIcon from '@mui/icons-material/Memory';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PolicyIcon from '@mui/icons-material/Policy';
import SaveIcon from '@mui/icons-material/Save';
import SearchIcon from '@mui/icons-material/Search';
import SecurityIcon from '@mui/icons-material/Security';
import SettingsIcon from '@mui/icons-material/Settings';
import ShieldIcon from '@mui/icons-material/Shield';
import SpeedIcon from '@mui/icons-material/Speed';
import StopIcon from '@mui/icons-material/Stop';
import TargetIcon from '@mui/icons-material/TrackChanges';
import TuneIcon from '@mui/icons-material/Tune';
import VisibilityIcon from '@mui/icons-material/Visibility';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
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
 * Prototype 3: Visual-First Design with Infographics
 * - Visual representations of test coverage and attack surface
 * - Graphical indicators for security domains
 * - Icon-heavy design for quick scanning
 * - Color-coded severity and risk indicators
 */
export default function ReviewPrototype3() {
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
    recordEvent('webui_page_view', { page: 'redteam_config_review_prototype3' });
  }, []);

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

  // Security coverage analysis
  const securityCoverage = useMemo(() => {
    const categories = {
      harmful: 0,
      pii: 0,
      bias: 0,
      security: 0,
      custom: 0,
    };

    config.plugins.forEach((plugin) => {
      const pluginId = typeof plugin === 'string' ? plugin : plugin.id;
      if (pluginId.startsWith('harmful:')) categories.harmful++;
      else if (pluginId.startsWith('pii:')) categories.pii++;
      else if (pluginId.startsWith('bias:')) categories.bias++;
      else if (pluginId === 'policy' || pluginId === 'intent') categories.custom++;
      else categories.security++;
    });

    const total = Object.values(categories).reduce((sum, count) => sum + count, 0);
    
    return Object.entries(categories).map(([category, count]) => ({
      category,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    }));
  }, [config.plugins]);

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

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'harmful': return <GppBadIcon />;
      case 'pii': return <LockOpenIcon />;
      case 'bias': return <GroupWorkIcon />;
      case 'security': return <SecurityIcon />;
      case 'custom': return <CodeIcon />;
      default: return <BugReportIcon />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'harmful': return 'error';
      case 'pii': return 'warning';
      case 'bias': return 'info';
      case 'security': return 'primary';
      case 'custom': return 'secondary';
      default: return 'default';
    }
  };

  return (
    <Box maxWidth="xl" mx="auto">
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold', mb: 4 }}>
        Red Team Configuration Overview
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

      {/* Visual Attack Surface Overview */}
      <Paper elevation={3} sx={{ p: 4, mb: 4, background: `linear-gradient(135deg, ${theme.palette.primary.dark}10 0%, ${theme.palette.secondary.dark}10 100%)` }}>
        <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
          <DashboardIcon /> Attack Surface Overview
        </Typography>
        
        <Grid container spacing={3}>
          {/* Security Coverage Visualization */}
          <Grid item xs={12} md={6}>
            <Card sx={{ height: '100%', position: 'relative', overflow: 'hidden' }}>
              <Box sx={{ position: 'absolute', top: 0, right: 0, opacity: 0.1 }}>
                <ShieldIcon sx={{ fontSize: 200 }} />
              </Box>
              <CardContent>
                <Typography variant="h6" gutterBottom>Security Coverage Distribution</Typography>
                <Box sx={{ mt: 3 }}>
                  {securityCoverage.map((item) => (
                    <Box key={item.category} sx={{ mb: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        {getCategoryIcon(item.category)}
                        <Typography variant="body2" sx={{ ml: 1, flex: 1, textTransform: 'capitalize' }}>
                          {item.category}
                        </Typography>
                        <Chip 
                          label={`${item.count} plugins`} 
                          size="small" 
                          color={getCategoryColor(item.category) as any}
                        />
                      </Box>
                      <Box sx={{ position: 'relative', height: 24, bgcolor: 'action.hover', borderRadius: 12, overflow: 'hidden' }}>
                        <Box
                          sx={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            height: '100%',
                            width: `${item.percentage}%`,
                            bgcolor: `${getCategoryColor(item.category)}.main`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'width 0.3s ease',
                          }}
                        >
                          <Typography variant="caption" sx={{ color: 'white', fontWeight: 'bold' }}>
                            {item.percentage}%
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Attack Vector Summary */}
          <Grid item xs={12} md={6}>
            <Card sx={{ height: '100%', position: 'relative', overflow: 'hidden' }}>
              <Box sx={{ position: 'absolute', top: 0, right: 0, opacity: 0.1 }}>
                <TargetIcon sx={{ fontSize: 200 }} />
              </Box>
              <CardContent>
                <Typography variant="h6" gutterBottom>Attack Vectors</Typography>
                <Grid container spacing={2} sx={{ mt: 1 }}>
                  <Grid item xs={6}>
                    <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'primary.main', borderRadius: 2, color: 'primary.contrastText' }}>
                      <HubIcon sx={{ fontSize: 40, mb: 1 }} />
                      <Typography variant="h4" fontWeight="bold">{stats.pluginCount}</Typography>
                      <Typography variant="caption">Attack Plugins</Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6}>
                    <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'secondary.main', borderRadius: 2, color: 'secondary.contrastText' }}>
                      <AutoGraphIcon sx={{ fontSize: 40, mb: 1 }} />
                      <Typography variant="h4" fontWeight="bold">{stats.strategyCount}</Typography>
                      <Typography variant="caption">Strategies</Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12}>
                    <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'action.hover', borderRadius: 2, mt: 1 }}>
                      <Typography variant="h3" color="text.primary" fontWeight="bold">
                        {stats.totalTests}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Total Attack Scenarios
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Paper>

      {/* Application Security Context */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} lg={8}>
          <Paper elevation={2} sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <InfoIcon /> Application Security Context
            </Typography>
            
            <Grid container spacing={2} sx={{ mt: 1 }}>
              {/* Purpose Card */}
              <Grid item xs={12}>
                <Alert severity="info" icon={<TargetIcon />}>
                  <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                    Application Purpose
                  </Typography>
                  <Typography variant="body2">
                    {config.purpose || config.applicationDefinition?.purpose || 'No purpose specified'}
                  </Typography>
                </Alert>
              </Grid>

              {/* Security Boundaries */}
              <Grid item xs={12} md={6}>
                <Card variant="outlined" sx={{ borderColor: 'success.main', borderWidth: 2 }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <ShieldIcon color="success" />
                      <Typography variant="subtitle2" fontWeight="bold" color="success.main">
                        Allowed Operations
                      </Typography>
                    </Box>
                    <Stack spacing={1}>
                      <Chip 
                        icon={<InfoIcon />} 
                        label={config.applicationDefinition?.accessToData || 'No data access defined'}
                        size="small"
                        variant="outlined"
                        color="success"
                      />
                      <Chip 
                        icon={<MemoryIcon />} 
                        label={config.applicationDefinition?.accessToActions || 'No actions defined'}
                        size="small"
                        variant="outlined"
                        color="success"
                      />
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={6}>
                <Card variant="outlined" sx={{ borderColor: 'error.main', borderWidth: 2 }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <WarningAmberIcon color="error" />
                      <Typography variant="subtitle2" fontWeight="bold" color="error.main">
                        Forbidden Operations
                      </Typography>
                    </Box>
                    <Stack spacing={1}>
                      <Chip 
                        icon={<CloseIcon />} 
                        label={config.applicationDefinition?.forbiddenData || 'No restrictions defined'}
                        size="small"
                        variant="outlined"
                        color="error"
                      />
                      <Chip 
                        icon={<CloseIcon />} 
                        label={config.applicationDefinition?.forbiddenActions || 'No restrictions defined'}
                        size="small"
                        variant="outlined"
                        color="error"
                      />
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* Quick Stats */}
        <Grid item xs={12} lg={4}>
          <Paper elevation={2} sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <SpeedIcon /> Execution Metrics
            </Typography>
            
            <Stack spacing={2} sx={{ mt: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ p: 1.5, bgcolor: 'primary.main', borderRadius: '50%', color: 'primary.contrastText' }}>
                  <SpeedIcon />
                </Box>
                <Box>
                  <Typography variant="h6">{stats.concurrency} threads</Typography>
                  <Typography variant="caption" color="text.secondary">Concurrent execution</Typography>
                </Box>
              </Box>
              
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ p: 1.5, bgcolor: 'warning.main', borderRadius: '50%', color: 'warning.contrastText' }}>
                  <SettingsIcon />
                </Box>
                <Box>
                  <Typography variant="h6">{stats.delay || 0}ms delay</Typography>
                  <Typography variant="caption" color="text.secondary">Between API calls</Typography>
                </Box>
              </Box>
              
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ p: 1.5, bgcolor: 'info.main', borderRadius: '50%', color: 'info.contrastText' }}>
                  <AutoGraphIcon />
                </Box>
                <Box>
                  <Typography variant="h6">~{stats.estimatedMinutes} minutes</Typography>
                  <Typography variant="caption" color="text.secondary">Estimated runtime</Typography>
                </Box>
              </Box>
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      {/* Visual Plugin Gallery */}
      <Paper elevation={2} sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <BugReportIcon /> Active Security Plugins
        </Typography>
        
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2 }}>
          {pluginSummary.map(([label, count]) => {
            const plugin = config.plugins.find(p => {
              const pLabel = getPluginSummary(p).label;
              return pLabel === label;
            });
            const pluginId = typeof plugin === 'string' ? plugin : plugin?.id;
            const category = pluginId?.startsWith('harmful:') ? 'harmful' :
                           pluginId?.startsWith('pii:') ? 'pii' :
                           pluginId?.startsWith('bias:') ? 'bias' :
                           pluginId === 'policy' || pluginId === 'intent' ? 'custom' : 'security';
            
            return (
              <Chip
                key={label}
                icon={getCategoryIcon(category)}
                label={count > 1 ? `${label} (${count})` : label}
                color={getCategoryColor(category) as any}
                variant="outlined"
                sx={{ 
                  borderWidth: 2,
                  '&:hover': {
                    borderColor: `${getCategoryColor(category)}.dark`,
                    bgcolor: `${getCategoryColor(category)}.main`,
                    color: `${getCategoryColor(category)}.contrastText`,
                  }
                }}
              />
            );
          })}
        </Box>

        {/* Custom Policies Visual */}
        {customPolicies.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <PolicyIcon color="primary" /> Custom Security Policies
            </Typography>
            <Grid container spacing={1}>
              {customPolicies.map((policy, idx) => (
                <Grid item xs={12} md={6} key={idx}>
                  <Alert severity="info" icon={<PolicyIcon />} sx={{ height: '100%' }}>
                    <Typography variant="body2">{policy.config.policy}</Typography>
                  </Alert>
                </Grid>
              ))}
            </Grid>
          </Box>
        )}
      </Paper>

      {/* Strategy Visualization */}
      <Paper elevation={2} sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AutoGraphIcon /> Attack Strategy Matrix
        </Typography>
        
        <Grid container spacing={2} sx={{ mt: 1 }}>
          {strategySummary.map(([label, count]) => (
            <Grid item xs={12} sm={6} md={4} key={label}>
              <Card variant="outlined" sx={{ 
                borderColor: 'primary.main',
                '&:hover': { borderColor: 'primary.dark', bgcolor: 'action.hover' }
              }}>
                <CardContent sx={{ textAlign: 'center' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
                    <Box sx={{ 
                      width: 60, 
                      height: 60, 
                      borderRadius: '50%', 
                      bgcolor: 'primary.main',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'primary.contrastText'
                    }}>
                      <Typography variant="h5" fontWeight="bold">{count}</Typography>
                    </Box>
                  </Box>
                  <Typography variant="body2" fontWeight="bold">{label}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
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

      {/* Launch Panel */}
      <Paper elevation={3} sx={{ 
        p: 4, 
        background: `linear-gradient(135deg, ${theme.palette.success.dark}20 0%, ${theme.palette.primary.dark}20 100%)`,
        position: 'relative',
        overflow: 'hidden'
      }}>
        <Box sx={{ position: 'absolute', top: -50, right: -50, opacity: 0.1 }}>
          <PlayArrowIcon sx={{ fontSize: 300 }} />
        </Box>
        
        <Typography variant="h5" gutterBottom sx={{ position: 'relative', zIndex: 1 }}>
          Ready to Launch Red Team Evaluation
        </Typography>
        
        <Grid container spacing={3} sx={{ position: 'relative', zIndex: 1 }}>
          <Grid item xs={12} md={6}>
            <Typography variant="h6" gutterBottom>Export Configuration</Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Save for command-line execution with full control
            </Typography>
            <Stack direction="row" spacing={2}>
              <Button
                variant="contained"
                onClick={handleSaveYaml}
                startIcon={<SaveIcon />}
              >
                Download YAML
              </Button>
              <Button
                variant="outlined"
                onClick={() => setIsYamlDialogOpen(true)}
                startIcon={<VisibilityIcon />}
              >
                Preview
              </Button>
            </Stack>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Typography variant="h6" gutterBottom>Execute in Browser</Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Run the evaluation directly from your browser
            </Typography>
            <Stack direction="row" spacing={2} alignItems="center">
              <Button
                variant="contained"
                color="success"
                size="large"
                onClick={handleRunWithSettings}
                disabled={isRunning}
                startIcon={isRunning ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />}
              >
                {isRunning ? 'Running...' : 'Launch Attack'}
              </Button>
              {isRunning && (
                <Button
                  variant="contained"
                  color="error"
                  onClick={handleCancel}
                  startIcon={<StopIcon />}
                >
                  Abort
                </Button>
              )}
              {evalId && (
                <>
                  <Button
                    variant="outlined"
                    href={`/report?evalId=${evalId}`}
                    startIcon={<AssessmentIcon />}
                  >
                    Report
                  </Button>
                  <Button
                    variant="outlined"
                    href={`/eval?evalId=${evalId}`}
                    startIcon={<SearchIcon />}
                  >
                    Details
                  </Button>
                </>
              )}
              <IconButton onClick={() => setIsRunSettingsDialogOpen(true)} disabled={isRunning}>
                <SettingsIcon />
              </IconButton>
            </Stack>
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