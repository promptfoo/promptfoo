import React, { useCallback, useEffect, useMemo, useState } from 'react';

import Code from '@app/components/Code';
import { useEmailVerification } from '@app/hooks/useEmailVerification';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { useToast } from '@app/hooks/useToast';
import YamlEditor from '@app/pages/eval-creator/components/YamlEditor';
import { callApi } from '@app/utils/api';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AssessmentIcon from '@mui/icons-material/Assessment';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CircleIcon from '@mui/icons-material/Circle';
import CloseIcon from '@mui/icons-material/Close';
import DescriptionIcon from '@mui/icons-material/Description';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FlagIcon from '@mui/icons-material/Flag';
import InfoIcon from '@mui/icons-material/Info';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import SaveIcon from '@mui/icons-material/Save';
import SearchIcon from '@mui/icons-material/Search';
import SecurityIcon from '@mui/icons-material/Security';
import SettingsIcon from '@mui/icons-material/Settings';
import StopIcon from '@mui/icons-material/Stop';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
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
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Step from '@mui/material/Step';
import StepContent from '@mui/material/StepContent';
import StepLabel from '@mui/material/StepLabel';
import Stepper from '@mui/material/Stepper';
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
 * Prototype 2: Wizard-style Summary with Progressive Disclosure
 * - Step-by-step guided review with expandable sections
 * - Context-aware summaries at each step
 * - Progress indicator showing completion status
 * - Interactive cards that expand to show details
 */
