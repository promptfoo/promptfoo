import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

// App imports
import { useApiHealth } from '@app/hooks/useApiHealth';
import { useEmailVerification } from '@app/hooks/useEmailVerification';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { useToast } from '@app/hooks/useToast';
import YamlEditor from '@app/pages/eval-creator/components/YamlEditor';
import { callApi } from '@app/utils/api';

// MUI Icons
import AssessmentIcon from '@mui/icons-material/Assessment';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ReplayIcon from '@mui/icons-material/Replay';
import SaveIcon from '@mui/icons-material/Save';
import SearchIcon from '@mui/icons-material/Search';
import StopIcon from '@mui/icons-material/Stop';
import VisibilityIcon from '@mui/icons-material/Visibility';

// MUI Components
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { alpha, useTheme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

// Promptfoo imports
import { isFoundationModelProvider } from '@promptfoo/constants';
import { REDTEAM_DEFAULTS, strategyDisplayNames } from '@promptfoo/redteam/constants';
import {
  isValidPolicyObject,
  makeDefaultPolicyName,
} from '@promptfoo/redteam/plugins/policy/utils';
import { getUnifiedConfig } from '@promptfoo/redteam/sharedFrontend';

// Local imports
import { useJobSocket } from '../hooks/useJobSocket';
import { useJobState } from '../hooks/useJobState';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';
import { generateOrderedYaml } from '../utils/yamlHelpers';
import DefaultTestVariables from './DefaultTestVariables';
import { EmailVerificationDialog } from './EmailVerificationDialog';
import { LogViewer } from './LogViewer';
import PageWrapper from './PageWrapper';
import { RunOptionsContent } from './RunOptions';
import { getEstimatedProbes } from './strategies/utils';
import VulnerabilityStream from './VulnerabilityStream';

// Types
import type { RedteamPlugin, Policy, PolicyObject } from '@promptfoo/redteam/types';
import type { Job, RedteamRunOptions, VulnerabilityFoundEvent } from '@promptfoo/types';

interface ReviewProps {
  onBack?: () => void;
  navigateToPlugins: () => void;
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
  navigateToPurpose,
}: ReviewProps) {
  const { config, updateConfig } = useRedTeamConfig();
  const theme = useTheme();
  const { recordEvent } = useTelemetry();
  const {
    data: { status: apiHealthStatus },
    isLoading: isCheckingApiHealth,
  } = useApiHealth();
  const [isYamlDialogOpen, setIsYamlDialogOpen] = React.useState(false);
  const yamlContent = useMemo(() => generateOrderedYaml(config), [config]);

  // Consolidated job state management
  const { state: jobState, actions: jobActions } = useJobState();
  const isRunning = jobState.status === 'in-progress';

  const { showToast } = useToast();
  const [forceRegeneration /*, setForceRegeneration*/] = React.useState(true);
  const [maxConcurrency, setMaxConcurrency] = React.useState(
    String(config.maxConcurrency || REDTEAM_DEFAULTS.MAX_CONCURRENCY),
  );
  const [isJobStatusDialogOpen, setIsJobStatusDialogOpen] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [cliMenuAnchor, setCliMenuAnchor] = useState<null | HTMLElement>(null);
  const [isConfigExpanded, setIsConfigExpanded] = useState(false);

  // WebSocket integration for real-time job updates
  const handleJobUpdate = useCallback(
    (payload: {
      status: Job['status'];
      progress?: number;
      total?: number;
      phase?: Job['phase'];
      phaseDetail?: string;
      startedAt?: number;
      metrics?: Job['metrics'];
      errors?: Job['errors'];
      logs?: string[];
    }) => {
      jobActions.updateFromWebSocket(payload);
    },
    [jobActions],
  );

  const handleJobComplete = useCallback(
    (payload: {
      status: Job['status'];
      evalId?: string | null;
      phase?: Job['phase'];
      phaseDetail?: string;
      metrics?: Job['metrics'];
      errors?: Job['errors'];
      summary?: Job['summary'];
    }) => {
      jobActions.completeJob(payload);

      if (payload.evalId) {
        // Track funnel milestone - evaluation completed
        recordEvent('funnel', {
          type: 'redteam',
          step: 'webui_evaluation_completed',
          source: 'webui',
          evalId: payload.evalId,
        });
      }
    },
    [jobActions, recordEvent],
  );

  const handleVulnerability = useCallback(
    (vulnerability: VulnerabilityFoundEvent) => {
      jobActions.addVulnerability(vulnerability);
    },
    [jobActions],
  );

  // WebSocket provides real-time updates; polling is a fallback mechanism
  useJobSocket({
    jobId: jobState.jobId,
    onUpdate: handleJobUpdate,
    onComplete: handleJobComplete,
    onVulnerability: handleVulnerability,
  });
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [emailVerificationMessage, setEmailVerificationMessage] = useState('');
  const [emailVerificationError, setEmailVerificationError] = useState<string | null>(null);
  const { checkEmailStatus } = useEmailVerification();
  const [logsExpanded, setLogsExpanded] = useState(false);

  // Elapsed time tracking
  const [elapsedTime, setElapsedTime] = useState<number | null>(null);

  useEffect(() => {
    if (jobState.status === 'idle') {
      setElapsedTime(null);
      return;
    }
    if (jobState.status === 'complete' || jobState.status === 'error') {
      if (jobState.startedAt) {
        setElapsedTime(Date.now() - jobState.startedAt);
      }
      return;
    }
    if (jobState.status !== 'in-progress' || !jobState.startedAt) {
      return;
    }
    setElapsedTime(Date.now() - jobState.startedAt);
    const interval = setInterval(() => {
      if (jobState.startedAt) {
        setElapsedTime(Date.now() - jobState.startedAt);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [jobState.status, jobState.startedAt]);

  // Format elapsed time
  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
      return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  };

  // Estimate remaining time
  const estimateRemaining = useMemo(() => {
    if (!elapsedTime || jobState.progress === 0 || jobState.total === 0) {
      return null;
    }
    const rate = jobState.progress / elapsedTime;
    const remaining = (jobState.total - jobState.progress) / rate;
    return formatTime(remaining);
  }, [elapsedTime, jobState.progress, jobState.total]);

  // Estimated probes count
  const estimatedProbes = useMemo(() => getEstimatedProbes(config), [config]);

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

  const handleCliMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setCliMenuAnchor(event.currentTarget);
  };

  const handleCliMenuClose = () => {
    setCliMenuAnchor(null);
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

    // Clear any existing poll interval
    jobActions.clearPollInterval();

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

      // Start job state tracking with the new job ID
      jobActions.startJob(id);

      // Poll for updates as a fallback (WebSocket provides real-time updates when available)
      // Use moderate interval - conflict resolution handles any race conditions
      const POLL_INTERVAL_MS = 2000;

      const interval = window.setInterval(async () => {
        const statusResponse = await callApi(`/eval/job/${id}`);
        const status = (await statusResponse.json()) as Job;

        // Use polling update (respects timestamp-based conflict resolution)
        jobActions.updateFromPolling({
          logs: status.logs,
          progress: status.progress,
          total: status.total,
          phase: status.phase,
          phaseDetail: status.phaseDetail,
          metrics: status.metrics,
          errors: status.errors,
          startedAt: status.startedAt,
        });

        if (status.status === 'complete' || status.status === 'error') {
          jobActions.clearPollInterval();

          if (status.status === 'complete') {
            jobActions.completeJob({
              evalId: status.evalId,
              phase: status.phase,
              phaseDetail: status.phaseDetail,
              metrics: status.metrics,
              errors: status.errors,
              summary: status.summary,
            });

            if (status.result && status.evalId) {
              // Track funnel milestone - evaluation completed
              recordEvent('funnel', {
                type: 'redteam',
                step: 'webui_evaluation_completed',
                source: 'webui',
                evalId: status.evalId,
              });
            } else {
              console.warn('No evaluation result was generated');
              showToast(
                'The evaluation completed but no results were generated. Please check the logs for details.',
                'warning',
              );
            }
          } else {
            jobActions.errorJob('An error occurred during evaluation');
            showToast(
              'An error occurred during evaluation. Please check the logs for details.',
              'error',
            );
          }
        }
      }, POLL_INTERVAL_MS);

      jobActions.setPollInterval(interval);
    } catch (error) {
      console.error('Error running redteam:', error);
      jobActions.errorJob(error instanceof Error ? error.message : 'Unknown error');
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showToast(
        `An error occurred while starting the evaluation: ${errorMessage}. Please try again.`,
        'error',
      );
    }
  };

  /**
   * Show confirmation dialog before cancelling
   */
  const handleCancel = useCallback(() => {
    setIsCancelDialogOpen(true);
  }, []);

  /**
   * Perform the actual cancellation after user confirms
   */
  const performCancel = useCallback(async () => {
    try {
      await callApi('/redteam/cancel', {
        method: 'POST',
      });

      jobActions.reset();
      showToast('Evaluation cancelled', 'success');
    } catch (error) {
      console.error('Error cancelling job:', error);
      showToast('Failed to cancel job', 'error');
    }
  }, [jobActions, showToast]);

  /**
   * Confirm cancellation - close dialog and perform cancel
   */
  const confirmCancel = useCallback(async () => {
    setIsCancelDialogOpen(false);
    await performCancel();
  }, [performCancel]);

  /**
   * Dedicated retry handler for failed evaluations.
   * Resets state and re-runs with current config without re-validating email.
   */
  const handleRetry = useCallback(async () => {
    jobActions.reset();

    // Small delay to ensure state is reset before starting new job
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Re-run with current settings (skip email validation since they already ran once)
    handleRunWithSettings();
  }, [jobActions, handleRunWithSettings]);

  const handleCancelExistingAndRun = async () => {
    try {
      await performCancel();
      setIsJobStatusDialogOpen(false);
      setTimeout(() => {
        handleRunWithSettings();
      }, 500);
    } catch (error) {
      console.error('Error canceling existing job:', error);
      showToast('Failed to cancel existing job', 'error');
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      jobActions.clearPollInterval();
    };
  }, [jobActions]);

  // Keyboard shortcut: Cmd/Ctrl + Enter to run scan
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!isRunNowDisabled && !isRunning) {
          handleRunWithSettings();
        } else if (isRunning) {
          handleCancel();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRunNowDisabled, isRunning, handleRunWithSettings, handleCancel]);

  // Progress percentage
  const progressPercent = useMemo(() => {
    if (jobState.total === 0) {
      return 0;
    }
    return Math.min(Math.round((jobState.progress / jobState.total) * 100), 100);
  }, [jobState.progress, jobState.total]);

  // Show indeterminate progress during generation phase
  const showIndeterminate =
    jobState.status === 'in-progress' && (jobState.phase === 'generating' || jobState.total === 0);

  // Status text for progress
  const statusText = useMemo(() => {
    if (jobState.phaseDetail) {
      return jobState.phaseDetail;
    }
    if (jobState.status === 'in-progress') {
      if (jobState.phase === 'generating') {
        return 'Generating test cases...';
      }
      if (jobState.phase === 'evaluating' && jobState.total > 0) {
        return `Evaluating ${jobState.progress} of ${jobState.total}`;
      }
      return 'Initializing...';
    }
    return '';
  }, [jobState.status, jobState.phase, jobState.phaseDetail, jobState.progress, jobState.total]);

  return (
    <PageWrapper title="Review & Run" onBack={onBack}>
      <Box>
        {/* ═══════════════════════════════════════════════════════════════════════
            UNIFIED ACTION AREA - Transforms based on state (idle/running/complete)
            ═══════════════════════════════════════════════════════════════════════ */}
        <Paper
          elevation={0}
          sx={{
            p: 3,
            mb: 3,
            borderRadius: 2,
            border: `1px solid ${theme.palette.divider}`,
            backgroundColor:
              jobState.status === 'complete'
                ? alpha(
                    jobState.summary?.vulnerabilitiesFound
                      ? theme.palette.error.main
                      : theme.palette.success.main,
                    0.04,
                  )
                : jobState.status === 'error'
                  ? alpha(theme.palette.error.main, 0.04)
                  : 'transparent',
          }}
        >
          {/* IDLE STATE - Show config summary and run button */}
          {jobState.status === 'idle' && (
            <>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 3,
                  flexDirection: { xs: 'column', md: 'row' },
                }}
              >
                <Box sx={{ flex: 1 }}>
                  <TextField
                    fullWidth
                    label="Description"
                    placeholder="My Red Team Configuration"
                    value={config.description}
                    onChange={handleDescriptionChange}
                    variant="outlined"
                    size="small"
                    sx={{ maxWidth: 400, mb: 2 }}
                  />
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Target:{' '}
                    <Typography component="span" fontWeight={500} color="text.primary">
                      {config.target?.label || 'Not configured'}
                    </Typography>
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {pluginSummary.length} plugins · {strategySummary.length} strategies ·{' '}
                    ~{estimatedProbes.toLocaleString()} probes
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Tooltip title={runNowTooltipMessage} arrow>
                    <span>
                      <Button
                        variant="contained"
                        color="primary"
                        size="large"
                        onClick={handleRunWithSettings}
                        disabled={isRunNowDisabled}
                        startIcon={<PlayArrowIcon />}
                        sx={{ px: 4 }}
                      >
                        Run Scan
                      </Button>
                    </span>
                  </Tooltip>
                  <IconButton onClick={handleCliMenuOpen} aria-label="More options">
                    <MoreVertIcon />
                  </IconButton>
                </Box>
              </Box>
              {apiHealthStatus !== 'connected' && !isCheckingApiHealth && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  {apiHealthStatus === 'blocked'
                    ? 'Cannot connect to Promptfoo Cloud. Please check your network connection.'
                    : apiHealthStatus === 'disabled'
                      ? 'Remote generation is disabled. Save YAML and run via CLI instead.'
                      : 'Checking connection status...'}
                </Alert>
              )}
            </>
          )}

          {/* RUNNING STATE - Show progress and live results */}
          {jobState.status === 'in-progress' && (
            <>
              {/* Header row with status and time */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 2,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      backgroundColor: theme.palette.primary.main,
                      animation: 'pulse 1.5s infinite',
                      '@keyframes pulse': {
                        '0%, 100%': { opacity: 1 },
                        '50%': { opacity: 0.4 },
                      },
                    }}
                  />
                  <Typography variant="h6" fontWeight={500}>
                    {statusText}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  {elapsedTime !== null && (
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography variant="body2" fontWeight={500}>
                        {formatTime(elapsedTime)}
                      </Typography>
                      {estimateRemaining && (
                        <Typography variant="caption" color="text.secondary">
                          ~{estimateRemaining} remaining
                        </Typography>
                      )}
                    </Box>
                  )}
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    onClick={handleCancel}
                    startIcon={<StopIcon />}
                  >
                    Cancel
                  </Button>
                </Box>
              </Box>

              {/* Progress bar */}
              <LinearProgress
                variant={showIndeterminate ? 'indeterminate' : 'determinate'}
                value={progressPercent}
                sx={{
                  height: 8,
                  borderRadius: 1,
                  mb: 1,
                  backgroundColor: alpha(theme.palette.primary.main, 0.1),
                }}
              />
              {!showIndeterminate && jobState.total > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'right', mb: 2 }}>
                  {jobState.progress}/{jobState.total} ({progressPercent}%)
                </Typography>
              )}

              {/* Live metrics - inline row */}
              {jobState.metrics &&
                (jobState.metrics.testPassCount > 0 ||
                  jobState.metrics.testFailCount > 0 ||
                  jobState.metrics.testErrorCount > 0) && (
                  <Box
                    sx={{
                      display: 'flex',
                      gap: 3,
                      py: 2,
                      borderTop: `1px solid ${theme.palette.divider}`,
                      borderBottom: `1px solid ${theme.palette.divider}`,
                      mb: 2,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: theme.palette.success.main,
                        }}
                      />
                      <Typography variant="body2">
                        <strong>{jobState.metrics.testPassCount}</strong> passed
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: theme.palette.error.main,
                        }}
                      />
                      <Typography variant="body2">
                        <strong>{jobState.metrics.testFailCount}</strong> vulnerabilities
                      </Typography>
                    </Box>
                    {jobState.metrics.testErrorCount > 0 && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box
                          sx={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: theme.palette.warning.main,
                          }}
                        />
                        <Typography variant="body2">
                          <strong>{jobState.metrics.testErrorCount}</strong> errors
                        </Typography>
                      </Box>
                    )}
                  </Box>
                )}

              {/* Live vulnerability stream */}
              {jobState.vulnerabilities &&
                jobState.severityCounts &&
                jobState.vulnerabilities.length > 0 && (
                  <VulnerabilityStream
                    vulnerabilities={jobState.vulnerabilities}
                    severityCounts={jobState.severityCounts}
                    sx={{ maxHeight: 350 }}
                  />
                )}

              {/* Logs toggle */}
              {jobState.logs.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Button
                    size="small"
                    onClick={() => setLogsExpanded(!logsExpanded)}
                    startIcon={
                      <ExpandMoreIcon
                        sx={{
                          transform: logsExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s',
                        }}
                      />
                    }
                    sx={{ color: 'text.secondary' }}
                  >
                    {logsExpanded ? 'Hide' : 'Show'} logs ({jobState.logs.length})
                  </Button>
                  {logsExpanded && (
                    <Box sx={{ mt: 1 }}>
                      <LogViewer logs={jobState.logs} />
                    </Box>
                  )}
                </Box>
              )}
            </>
          )}

          {/* COMPLETE STATE - Show results summary */}
          {jobState.status === 'complete' && (
            <>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 3,
                  flexDirection: { xs: 'column', md: 'row' },
                }}
              >
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                    <CheckCircleIcon sx={{ color: theme.palette.success.main }} />
                    <Typography variant="h6" fontWeight={500}>
                      Evaluation Complete
                    </Typography>
                    {elapsedTime !== null && (
                      <Typography variant="body2" color="text.secondary">
                        ({formatTime(elapsedTime)})
                      </Typography>
                    )}
                  </Box>
                  {jobState.summary && (
                    <Typography
                      variant="h5"
                      sx={{
                        color: jobState.summary.vulnerabilitiesFound
                          ? theme.palette.error.main
                          : theme.palette.success.main,
                        fontWeight: 600,
                        mb: 2,
                      }}
                    >
                      {jobState.summary.vulnerabilitiesFound > 0
                        ? `${jobState.summary.vulnerabilitiesFound} vulnerabilities found`
                        : 'No vulnerabilities found'}
                    </Typography>
                  )}
                  {jobState.summary?.topCategories && jobState.summary.topCategories.length > 0 && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                      {jobState.summary.topCategories.slice(0, 5).map((cat, i) => (
                        <Chip
                          key={i}
                          label={`${cat.name} (${cat.count})`}
                          size="small"
                          sx={{ backgroundColor: alpha(theme.palette.error.main, 0.1) }}
                        />
                      ))}
                    </Box>
                  )}
                </Box>
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                  {jobState.evalId && (
                    <>
                      <Button
                        variant="contained"
                        color="primary"
                        href={`/reports?evalId=${jobState.evalId}`}
                        startIcon={<AssessmentIcon />}
                      >
                        View Report
                      </Button>
                      <Button
                        variant="outlined"
                        href={`/eval?evalId=${jobState.evalId}`}
                        startIcon={<SearchIcon />}
                      >
                        View Probes
                      </Button>
                    </>
                  )}
                  <Button variant="outlined" onClick={handleRetry} startIcon={<ReplayIcon />}>
                    Run Again
                  </Button>
                </Box>
              </Box>

              {/* Logs toggle */}
              {jobState.logs.length > 0 && (
                <Box sx={{ mt: 2, pt: 2, borderTop: `1px solid ${theme.palette.divider}` }}>
                  <Button
                    size="small"
                    onClick={() => setLogsExpanded(!logsExpanded)}
                    startIcon={
                      <ExpandMoreIcon
                        sx={{
                          transform: logsExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s',
                        }}
                      />
                    }
                    sx={{ color: 'text.secondary' }}
                  >
                    {logsExpanded ? 'Hide' : 'Show'} logs ({jobState.logs.length})
                  </Button>
                  {logsExpanded && (
                    <Box sx={{ mt: 1 }}>
                      <LogViewer logs={jobState.logs} />
                    </Box>
                  )}
                </Box>
              )}
            </>
          )}

          {/* ERROR STATE - Show error message with retry */}
          {jobState.status === 'error' && (
            <>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 3,
                  flexDirection: { xs: 'column', md: 'row' },
                }}
              >
                <Box>
                  <Typography
                    variant="h6"
                    sx={{ color: theme.palette.error.main, fontWeight: 500, mb: 1 }}
                  >
                    Evaluation Failed
                  </Typography>
                  {jobState.errors && jobState.errors.length > 0 && (
                    <Typography variant="body2" color="text.secondary">
                      {jobState.errors[0].message}
                    </Typography>
                  )}
                </Box>
                <Button variant="contained" onClick={handleRetry} startIcon={<ReplayIcon />}>
                  Retry
                </Button>
              </Box>

              {/* Logs toggle */}
              {jobState.logs.length > 0 && (
                <Box sx={{ mt: 2, pt: 2, borderTop: `1px solid ${theme.palette.divider}` }}>
                  <Button
                    size="small"
                    onClick={() => setLogsExpanded(!logsExpanded)}
                    startIcon={
                      <ExpandMoreIcon
                        sx={{
                          transform: logsExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s',
                        }}
                      />
                    }
                    sx={{ color: 'text.secondary' }}
                  >
                    {logsExpanded ? 'Hide' : 'Show'} logs ({jobState.logs.length})
                  </Button>
                  {logsExpanded && (
                    <Box sx={{ mt: 1 }}>
                      <LogViewer logs={jobState.logs} />
                    </Box>
                  )}
                </Box>
              )}
            </>
          )}
        </Paper>

        {/* ═══════════════════════════════════════════════════════════════════════
            CONFIGURATION - Single consolidated accordion
            ═══════════════════════════════════════════════════════════════════════ */}
        <Accordion
          expanded={isConfigExpanded}
          onChange={(_e, expanded) => setIsConfigExpanded(expanded)}
          sx={{
            borderRadius: 2,
            '&:before': { display: 'none' },
            border: `1px solid ${theme.palette.divider}`,
            boxShadow: 'none',
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1" fontWeight={500}>
              Configuration
            </Typography>
            {pluginSummary.length === 0 && (
              <Chip
                label="No plugins"
                size="small"
                color="error"
                variant="outlined"
                sx={{ ml: 2 }}
              />
            )}
          </AccordionSummary>
          <AccordionDetails>
            {/* Plugins & Strategies */}
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                  Plugins ({pluginSummary.length})
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  {pluginSummary.map(([label, count]) => (
                    <Chip
                      key={label}
                      label={count > 1 ? `${label} (${count})` : label}
                      size="small"
                      variant="outlined"
                      onDelete={() => {
                        const newPlugins = config.plugins.filter((plugin) => {
                          const pluginLabel = getPluginSummary(plugin).label;
                          return pluginLabel !== label;
                        });
                        updateConfig('plugins', newPlugins);
                      }}
                    />
                  ))}
                  {pluginSummary.length === 0 && (
                    <Button onClick={navigateToPlugins} size="small" variant="outlined">
                      Add plugins
                    </Button>
                  )}
                </Box>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                  Strategies ({strategySummary.length})
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  {strategySummary.map(([label, count]) => (
                    <Chip
                      key={label}
                      label={count > 1 ? `${label} (${count})` : label}
                      size="small"
                      variant="outlined"
                      onDelete={() => {
                        const strategyId =
                          Object.entries(strategyDisplayNames).find(
                            ([_id, displayName]) => displayName === label,
                          )?.[0] || label;
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
              </Grid>

              {/* Custom Policies */}
              {customPolicies.length > 0 && (
                <Grid size={{ xs: 12, md: 6 }}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                    Custom Policies ({customPolicies.length})
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                    {customPolicies.map((policy, index) => {
                      const isPolicyObject = isValidPolicyObject(policy.config.policy);
                      return (
                        <Chip
                          key={index}
                          label={
                            isPolicyObject
                              ? (policy.config.policy as PolicyObject).name
                              : makeDefaultPolicyName(index)
                          }
                          size="small"
                          color="primary"
                          variant="outlined"
                          onDelete={() => {
                            const policyToMatch =
                              typeof policy.config.policy === 'string'
                                ? policy.config.policy
                                : policy.config.policy?.id;
                            const newPlugins = config.plugins.filter(
                              (p) =>
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
                        />
                      );
                    })}
                  </Box>
                </Grid>
              )}

              {/* Intents */}
              {intents.length > 0 && (
                <Grid size={{ xs: 12, md: 6 }}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                    Intents ({intents.length})
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                    {intents.slice(0, expanded ? undefined : 5).map((intent, index) => (
                      <Chip
                        key={index}
                        label={intent}
                        size="small"
                        variant="outlined"
                        onDelete={() => {
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
                      />
                    ))}
                    {intents.length > 5 && (
                      <Button onClick={() => setExpanded(!expanded)} size="small">
                        {expanded ? 'Show less' : `+${intents.length - 5} more`}
                      </Button>
                    )}
                  </Box>
                </Grid>
              )}
            </Grid>

            {/* Application Details - collapsible subsection */}
            {config.purpose && (
              <>
                <Divider sx={{ my: 2 }} />
                <Box
                  onClick={() => togglePurposeSection('app-details')}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    py: 1,
                    '&:hover': { backgroundColor: theme.palette.action.hover },
                    borderRadius: 1,
                    mx: -1,
                    px: 1,
                  }}
                >
                  <Typography variant="subtitle2" color="text.secondary">
                    Application Details
                  </Typography>
                  <ExpandMoreIcon
                    sx={{
                      transform: expandedPurposeSections.has('app-details')
                        ? 'rotate(180deg)'
                        : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                      fontSize: 20,
                      color: 'text.secondary',
                    }}
                  />
                </Box>
                {expandedPurposeSections.has('app-details') && (
                  <Box sx={{ mt: 1 }}>
                    {(!config.purpose?.trim() || config.purpose.length < 100) &&
                    !isFoundationModelProvider(config.target.id) ? (
                      <Alert severity="warning" sx={{ mb: 2 }}>
                        Application details are required for high quality red team.{' '}
                        <Link
                          style={{ textDecoration: 'underline' }}
                          target="_blank"
                          rel="noopener noreferrer"
                          to="https://www.promptfoo.dev/docs/red-team/troubleshooting/best-practices/#1-provide-comprehensive-application-details"
                        >
                          Learn more.
                        </Link>
                        <Button onClick={navigateToPurpose} size="small" sx={{ ml: 2 }}>
                          Add details
                        </Button>
                      </Alert>
                    ) : null}
                    {parsedPurposeSections.length > 0 ? (
                      <Stack spacing={1}>
                        {parsedPurposeSections.map((section, index) => (
                          <Box
                            key={index}
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePurposeSection(section.title);
                            }}
                            sx={{
                              border: `1px solid ${theme.palette.divider}`,
                              borderRadius: 1,
                              cursor: 'pointer',
                              '&:hover': { backgroundColor: theme.palette.action.hover },
                            }}
                          >
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                p: 1.5,
                              }}
                            >
                              <Typography variant="body2" fontWeight={500}>
                                {section.title}
                              </Typography>
                              <ExpandMoreIcon
                                sx={{
                                  transform: expandedPurposeSections.has(section.title)
                                    ? 'rotate(180deg)'
                                    : 'rotate(0deg)',
                                  transition: 'transform 0.2s',
                                  fontSize: 18,
                                }}
                              />
                            </Box>
                            {expandedPurposeSections.has(section.title) && (
                              <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{ px: 1.5, pb: 1.5, whiteSpace: 'pre-wrap' }}
                              >
                                {section.content}
                              </Typography>
                            )}
                          </Box>
                        ))}
                      </Stack>
                    ) : (
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                        {config.purpose}
                      </Typography>
                    )}
                  </Box>
                )}
              </>
            )}

            {/* Run Options - inline */}
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
              Run Options
            </Typography>
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

            {/* Advanced - Test Variables */}
            <Divider sx={{ my: 2 }} />
            <Box
              onClick={() => togglePurposeSection('advanced')}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                py: 1,
                '&:hover': { backgroundColor: theme.palette.action.hover },
                borderRadius: 1,
                mx: -1,
                px: 1,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Advanced Configuration
                </Typography>
                <Chip label="Optional" size="small" variant="outlined" sx={{ height: 20 }} />
              </Box>
              <ExpandMoreIcon
                sx={{
                  transform: expandedPurposeSections.has('advanced')
                    ? 'rotate(180deg)'
                    : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                  fontSize: 20,
                  color: 'text.secondary',
                }}
              />
            </Box>
            {expandedPurposeSections.has('advanced') && (
              <Box sx={{ mt: 2 }}>
                <DefaultTestVariables />
              </Box>
            )}
          </AccordionDetails>
        </Accordion>

        {/* CLI Menu */}
        <Menu anchorEl={cliMenuAnchor} open={Boolean(cliMenuAnchor)} onClose={handleCliMenuClose}>
          <MenuItem
            onClick={() => {
              handleSaveYaml();
              handleCliMenuClose();
            }}
          >
            <ListItemIcon>
              <SaveIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Save YAML</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              handleOpenYamlDialog();
              handleCliMenuClose();
            }}
          >
            <ListItemIcon>
              <VisibilityIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>View YAML</ListItemText>
          </MenuItem>
          <Divider />
          <MenuItem
            onClick={() => {
              navigator.clipboard.writeText('promptfoo redteam run');
              showToast('Command copied to clipboard', 'success');
              handleCliMenuClose();
            }}
          >
            <ListItemIcon>
              <ContentCopyIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary="Copy CLI Command"
              secondary="promptfoo redteam run"
              secondaryTypographyProps={{ variant: 'caption' }}
            />
          </MenuItem>
        </Menu>

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

        <Dialog open={isCancelDialogOpen} onClose={() => setIsCancelDialogOpen(false)}>
          <DialogTitle>Cancel Evaluation?</DialogTitle>
          <DialogContent>
            <Typography variant="body1" paragraph>
              Are you sure you want to cancel the current evaluation? This will stop all running
              tests and any progress will be lost.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 2 }}>
              <Button variant="outlined" onClick={() => setIsCancelDialogOpen(false)}>
                Continue Running
              </Button>
              <Button variant="contained" color="error" onClick={confirmCancel}>
                Cancel Evaluation
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
