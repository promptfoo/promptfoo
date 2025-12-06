import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Code from '@app/components/Code';
import { useApiHealth } from '@app/hooks/useApiHealth';
import { useEmailVerification } from '@app/hooks/useEmailVerification';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { useToast } from '@app/hooks/useToast';
import YamlEditor from '@app/pages/eval-creator/components/YamlEditor';
import { useRedteamJobStore } from '@app/stores/redteamJobStore';
import { callApi } from '@app/utils/api';
import AssessmentIcon from '@mui/icons-material/Assessment';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SaveIcon from '@mui/icons-material/Save';
import SearchIcon from '@mui/icons-material/Search';
import StopIcon from '@mui/icons-material/Stop';
import TuneIcon from '@mui/icons-material/Tune';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Grid from '@mui/material/Grid';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { isFoundationModelProvider } from '@promptfoo/constants';
import { REDTEAM_DEFAULTS, strategyDisplayNames } from '@promptfoo/redteam/constants';
import { getUnifiedConfig } from '@promptfoo/redteam/sharedFrontend';
import { Link } from 'react-router-dom';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';
import { generateOrderedYaml } from '../utils/yamlHelpers';
import DefaultTestVariables from './DefaultTestVariables';
import { EmailVerificationDialog } from './EmailVerificationDialog';
import { LogViewer } from './LogViewer';
import PageWrapper from './PageWrapper';
import { RunOptionsContent } from './RunOptions';
import type { RedteamRunOptions } from '@promptfoo/types';

import type { RedteamPlugin, Policy, PolicyObject } from '@promptfoo/redteam/types';
import type { Job } from '@promptfoo/types';
import EstimationsDisplay from './EstimationsDisplay';
import Tooltip from '@mui/material/Tooltip';
import {
  isValidPolicyObject,
  makeDefaultPolicyName,
} from '@promptfoo/redteam/plugins/policy/utils';

interface ReviewProps {
  onBack?: () => void;
  navigateToPlugins: () => void;
  navigateToStrategies: () => void;
  navigateToPurpose: () => void;
}

interface PolicyPlugin {
  id: 'policy';
  config: { policy: Policy };
}

interface JobStatusResponse {
  hasRunningJob: boolean;
  jobId?: string;
}