export default function ReviewPrototype2() {
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

  // Wizard state
  const [activeStep, setActiveStep] = useState(0);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    purpose: true,
    plugins: false,
    strategies: false,
    runConfig: false,
  });

  const handleDescriptionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateConfig('description', event.target.value);
  };

  useEffect(() => {
    recordEvent('webui_page_view', { page: 'redteam_config_review_prototype2' });
  }, []);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
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

  const steps = [
    {
      label: 'Application Overview',
      icon: <LightbulbIcon />,
      completed: !!config.purpose || !!config.applicationDefinition?.purpose,
    },
    {
      label: 'Security Testing Scope',
      icon: <SecurityIcon />,
      completed: config.plugins.length > 0,
    },
    {
      label: 'Attack Strategies',
      icon: <FlagIcon />,
      completed: config.strategies.length > 0,
    },
    {
      label: 'Launch Configuration',
      icon: <RocketLaunchIcon />,
      completed: true,
    },
  ];

  return (
    <Box maxWidth="lg" mx="auto">
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

      {/* Progress Indicator */}
      <Paper elevation={1} sx={{ p: 3, mb: 4, background: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Configuration Progress
          </Typography>
          <Chip 
            label={`${steps.filter(s => s.completed).length}/${steps.length} Complete`}
            color="primary"
            size="small"
          />
        </Box>
        <LinearProgress 
          variant="determinate" 
          value={(steps.filter(s => s.completed).length / steps.length) * 100}
          sx={{ height: 8, borderRadius: 4, mb: 2 }}
        />
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          {steps.map((step, index) => (
            <Tooltip key={index} title={step.label}>
              <Box 
                sx={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center',
                  cursor: 'pointer',
                  opacity: step.completed ? 1 : 0.5,
                }}
                onClick={() => setActiveStep(index)}
              >
                {step.completed ? (
                  <CheckCircleIcon color="primary" />
                ) : (
                  <CircleIcon color="disabled" />
                )}
                <Typography variant="caption" sx={{ mt: 0.5 }}>
                  {index + 1}
                </Typography>
              </Box>
            </Tooltip>
          ))}
        </Box>
      </Paper>

      {/* Wizard Steps */}
      <Stepper activeStep={activeStep} orientation="vertical">
        <Step>
          <StepLabel icon={<LightbulbIcon />}>
            <Typography variant="h6">Application Overview</Typography>
          </StepLabel>
          <StepContent>
            <Card variant="outlined" sx={{ mb: 2 }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                      Purpose & Context
                    </Typography>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      {config.purpose || config.applicationDefinition?.purpose || 'No purpose specified'}
                    </Typography>
                    
                    {config.applicationDefinition && (
                      <Stack spacing={1}>
                        {config.applicationDefinition.industry && (
                          <Chip 
                            size="small" 
                            label={`Industry: ${config.applicationDefinition.industry}`}
                            icon={<InfoIcon />}
                          />
                        )}
                        {config.applicationDefinition.redteamUser && (
                          <Chip 
                            size="small" 
                            label={`Red Team Persona: ${config.applicationDefinition.redteamUser}`}
                            color="error"
                          />
                        )}
                      </Stack>
                    )}
                  </Box>
                  <IconButton onClick={() => toggleSection('purpose')}>
                    {expandedSections.purpose ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  </IconButton>
                </Box>
              </CardContent>
              <Collapse in={expandedSections.purpose}>
                <Divider />
                <CardContent>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <Typography variant="caption" color="text.secondary">Allowed Access</Typography>
                      <Typography variant="body2">
                        {config.applicationDefinition?.accessToData || 'Not specified'}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Typography variant="caption" color="text.secondary">Forbidden Access</Typography>
                      <Typography variant="body2">
                        {config.applicationDefinition?.forbiddenData || 'Not specified'}
                      </Typography>
                    </Grid>
                    {config.testGenerationInstructions && (
                      <Grid item xs={12}>
                        <Alert severity="info" sx={{ mt: 1 }}>
                          <AlertTitle>Test Generation Instructions</AlertTitle>
                          {config.testGenerationInstructions}
                        </Alert>
                      </Grid>
                    )}
                  </Grid>
                </CardContent>
              </Collapse>
              <CardActions>
                <Button size="small" onClick={() => setActiveStep(1)} endIcon={<ArrowForwardIcon />}>
                  Next: Security Testing
                </Button>
              </CardActions>
            </Card>
          </StepContent>
        </Step>

        <Step>
          <StepLabel icon={<SecurityIcon />}>
            <Typography variant="h6">Security Testing Scope</Typography>
          </StepLabel>
          <StepContent>
            <Card variant="outlined" sx={{ mb: 2 }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Box>
                    <Typography variant="subtitle1" fontWeight="bold">
                      {stats.pluginCount} Security Plugins Active
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Testing for vulnerabilities and compliance
                    </Typography>
                  </Box>
                  <IconButton onClick={() => toggleSection('plugins')}>
                    {expandedSections.plugins ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  </IconButton>
                </Box>
                
                {/* Plugin Summary Chips */}
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {pluginSummary.slice(0, 5).map(([label, count]) => (
                    <Chip
                      key={label}
                      label={count > 1 ? `${label} (${count})` : label}
                      size="small"
                      variant="outlined"
                    />
                  ))}
                  {pluginSummary.length > 5 && (
                    <Chip
                      label={`+${pluginSummary.length - 5} more`}
                      size="small"
                      variant="filled"
                    />
                  )}
                </Box>
              </CardContent>
              
              <Collapse in={expandedSections.plugins}>
                <Divider />
                <CardContent>
                  <Stack spacing={2}>
                    {/* Harmful Content Plugins */}
                    {pluginSummary.filter(([label]) => 
                      config.plugins.some(p => {
                        const id = typeof p === 'string' ? p : p.id;
                        return id.startsWith('harmful:') && (pluginDisplayNames[id as keyof typeof pluginDisplayNames] || id) === label;
                      })
                    ).length > 0 && (
                      <Box>
                        <Typography variant="subtitle2" color="error.main" gutterBottom>
                          Harmful Content Detection
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {pluginSummary.filter(([label]) => 
                            config.plugins.some(p => {
                              const id = typeof p === 'string' ? p : p.id;
                              return id.startsWith('harmful:') && (pluginDisplayNames[id as keyof typeof pluginDisplayNames] || id) === label;
                            })
                          ).map(([label, count]) => (
                            <Chip key={label} label={label} size="small" color="error" variant="outlined" />
                          ))}
                        </Box>
                      </Box>
                    )}
                    
                    {/* Custom Policies */}
                    {customPolicies.length > 0 && (
                      <Box>
                        <Typography variant="subtitle2" color="primary.main" gutterBottom>
                          Custom Policies ({customPolicies.length})
                        </Typography>
                        {customPolicies.map((policy, idx) => (
                          <Alert key={idx} severity="info" sx={{ mb: 1 }}>
                            <Typography variant="body2">{policy.config.policy}</Typography>
                          </Alert>
                        ))}
                      </Box>
                    )}
                    
                    {/* Custom Intents */}
                    {intents.length > 0 && (
                      <Box>
                        <Typography variant="subtitle2" color="secondary.main" gutterBottom>
                          Custom Attack Intents ({intents.length})
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {intents.slice(0, 10).map((intent, idx) => (
                            <Chip key={idx} label={intent} size="small" color="secondary" variant="outlined" />
                          ))}
                          {intents.length > 10 && (
                            <Chip label={`+${intents.length - 10} more`} size="small" />
                          )}
                        </Box>
                      </Box>
                    )}
                  </Stack>
                </CardContent>
              </Collapse>
              
              <CardActions>
                <Button size="small" onClick={() => setActiveStep(0)} startIcon={<ArrowBackIcon />}>
                  Back
                </Button>
                <Button size="small" onClick={() => setActiveStep(2)} endIcon={<ArrowForwardIcon />}>
                  Next: Attack Strategies
                </Button>
              </CardActions>
            </Card>
          </StepContent>
        </Step>

        <Step>
          <StepLabel icon={<FlagIcon />}>
            <Typography variant="h6">Attack Strategies</Typography>
          </StepLabel>
          <StepContent>
            <Card variant="outlined" sx={{ mb: 2 }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Box>
                    <Typography variant="subtitle1" fontWeight="bold">
                      {stats.strategyCount} Attack Strategies Enabled
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Different approaches to test your defenses
                    </Typography>
                  </Box>
                  <IconButton onClick={() => toggleSection('strategies')}>
                    {expandedSections.strategies ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  </IconButton>
                </Box>
                
                {/* Strategy Preview */}
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  {strategySummary.slice(0, 3).map(([label]) => (
                    <Chip
                      key={label}
                      label={label}
                      size="small"
                      color="primary"
                      variant="outlined"
                    />
                  ))}
                  {strategySummary.length > 3 && (
                    <Chip
                      label={`+${strategySummary.length - 3} more`}
                      size="small"
                      color="primary"
                    />
                  )}
                </Stack>
              </CardContent>
              
              <Collapse in={expandedSections.strategies}>
                <Divider />
                <CardContent>
                  <Stack spacing={1}>
                    {strategySummary.map(([label, count]) => (
                      <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" sx={{ flex: 1 }}>{label}</Typography>
                        <Chip label={`${count}x`} size="small" />
                      </Box>
                    ))}
                  </Stack>
                </CardContent>
              </Collapse>
              
              <CardActions>
                <Button size="small" onClick={() => setActiveStep(1)} startIcon={<ArrowBackIcon />}>
                  Back
                </Button>
                <Button size="small" onClick={() => setActiveStep(3)} endIcon={<ArrowForwardIcon />}>
                  Next: Launch Configuration
                </Button>
              </CardActions>
            </Card>
          </StepContent>
        </Step>

        <Step>
          <StepLabel icon={<RocketLaunchIcon />}>
            <Typography variant="h6">Launch Configuration</Typography>
          </StepLabel>
          <StepContent>
            <Card variant="outlined" sx={{ mb: 2 }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Box>
                    <Typography variant="subtitle1" fontWeight="bold">
                      Ready to Launch Red Team Evaluation
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {stats.totalTests} total test cases • ~{stats.estimatedMinutes} minutes runtime
                    </Typography>
                  </Box>
                  <IconButton onClick={() => toggleSection('runConfig')}>
                    {expandedSections.runConfig ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  </IconButton>
                </Box>
                
                {/* Quick Stats */}
                <Grid container spacing={2}>
                  <Grid item xs={6} sm={3}>
                    <Box sx={{ textAlign: 'center', p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                      <Typography variant="h6" color="primary">{stats.totalTests}</Typography>
                      <Typography variant="caption">Test Cases</Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Box sx={{ textAlign: 'center', p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                      <Typography variant="h6" color="secondary">{stats.concurrency}</Typography>
                      <Typography variant="caption">Threads</Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Box sx={{ textAlign: 'center', p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                      <Typography variant="h6" color="warning.main">{stats.delay}ms</Typography>
                      <Typography variant="caption">Delay</Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Box sx={{ textAlign: 'center', p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                      <Typography variant="h6" color="info.main">~{stats.estimatedMinutes}m</Typography>
                      <Typography variant="caption">Runtime</Typography>
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
              
              <Collapse in={expandedSections.runConfig}>
                <Divider />
                <CardContent>
                  <Stack spacing={2}>
                    <Alert severity="info">
                      <AlertTitle>Test Execution Details</AlertTitle>
                      <Typography variant="body2">
                        • {stats.pluginCount} plugins × {stats.strategyCount} strategies × {stats.testsPerPlugin} tests each
                        <br />
                        • Running {stats.concurrency} tests concurrently
                        {stats.delay > 0 && (
                          <>
                            <br />
                            • {stats.delay}ms delay between API calls for rate limiting
                          </>
                        )}
                      </Typography>
                    </Alert>
                    
                    <FormControlLabel
                      control={
                        <Switch
                          checked={debugMode}
                          onChange={(e) => setDebugMode(e.target.checked)}
                        />
                      }
                      label="Enable debug mode for detailed logs"
                    />
                  </Stack>
                </CardContent>
              </Collapse>
              
              <Divider />
              <CardActions sx={{ justifyContent: 'space-between', p: 2 }}>
                <Button size="small" onClick={() => setActiveStep(2)} startIcon={<ArrowBackIcon />}>
                  Back
                </Button>
                <Stack direction="row" spacing={2}>
                  <Button
                    variant="outlined"
                    onClick={handleSaveYaml}
                    startIcon={<SaveIcon />}
                  >
                    Export YAML
                  </Button>
                  <Button
                    variant="contained"
                    color="success"
                    onClick={handleRunWithSettings}
                    disabled={isRunning}
                    startIcon={isRunning ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />}
                  >
                    {isRunning ? 'Running...' : 'Launch Evaluation'}
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
                  <IconButton onClick={() => setIsRunSettingsDialogOpen(true)} disabled={isRunning}>
                    <SettingsIcon />
                  </IconButton>
                </Stack>
              </CardActions>
            </Card>
            
            {evalId && (
              <Alert severity="success" sx={{ mb: 2 }}>
                <AlertTitle>Evaluation Complete!</AlertTitle>
                <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                  <Button
                    variant="contained"
                    size="small"
                    href={`/report?evalId=${evalId}`}
                    startIcon={<AssessmentIcon />}
                  >
                    View Report
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    href={`/eval?evalId=${evalId}`}
                    startIcon={<SearchIcon />}
                  >
                    View Details
                  </Button>
                </Stack>
              </Alert>
            )}
            
            {logs.length > 0 && (
              <Card variant="outlined">
                <CardContent>
                  <LogViewer logs={logs} />
                </CardContent>
              </Card>
            )}
          </StepContent>
        </Step>
      </Stepper>

      {/* Additional Options */}
      <Paper elevation={1} sx={{ p: 3, mt: 4 }}>
        <Typography variant="h6" gutterBottom>
          Additional Options
        </Typography>
        <Stack direction="row" spacing={2}>
          <Button
            variant="outlined"
            onClick={() => setIsYamlDialogOpen(true)}
            startIcon={<VisibilityIcon />}
          >
            Preview Full YAML
          </Button>
          <Button
            variant="outlined"
            startIcon={<DescriptionIcon />}
          >
            View Documentation
          </Button>
        </Stack>
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