export default function Review({
  onBack,
  navigateToPlugins,
  navigateToStrategies,
  navigateToPurpose,
}: ReviewProps) {
  const { config, updateConfig } = useRedTeamConfig();
  const theme = useTheme();
  const { recordEvent } = useTelemetry();
  const {
    data: { status: apiHealthStatus },
    isLoading: isCheckingApiHealth,
  } = useApiHealth();
  const { jobId: savedJobId, setJob, clearJob } = useRedteamJobStore();
  const pollIntervalRef = useRef<number | null>(null);
  const [isYamlDialogOpen, setIsYamlDialogOpen] = React.useState(false);
  const yamlContent = useMemo(() => generateOrderedYaml(config), [config]);

  const [isRunning, setIsRunning] = React.useState(false);
  const [logs, setLogs] = React.useState<string[]>([]);
  const [evalId, setEvalId] = React.useState<string | null>(null);
  const { showToast } = useToast();
  const [forceRegeneration /*, setForceRegeneration*/] = React.useState(true);
  const [maxConcurrency, setMaxConcurrency] = React.useState(
    String(config.maxConcurrency || REDTEAM_DEFAULTS.MAX_CONCURRENCY),
  );
  const [isJobStatusDialogOpen, setIsJobStatusDialogOpen] = useState(false);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [emailVerificationMessage, setEmailVerificationMessage] = useState('');
  const [emailVerificationError, setEmailVerificationError] = useState<string | null>(null);
  const { checkEmailStatus } = useEmailVerification();
  const [isPurposeExpanded, setIsPurposeExpanded] = useState(false);
  const [isTestInstructionsExpanded, setIsTestInstructionsExpanded] = useState(false);
  const [isRunOptionsExpanded, setIsRunOptionsExpanded] = useState(true);

  // Auto-expand advanced config if there are existing test variables
  const hasTestVariables =
    config.defaultTest?.vars && Object.keys(config.defaultTest.vars).length > 0;
  const [isAdvancedConfigExpanded, setIsAdvancedConfigExpanded] = useState(hasTestVariables);

  // Parse purpose text into sections
  const parsedPurposeSections = useMemo(() => {
    if (!config.purpose) {
      return [];
    }

    const sections: { title: string; content: string }[] = [];
    const lines = config.purpose.split('\n');
    let currentSection: { title: string; content: string } | null = null;
    let inCodeBlock = false;
    let contentLines: string[] = [];

    for (const line of lines) {
      // Check if we're entering or exiting a code block
      if (line === '```') {
        inCodeBlock = !inCodeBlock;
        continue;
      }

      // Check if this is a section header (ends with colon and not in code block)
      if (!inCodeBlock && line.endsWith(':') && !line.startsWith(' ') && !line.startsWith('\t')) {
        // Save previous section if exists
        if (currentSection) {
          currentSection.content = contentLines.join('\n').trim();
          if (currentSection.content) {
            sections.push(currentSection);
          }
        }
        // Start new section
        currentSection = { title: line.slice(0, -1), content: '' };
        contentLines = [];
      } else if (currentSection) {
        // Add to current section content
        contentLines.push(line);
      }
    }

    // Save last section
    if (currentSection) {
      currentSection.content = contentLines.join('\n').trim();
      if (currentSection.content) {
        sections.push(currentSection);
      }
    }

    // If no sections were found, treat the entire text as a single section
    if (sections.length === 0 && config.purpose.trim()) {
      sections.push({ title: 'Application Details', content: config.purpose.trim() });
    }

    return sections;
  }, [config.purpose]);

  // State to track which purpose sections are expanded (auto-expand first section)
  const [expandedPurposeSections, setExpandedPurposeSections] = useState<Set<string>>(new Set());

  const togglePurposeSection = (sectionTitle: string) => {
    setExpandedPurposeSections((prev: Set<string>) => {
      const newSet = new Set(prev);
      if (newSet.has(sectionTitle)) {
        newSet.delete(sectionTitle);
      } else {
        newSet.add(sectionTitle);
      }
      return newSet;
    });
  };

  const handleDescriptionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateConfig('description', event.target.value);
  };

  useEffect(() => {
    recordEvent('webui_page_view', { page: 'redteam_config_review' });
  }, []);

  // Sync local maxConcurrency state with config
  useEffect(() => {
    setMaxConcurrency(String(config.maxConcurrency || REDTEAM_DEFAULTS.MAX_CONCURRENCY));
  }, [config.maxConcurrency]);

  // Recover job state on mount (e.g., after navigation)
  useEffect(() => {
    const recoverJob = async () => {
      // Check what the server thinks is running
      const { hasRunningJob, jobId: serverJobId } = await checkForRunningJob();

      if (hasRunningJob && serverJobId) {
        // Server has a running job - reconnect to it
        try {
          const jobResponse = await callApi(`/eval/job/${serverJobId}`);
          if (jobResponse.ok) {
            const job = (await jobResponse.json()) as Job;
            setLogs(job.logs || []);

            if (job.status === 'in-progress') {
              setIsRunning(true);
              setJob(serverJobId);
              startPolling(serverJobId);
            } else if (job.status === 'complete' && job.evalId) {
              setEvalId(job.evalId);
              clearJob();
            } else if (job.status === 'error') {
              setLogs(job.logs || []);
              showToast('Previous job failed. Check logs for details.', 'error');
              clearJob();
            }
          } else {
            // Server reported a running job but we couldn't fetch it
            showToast('Could not reconnect to running job.', 'warning');
            clearJob();
          }
        } catch (error) {
          console.error('Failed to recover job:', error);
          showToast('Failed to reconnect to running job.', 'error');
          clearJob();
        }
      } else if (savedJobId) {
        // We have a saved job ID but server says nothing running
        // Check if it completed while we were away
        try {
          const jobResponse = await callApi(`/eval/job/${savedJobId}`);
          if (jobResponse.ok) {
            const job = (await jobResponse.json()) as Job;
            setLogs(job.logs || []);

            if (job.status === 'complete' && job.evalId) {
              setEvalId(job.evalId);
              showToast('Your evaluation completed!', 'success');
            } else if (job.status === 'error') {
              showToast('Previous job failed. Check logs for details.', 'error');
            }
          }
        } catch {
          // Job doesn't exist anymore (server restarted or cleaned up)
        }
        clearJob();
      }
    };

    recoverJob();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

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

  const [expanded, setExpanded] = React.useState(false);

  const getStrategyId = (strategy: string | { id: string }): string => {
    return typeof strategy === 'string' ? strategy : strategy.id;
  };

  const strategySummary = useMemo(() => {
    const summary = new Map<string, number>();

    config.strategies.forEach((strategy) => {
      const id = getStrategyId(strategy);

      // Skip 'basic' strategy if it has enabled: false
      if (id === 'basic' && typeof strategy === 'object' && strategy.config?.enabled === false) {
        return;
      }

      const label = strategyDisplayNames[id as keyof typeof strategyDisplayNames] || id;
      summary.set(label, (summary.get(label) || 0) + 1);
    });

    return Array.from(summary.entries()).sort((a, b) => b[1] - a[1]);
  }, [config.strategies]);

  const isRunNowDisabled = useMemo(() => {
    return isRunning || ['blocked', 'disabled', 'unknown'].includes(apiHealthStatus);
  }, [isRunning, apiHealthStatus]);

  const runNowTooltipMessage = useMemo((): string | undefined => {
    if (isRunning) {
      return undefined;
    }

    switch (apiHealthStatus) {
      case 'blocked':
        return 'Cannot connect to Promptfoo Cloud. Please check your network connection or API settings.';
      case 'disabled':
        return 'Remote generation is disabled. Running red team evaluations requires connection to Promptfoo Cloud.';
      case 'unknown':
        return 'Checking connection to Promptfoo Cloud...';
      default:
        return undefined;
    }
  }, [isRunning, apiHealthStatus]);

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

  const startPolling = useCallback(
    (jobId: string) => {
      // Clear any existing interval
      if (pollIntervalRef.current) {
        window.clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }

      const interval = window.setInterval(async () => {
        try {
          const statusResponse = await callApi(`/eval/job/${jobId}`);
          if (!statusResponse.ok) {
            // Job not found - likely server restarted
            window.clearInterval(interval);
            pollIntervalRef.current = null;
            setIsRunning(false);
            clearJob();
            showToast('Job was interrupted. Please try again.', 'error');
            return;
          }

          const status = (await statusResponse.json()) as Job;

          if (status.logs) {
            setLogs(status.logs);
          }

          if (status.status === 'complete' || status.status === 'error') {
            window.clearInterval(interval);
            pollIntervalRef.current = null;
            setIsRunning(false);
            clearJob();

            if (status.status === 'complete' && status.result && status.evalId) {
              setEvalId(status.evalId);

              recordEvent('funnel', {
                type: 'redteam',
                step: 'webui_evaluation_completed',
                source: 'webui',
                evalId: status.evalId,
              });
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
        } catch (error) {
          console.error('Error polling job status:', error);
        }
      }, 1000);

      pollIntervalRef.current = interval;
    },
    [clearJob, recordEvent, showToast],
  );

  const handleRunWithSettings = async () => {
    // Check email verification first
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

    // Show usage warning if present
    if (emailResult.status?.status === 'show_usage_warning' && emailResult.status.message) {
      showToast(emailResult.status.message, 'warning');
    }

    const { hasRunningJob } = await checkForRunningJob();

    if (hasRunningJob) {
      setIsJobStatusDialogOpen(true);
      return;
    }

    // Clear any existing polling interval before starting a new job
    if (pollIntervalRef.current) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    recordEvent('feature_used', {
      feature: 'redteam_config_run',
      numPlugins: config.plugins.length,
      numStrategies: config.strategies.length,
      targetType: config.target.id,
    });

    if (config.target.id === 'http' && config.target.config.url?.includes('promptfoo.app')) {
      // Track report export
      recordEvent('webui_action', {
        action: 'redteam_run_with_example',
      });
    }
    // Track funnel milestone - evaluation started
    recordEvent('funnel', {
      type: 'redteam',
      step: 'webui_evaluation_started',
      source: 'webui',
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
          verbose: config.target.config.verbose,
          maxConcurrency,
          delay: config.target.config.delay,
        }),
      });

      const { id } = await response.json();

      // Save job ID to persistent store and start polling
      setJob(id);
      startPolling(id);
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

      if (pollIntervalRef.current) {
        window.clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }

      setIsRunning(false);
      clearJob();
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
      if (pollIntervalRef.current) {
        window.clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  return (
    <PageWrapper title="Review & Run" onBack={onBack}>
      <Box>
        <TextField
          fullWidth
          label="Description"
          placeholder="My Red Team Configuration"
          value={config.description}
          onChange={handleDescriptionChange}
          variant="outlined"
          sx={{ mb: 4 }}
          autoFocus
        />

        <Typography variant="h5" gutterBottom sx={{ mb: 3 }}>
          Configuration Summary
        </Typography>

        <Grid container spacing={3}>
          <Grid size={{ xs: 6 }}>
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
                    onDelete={() => {
                      const newPlugins = config.plugins.filter((plugin) => {
                        const pluginLabel = getPluginSummary(plugin).label;
                        return pluginLabel !== label;
                      });
                      updateConfig('plugins', newPlugins);
                    }}
                    sx={{
                      backgroundColor:
                        label === 'Custom Policy' ? theme.palette.primary.main : undefined,
                      color:
                        label === 'Custom Policy' ? theme.palette.primary.contrastText : undefined,
                    }}
                  />
                ))}
              </Box>
              {pluginSummary.length === 0 && (
                <>
                  <Alert severity="warning" sx={{ mt: 2 }}>
                    You haven't selected any plugins. Plugins are the vulnerabilities that the red
                    team will search for.
                  </Alert>
                  <Button onClick={navigateToPlugins} sx={{ mt: 2 }} variant="contained">
                    Add a plugin
                  </Button>
                </>
              )}
            </Paper>
          </Grid>

          <Grid size={{ xs: 6 }}>
            <Paper elevation={2} sx={{ p: 3, height: '100%' }}>
              <Typography variant="h6" gutterBottom>
                Strategies ({strategySummary.length})
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {strategySummary.map(([label, count]) => (
                  <Chip
                    key={label}
                    label={count > 1 ? `${label} (${count})` : label}
                    size="small"
                    onDelete={() => {
                      const strategyId =
                        Object.entries(strategyDisplayNames).find(
                          ([_id, displayName]) => displayName === label,
                        )?.[0] || label;

                      // Special handling for 'basic' strategy - set enabled: false instead of removing
                      if (strategyId === 'basic') {
                        const newStrategies = config.strategies.map((strategy) => {
                          const id = getStrategyId(strategy);
                          if (id === 'basic') {
                            return {
                              id: 'basic',
                              config: {
                                ...(typeof strategy === 'object' ? strategy.config : {}),
                                enabled: false,
                              },
                            };
                          }
                          return strategy;
                        });
                        updateConfig('strategies', newStrategies);
                      } else {
                        const newStrategies = config.strategies.filter((strategy) => {
                          const id = getStrategyId(strategy);
                          return id !== strategyId;
                        });
                        updateConfig('strategies', newStrategies);
                      }
                    }}
                  />
                ))}
              </Box>
              {(strategySummary.length === 0 ||
                (strategySummary.length === 1 && strategySummary[0][0] === 'Basic')) && (
                <>
                  <Alert severity="warning" sx={{ mt: 2 }}>
                    The basic strategy is great for an end-to-end setup test, but don't expect any
                    findings. Once you've verified that the setup is working, add another strategy.
                  </Alert>
                  <Button onClick={navigateToStrategies} sx={{ mt: 2 }} variant="contained">
                    Add more strategies
                  </Button>
                </>
              )}
            </Paper>
          </Grid>

          {customPolicies.length > 0 && (
            <Grid size={{ xs: 6 }}>
              <Paper elevation={2} sx={{ p: 3, height: '100%' }}>
                <Typography variant="h6" gutterBottom>
                  Custom Policies ({customPolicies.length})
                </Typography>
                <Stack spacing={1} sx={{ maxHeight: 400, overflowY: 'auto' }}>
                  {customPolicies.map((policy, index) => {
                    const isPolicyObject = isValidPolicyObject(policy.config.policy);
                    return (
                      <Box
                        key={index}
                        sx={{
                          p: 1.5,
                          borderRadius: 1,
                          bgcolor: theme.palette.action.hover,
                          position: 'relative',
                          display: 'flex',
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                        }}
                      >
                        <Box>
                          <Typography gutterBottom>
                            {isPolicyObject
                              ? (policy.config.policy as PolicyObject).name
                              : // Backwards compatibility w/ text-only inline policies.
                                makeDefaultPolicyName(index)}
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              paddingRight: '24px',
                            }}
                          >
                            {typeof policy.config.policy === 'string'
                              ? policy.config.policy
                              : policy.config.policy?.text || ''}
                          </Typography>
                        </Box>
                        <IconButton
                          size="small"
                          onClick={() => {
                            const policyToMatch =
                              // Backwards compatibility for policies w/o object config
                              typeof policy.config.policy === 'string'
                                ? policy.config.policy
                                : policy.config.policy?.id;

                            const newPlugins = config.plugins.filter(
                              (p, _i) =>
                                !(
                                  typeof p === 'object' &&
                                  p.id === 'policy' &&
                                  ((typeof p.config?.policy === 'string' &&
                                    p.config.policy === policyToMatch) ||
                                    (typeof p.config?.policy === 'object' &&
                                      p.config.policy?.id === policyToMatch))
                                ),
                            );
                            updateConfig('plugins', newPlugins);
                          }}
                        >
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    );
                  })}
                </Stack>
              </Paper>
            </Grid>
          )}

          {intents.length > 0 && (
            <Grid size={{ xs: 6 }}>
              <Paper elevation={2} sx={{ p: 3, height: '100%' }}>
                <Typography variant="h6" gutterBottom>
                  Intents ({intents.length})
                </Typography>
                <Stack spacing={1}>
                  {intents.slice(0, expanded ? undefined : 5).map((intent, index) => (
                    <Box
                      key={index}
                      sx={{
                        p: 1.5,
                        borderRadius: 1,
                        bgcolor: theme.palette.action.hover,
                        position: 'relative',
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
                          paddingRight: '24px',
                        }}
                      >
                        {intent}
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={() => {
                          const intentPlugin = config.plugins.find(
                            (p): p is { id: 'intent'; config: { intent: string | string[] } } =>
                              typeof p === 'object' &&
                              p.id === 'intent' &&
                              p.config?.intent !== undefined,
                          );

                          if (intentPlugin) {
                            const currentIntents = Array.isArray(intentPlugin.config.intent)
                              ? intentPlugin.config.intent
                              : [intentPlugin.config.intent];

                            const newIntents = currentIntents.filter((i) => i !== intent);

                            const newPlugins = config.plugins.map((p) =>
                              typeof p === 'object' && p.id === 'intent'
                                ? { ...p, config: { ...p.config, intent: newIntents } }
                                : p,
                            );

                            updateConfig('plugins', newPlugins);
                          }
                        }}
                        sx={{
                          position: 'absolute',
                          right: 4,
                          top: 4,
                          padding: '2px',
                        }}
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ))}
                  {intents.length > 5 && (
                    <Button onClick={() => setExpanded(!expanded)} size="small" sx={{ mt: 1 }}>
                      {expanded ? 'Show Less' : `Show ${intents.length - 5} More`}
                    </Button>
                  )}
                </Stack>
              </Paper>
            </Grid>
          )}

          <Grid size={{ xs: 12 }}>
            <Box sx={{ boxShadow: theme.shadows[1], borderRadius: 1, overflow: 'hidden' }}>
              <Accordion
                expanded={isPurposeExpanded}
                onChange={(_e, expanded) => {
                  setIsPurposeExpanded(expanded);
                }}
                sx={{
                  '&:before': { display: 'none' },
                  boxShadow: 'none',
                  borderRadius: 0,
                  borderBottom: `1px solid ${theme.palette.divider}`,
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  sx={{
                    '& .MuiAccordionSummary-content': {
                      alignItems: 'center',
                      gap: 2,
                    },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <InfoOutlinedIcon fontSize="small" color="action" />
                    <Typography variant="h6">Application Details</Typography>
                    {config.purpose && (
                      <Chip
                        label={config.purpose.length < 100 ? 'Needs more detail' : 'Configured'}
                        size="small"
                        variant="outlined"
                        color={config.purpose.length < 100 ? 'warning' : 'success'}
                        sx={{ height: 20, fontSize: '0.75rem' }}
                      />
                    )}
                    {!config.purpose && (
                      <Chip
                        label="Not configured"
                        size="small"
                        variant="outlined"
                        color="error"
                        sx={{ height: 20, fontSize: '0.75rem' }}
                      />
                    )}
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0 }}>
                  <Grid size={{ xs: 12 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        mb: 1,
                      }}
                    >
                      {parsedPurposeSections.length > 1 && (
                        <Button
                          size="small"
                          onClick={() => {
                            if (expandedPurposeSections.size === parsedPurposeSections.length) {
                              setExpandedPurposeSections(new Set());
                            } else {
                              setExpandedPurposeSections(
                                new Set(parsedPurposeSections.map((s) => s.title)),
                              );
                            }
                          }}
                          sx={{ textTransform: 'none' }}
                        >
                          {expandedPurposeSections.size === parsedPurposeSections.length
                            ? 'Collapse All'
                            : 'Expand All'}
                        </Button>
                      )}
                    </Box>

                    {(!config.purpose?.trim() || config.purpose.length < 100) &&
                    !isFoundationModelProvider(config.target.id) ? (
                      <Box sx={{ mb: 2 }}>
                        <Alert severity="warning">
                          Application details are required to generate a high quality red team. Go
                          to the Application Details section and add a purpose.{' '}
                          <Link
                            style={{ textDecoration: 'underline' }}
                            target="_blank"
                            rel="noopener noreferrer"
                            to="https://www.promptfoo.dev/docs/red-team/troubleshooting/best-practices/#1-provide-comprehensive-application-details"
                          >
                            Learn more about red team best practices.
                          </Link>
                        </Alert>
                        <Button onClick={navigateToPurpose} sx={{ mt: 2 }} variant="contained">
                          Add application details
                        </Button>
                      </Box>
                    ) : null}

                    {parsedPurposeSections.length > 0 ? (
                      <Stack spacing={2} sx={{ mt: 1 }}>
                        {parsedPurposeSections.map((section, index) => (
                          <Box
                            key={index}
                            sx={{
                              border: `1px solid ${theme.palette.divider}`,
                              borderRadius: 1,
                              overflow: 'hidden',
                            }}
                          >
                            <Box
                              onClick={() => togglePurposeSection(section.title)}
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                p: 1.5,
                                backgroundColor: theme.palette.action.hover,
                                cursor: 'pointer',
                                '&:hover': {
                                  backgroundColor: theme.palette.action.selected,
                                },
                              }}
                            >
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="body2" fontWeight="medium">
                                  {section.title}
                                </Typography>
                              </Box>
                              <ExpandMoreIcon
                                sx={{
                                  transform: expandedPurposeSections.has(section.title)
                                    ? 'rotate(180deg)'
                                    : 'rotate(0deg)',
                                  transition: 'transform 0.2s',
                                }}
                              />
                            </Box>
                            {expandedPurposeSections.has(section.title) && (
                              <Box sx={{ p: 2, backgroundColor: 'background.paper' }}>
                                <Typography
                                  variant="body2"
                                  sx={{
                                    whiteSpace: 'pre-wrap',
                                    color: 'text.secondary',
                                  }}
                                >
                                  {section.content}
                                </Typography>
                              </Box>
                            )}
                          </Box>
                        ))}
                      </Stack>
                    ) : config.purpose ? (
                      <Typography
                        variant="body2"
                        onClick={() => setIsPurposeExpanded(!isPurposeExpanded)}
                        sx={{
                          whiteSpace: 'pre-wrap',
                          padding: 1,
                          borderRadius: 1,
                          backgroundColor: 'background.paper',
                          cursor: 'pointer',
                          display: '-webkit-box',
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          WebkitLineClamp: isPurposeExpanded ? 'none' : 6,
                          '&:hover': {
                            backgroundColor: 'action.hover',
                          },
                        }}
                      >
                        {config.purpose}
                      </Typography>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        Not specified
                      </Typography>
                    )}
                    {config.purpose &&
                      parsedPurposeSections.length === 0 &&
                      config.purpose.split('\n').length > 6 && (
                        <Typography
                          variant="caption"
                          sx={{
                            color: 'primary.main',
                            cursor: 'pointer',
                            mt: 0.5,
                            display: 'block',
                          }}
                          onClick={() => setIsPurposeExpanded(!isPurposeExpanded)}
                        >
                          {isPurposeExpanded ? 'Show less' : 'Show more'}
                        </Typography>
                      )}

                    {config.testGenerationInstructions && (
                      <Grid size={{ xs: 12 }}>
                        <Typography variant="subtitle2">Test Generation Instructions</Typography>
                        <Typography
                          variant="body2"
                          onClick={() => setIsTestInstructionsExpanded(!isTestInstructionsExpanded)}
                          sx={{
                            whiteSpace: 'pre-wrap',
                            padding: 1,
                            borderRadius: 1,
                            backgroundColor: 'background.paper',
                            cursor: 'pointer',
                            display: '-webkit-box',
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            WebkitLineClamp: isTestInstructionsExpanded ? 'none' : 6,
                            '&:hover': {
                              backgroundColor: 'action.hover',
                            },
                          }}
                        >
                          {config.testGenerationInstructions}
                        </Typography>
                        {config.testGenerationInstructions &&
                          config.testGenerationInstructions.split('\n').length > 6 && (
                            <Typography
                              variant="caption"
                              sx={{
                                color: 'primary.main',
                                cursor: 'pointer',
                                mt: 0.5,
                                display: 'block',
                              }}
                              onClick={() =>
                                setIsTestInstructionsExpanded(!isTestInstructionsExpanded)
                              }
                            >
                              {isTestInstructionsExpanded ? 'Show less' : 'Show more'}
                            </Typography>
                          )}
                      </Grid>
                    )}
                  </Grid>
                </AccordionDetails>
              </Accordion>

              <Accordion
                expanded={isAdvancedConfigExpanded}
                onChange={(_e, expanded) => {
                  setIsAdvancedConfigExpanded(expanded);
                }}
                sx={{
                  '&:before': { display: 'none' },
                  boxShadow: 'none',
                  borderRadius: 0,
                  borderBottom: `1px solid ${theme.palette.divider}`,
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  sx={{
                    '& .MuiAccordionSummary-content': {
                      alignItems: 'center',
                      gap: 2,
                    },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TuneIcon fontSize="small" color="action" />
                    <Typography variant="h6">Advanced Configuration</Typography>
                    <Chip label="Optional" size="small" variant="outlined" sx={{ ml: 1 }} />
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Configure advanced options that apply to all test cases. These settings are for
                    power users who need fine-grained control over their red team evaluation.
                  </Typography>
                  <DefaultTestVariables />
                </AccordionDetails>
              </Accordion>

              <Accordion
                expanded={isRunOptionsExpanded}
                onChange={(_e, expanded) => {
                  setIsRunOptionsExpanded(expanded);
                }}
                sx={{
                  '&:before': { display: 'none' },
                  boxShadow: 'none',
                  borderRadius: 0,
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  sx={{
                    '& .MuiAccordionSummary-content': {
                      alignItems: 'center',
                      gap: 2,
                    },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PlayArrowIcon fontSize="small" color="action" />
                    <Typography variant="h6">Run Options</Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0 }}>
                  <RunOptionsContent
                    numTests={config.numTests}
                    runOptions={{
                      maxConcurrency: config.maxConcurrency,
                      delay: config.target.config.delay,
                    }}
                    updateConfig={updateConfig}
                    updateRunOption={(key: keyof RedteamRunOptions, value: any) => {
                      if (key === 'delay') {
                        updateConfig('target', {
                          ...config.target,
                          config: { ...config.target.config, delay: value },
                        });
                      } else if (key === 'maxConcurrency') {
                        updateConfig('maxConcurrency', value);
                      } else if (key === 'verbose') {
                        updateConfig('target', {
                          ...config.target,
                          config: { ...config.target.config, verbose: value },
                        });
                      }
                    }}
                    language={config.language}
                  />
                </AccordionDetails>
              </Accordion>
            </Box>
          </Grid>
        </Grid>

        <Divider sx={{ my: 4 }} />

        <Typography variant="h5" gutterBottom sx={{ mb: 3 }}>
          Run Your Scan
        </Typography>

        <EstimationsDisplay config={config} />

        <Paper elevation={2} sx={{ p: 3 }}>
          <Box sx={{ mb: 4 }}>
            <Typography variant="h6" gutterBottom>
              Option 1: Save and Run via CLI
            </Typography>
            <Typography variant="body1">
              Save your configuration and run it from the command line. Full control over the
              evaluation process, good for larger scans:
            </Typography>
            <Code>promptfoo redteam run</Code>
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
              Run the red team evaluation right here. Simpler but less powerful than the CLI, good
              for tests and small scans:
            </Typography>
            {apiHealthStatus !== 'connected' && !isCheckingApiHealth && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                {apiHealthStatus === 'blocked'
                  ? 'Cannot connect to Promptfoo Cloud. The "Run Now" option requires a connection to Promptfoo Cloud.'
                  : apiHealthStatus === 'disabled'
                    ? 'Remote generation is disabled. The "Run Now" option is not available.'
                    : 'Checking connection status...'}
              </Alert>
            )}
            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <Tooltip title={runNowTooltipMessage} arrow>
                  <span>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={handleRunWithSettings}
                      disabled={isRunNowDisabled}
                      startIcon={
                        isRunning ? (
                          <CircularProgress size={20} color="inherit" />
                        ) : (
                          <PlayArrowIcon />
                        )
                      }
                    >
                      {isRunning ? 'Running...' : 'Run Now'}
                    </Button>
                  </span>
                </Tooltip>
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
                      href={`/reports?evalId=${evalId}`}
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
              There is already a red team evaluation running. Would you like to cancel it and start
              a new one?
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

        {emailVerificationError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {emailVerificationError}
          </Alert>
        )}

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
    </PageWrapper>
  );
}
