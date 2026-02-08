import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Alert, AlertContent, AlertDescription } from '@app/components/ui/alert';
import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@app/components/ui/card';
import { Code } from '@app/components/ui/code';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@app/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { Separator } from '@app/components/ui/separator';
import { Spinner } from '@app/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { EVAL_ROUTES, REDTEAM_ROUTES } from '@app/constants/routes';
import { useApiHealth } from '@app/hooks/useApiHealth';
import { useEmailVerification } from '@app/hooks/useEmailVerification';
import { useEvalHistoryRefresh } from '@app/hooks/useEvalHistoryRefresh';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { useToast } from '@app/hooks/useToast';
import { cn } from '@app/lib/utils';
import YamlEditor from '@app/pages/eval-creator/components/YamlEditor';
import { useRedteamJobStore } from '@app/stores/redteamJobStore';
import { callApi } from '@app/utils/api';
import { isFoundationModelProvider } from '@promptfoo/providers/constants';
import { REDTEAM_DEFAULTS, strategyDisplayNames } from '@promptfoo/redteam/constants';
import {
  isValidPolicyObject,
  makeDefaultPolicyName,
} from '@promptfoo/redteam/plugins/policy/utils';
import { getUnifiedConfig } from '@promptfoo/redteam/sharedFrontend';
import {
  BarChart2,
  ChevronDown,
  Eye,
  Info,
  Play,
  Save,
  Search,
  Sliders,
  Square,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';
import { generateOrderedYaml } from '../utils/yamlHelpers';
import DefaultTestVariables from './DefaultTestVariables';
import { EmailVerificationDialog } from './EmailVerificationDialog';
import EstimationsDisplay from './EstimationsDisplay';
import { LogViewer } from './LogViewer';
import PageWrapper from './PageWrapper';
import { RunOptionsContent } from './RunOptions';
import type { Policy, PolicyObject, RedteamPlugin } from '@promptfoo/redteam/types';
import type { Job, RedteamRunOptions } from '@promptfoo/types';

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
  const { recordEvent } = useTelemetry();
  const {
    data: { status: apiHealthStatus },
    isLoading: isCheckingApiHealth,
  } = useApiHealth();
  const { jobId: savedJobId, setJob, clearJob, _hasHydrated } = useRedteamJobStore();
  const { signalEvalCompleted } = useEvalHistoryRefresh();
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    recordEvent('webui_page_view', { page: 'redteam_config_review' });
  }, []);

  // Sync local maxConcurrency state with config
  useEffect(() => {
    setMaxConcurrency(String(config.maxConcurrency || REDTEAM_DEFAULTS.MAX_CONCURRENCY));
  }, [config.maxConcurrency]);

  // Track if recovery has been attempted to prevent duplicate runs
  const hasAttemptedRecovery = useRef(false);

  // Recover job state on mount (e.g., after navigation)
  // Wait for Zustand to hydrate from localStorage before checking savedJobId
  // Using "use no memo" - this effect intentionally runs once after hydration with limited deps
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    'use no memo';
    if (!_hasHydrated || hasAttemptedRecovery.current) {
      return;
    }
    hasAttemptedRecovery.current = true;

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
            showToast('Could not reconnect to running job.', 'error');
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
  }, [_hasHydrated]); // Run once after hydration completes

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
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
              signalEvalCompleted();

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
    [clearJob, recordEvent, showToast, signalEvalCompleted],
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
      <div>
        <div className="mb-8">
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            placeholder="My Red Team Configuration"
            value={config.description}
            onChange={handleDescriptionChange}
            autoFocus
          />
        </div>

        <h2 className="mb-6 text-xl font-semibold">Configuration Summary</h2>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Plugins Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Plugins ({pluginSummary.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {pluginSummary.map(([label, count]) => (
                  <Badge
                    key={label}
                    variant="secondary"
                    className={cn(
                      'gap-1 pr-1',
                      label === 'Custom Policy' && 'bg-primary text-primary-foreground',
                    )}
                  >
                    {count > 1 ? `${label} (${count})` : label}
                    <button
                      type="button"
                      onClick={() => {
                        const newPlugins = config.plugins.filter((plugin) => {
                          const pluginLabel = getPluginSummary(plugin).label;
                          return pluginLabel !== label;
                        });
                        updateConfig('plugins', newPlugins);
                      }}
                      className="ml-1 rounded-full p-0.5 hover:bg-black/10"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              {pluginSummary.length === 0 && (
                <>
                  <Alert variant="warning" className="mt-4">
                    <AlertContent>
                      <AlertDescription>
                        You haven't selected any plugins. Plugins are the vulnerabilities that the
                        red team will search for.
                      </AlertDescription>
                    </AlertContent>
                  </Alert>
                  <Button onClick={navigateToPlugins} className="mt-4">
                    Add a plugin
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Strategies Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Strategies ({strategySummary.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {strategySummary.map(([label, count]) => (
                  <Badge key={label} variant="secondary" className="gap-1 pr-1">
                    {count > 1 ? `${label} (${count})` : label}
                    <button
                      type="button"
                      onClick={() => {
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
                      className="ml-1 rounded-full p-0.5 hover:bg-black/10"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              {(strategySummary.length === 0 ||
                (strategySummary.length === 1 && strategySummary[0][0] === 'Basic')) && (
                <>
                  <Alert variant="warning" className="mt-4">
                    <AlertContent>
                      <AlertDescription>
                        The basic strategy is great for an end-to-end setup test, but don't expect
                        any findings. Once you've verified that the setup is working, add another
                        strategy.
                      </AlertDescription>
                    </AlertContent>
                  </Alert>
                  <Button onClick={navigateToStrategies} className="mt-4">
                    Add more strategies
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Custom Policies Card */}
          {customPolicies.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Custom Policies ({customPolicies.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-[400px] space-y-2 overflow-y-auto">
                  {customPolicies.map((policy, index) => {
                    const isPolicyObject = isValidPolicyObject(policy.config.policy);
                    return (
                      <div
                        key={index}
                        className="relative flex items-start justify-between rounded-lg bg-muted/50 p-3"
                      >
                        <div className="min-w-0 flex-1 pr-8">
                          <p className="mb-1 font-medium">
                            {isPolicyObject
                              ? (policy.config.policy as PolicyObject).name
                              : makeDefaultPolicyName(index)}
                          </p>
                          <p className="line-clamp-2 text-sm text-muted-foreground">
                            {typeof policy.config.policy === 'string'
                              ? policy.config.policy
                              : policy.config.policy?.text || ''}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 shrink-0"
                          onClick={() => {
                            const policyToMatch =
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
                          <X className="size-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Intents Card */}
          {intents.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Intents ({intents.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {intents.slice(0, expanded ? undefined : 5).map((intent, index) => (
                    <div key={index} className="relative rounded-lg bg-muted/50 p-3 pr-8">
                      <p className="line-clamp-2 text-sm">{intent}</p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1 size-6"
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
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  ))}
                  {intents.length > 5 && (
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => setExpanded(!expanded)}
                      className="mt-2 px-0"
                    >
                      {expanded ? 'Show Less' : `Show ${intents.length - 5} More`}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Collapsible Sections */}
        <div className="mt-6 rounded-lg border border-border shadow-sm">
          {/* Application Details */}
          <Collapsible open={isPurposeExpanded} onOpenChange={setIsPurposeExpanded}>
            <CollapsibleTrigger className="flex w-full items-center justify-between border-b p-4 hover:bg-muted/50">
              <div className="flex items-center gap-2">
                <Info className="size-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Application Details</h3>
                {config.purpose && (
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-xs',
                      config.purpose.length < 100
                        ? 'border-amber-500 text-amber-600'
                        : 'border-green-500 text-green-600',
                    )}
                  >
                    {config.purpose.length < 100 ? 'Needs more detail' : 'Configured'}
                  </Badge>
                )}
                {!config.purpose && (
                  <Badge variant="outline" className="border-destructive text-xs text-destructive">
                    Not configured
                  </Badge>
                )}
              </div>
              <ChevronDown
                className={cn(
                  'size-5 text-muted-foreground transition-transform',
                  isPurposeExpanded && 'rotate-180',
                )}
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="p-4">
                {parsedPurposeSections.length > 1 && (
                  <div className="mb-2 flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (expandedPurposeSections.size === parsedPurposeSections.length) {
                          setExpandedPurposeSections(new Set());
                        } else {
                          setExpandedPurposeSections(
                            new Set(parsedPurposeSections.map((s) => s.title)),
                          );
                        }
                      }}
                    >
                      {expandedPurposeSections.size === parsedPurposeSections.length
                        ? 'Collapse All'
                        : 'Expand All'}
                    </Button>
                  </div>
                )}

                {(!config.purpose?.trim() || config.purpose.length < 100) &&
                !isFoundationModelProvider(config.target.id) ? (
                  <div className="mb-4">
                    <Alert variant="warning">
                      <AlertContent>
                        <AlertDescription>
                          Application details are required to generate a high quality red team. Go
                          to the Application Details section and add a purpose.{' '}
                          <Link
                            className="underline"
                            target="_blank"
                            rel="noopener noreferrer"
                            to="https://www.promptfoo.dev/docs/red-team/troubleshooting/best-practices/#1-provide-comprehensive-application-details"
                          >
                            Learn more about red team best practices.
                          </Link>
                        </AlertDescription>
                      </AlertContent>
                    </Alert>
                    <Button onClick={navigateToPurpose} className="mt-4">
                      Add application details
                    </Button>
                  </div>
                ) : null}

                {parsedPurposeSections.length > 0 ? (
                  <div className="mt-2 space-y-4">
                    {parsedPurposeSections.map((section, index) => (
                      <div key={index} className="overflow-hidden rounded-lg border">
                        <button
                          type="button"
                          onClick={() => togglePurposeSection(section.title)}
                          className="flex w-full items-center justify-between bg-muted/50 p-3 hover:bg-muted"
                        >
                          <span className="text-sm font-medium">{section.title}</span>
                          <ChevronDown
                            className={cn(
                              'size-4 transition-transform',
                              expandedPurposeSections.has(section.title) && 'rotate-180',
                            )}
                          />
                        </button>
                        {expandedPurposeSections.has(section.title) && (
                          <div className="bg-background p-4">
                            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                              {section.content}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : config.purpose ? (
                  <p
                    onClick={() => setIsPurposeExpanded(!isPurposeExpanded)}
                    className={cn(
                      'cursor-pointer whitespace-pre-wrap rounded-lg bg-background p-2 text-sm hover:bg-muted/50',
                      !isPurposeExpanded && 'line-clamp-6',
                    )}
                  >
                    {config.purpose}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Not specified</p>
                )}
                {config.purpose &&
                  parsedPurposeSections.length === 0 &&
                  config.purpose.split('\n').length > 6 && (
                    <button
                      type="button"
                      className="mt-1 text-xs text-primary hover:underline"
                      onClick={() => setIsPurposeExpanded(!isPurposeExpanded)}
                    >
                      {isPurposeExpanded ? 'Show less' : 'Show more'}
                    </button>
                  )}

                {config.testGenerationInstructions && (
                  <div className="mt-4">
                    <h4 className="mb-2 text-sm font-medium">Test Generation Instructions</h4>
                    <p
                      onClick={() => setIsTestInstructionsExpanded(!isTestInstructionsExpanded)}
                      className={cn(
                        'cursor-pointer whitespace-pre-wrap rounded-lg bg-background p-2 text-sm hover:bg-muted/50',
                        !isTestInstructionsExpanded && 'line-clamp-6',
                      )}
                    >
                      {config.testGenerationInstructions}
                    </p>
                    {config.testGenerationInstructions &&
                      config.testGenerationInstructions.split('\n').length > 6 && (
                        <button
                          type="button"
                          className="mt-1 text-xs text-primary hover:underline"
                          onClick={() => setIsTestInstructionsExpanded(!isTestInstructionsExpanded)}
                        >
                          {isTestInstructionsExpanded ? 'Show less' : 'Show more'}
                        </button>
                      )}
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Advanced Configuration */}
          <Collapsible open={isAdvancedConfigExpanded} onOpenChange={setIsAdvancedConfigExpanded}>
            <CollapsibleTrigger className="flex w-full items-center justify-between border-b p-4 hover:bg-muted/50">
              <div className="flex items-center gap-2">
                <Sliders className="size-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Advanced Configuration</h3>
                <Badge variant="outline" className="text-xs">
                  Optional
                </Badge>
              </div>
              <ChevronDown
                className={cn(
                  'size-5 text-muted-foreground transition-transform',
                  isAdvancedConfigExpanded && 'rotate-180',
                )}
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="p-4">
                <p className="mb-6 text-sm text-muted-foreground">
                  Configure advanced options that apply to all test cases. These settings are for
                  power users who need fine-grained control over their red team evaluation.
                </p>
                <DefaultTestVariables />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Run Options */}
          <Collapsible open={isRunOptionsExpanded} onOpenChange={setIsRunOptionsExpanded}>
            <CollapsibleTrigger className="flex w-full items-center justify-between p-4 hover:bg-muted/50">
              <div className="flex items-center gap-2">
                <Play className="size-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Run Options</h3>
              </div>
              <ChevronDown
                className={cn(
                  'size-5 text-muted-foreground transition-transform',
                  isRunOptionsExpanded && 'rotate-180',
                )}
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="p-4 pt-0">
                <RunOptionsContent
                  numTests={config.numTests}
                  runOptions={{
                    maxConcurrency: config.maxConcurrency,
                    delay: config.target.config.delay,
                    verbose: config.target.config.verbose,
                  }}
                  updateConfig={updateConfig}
                  updateRunOption={(
                    key: keyof RedteamRunOptions,
                    value: RedteamRunOptions[keyof RedteamRunOptions],
                  ) => {
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
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <Separator className="my-8" />

        <h2 className="mb-6 text-xl font-semibold">Run Your Scan</h2>

        <EstimationsDisplay config={config} />

        <Card className="p-6">
          <div className="mb-8">
            <h3 className="mb-2 text-lg font-semibold">Option 1: Save and Run via CLI</h3>
            <p className="mb-4 text-muted-foreground">
              Save your configuration and run it from the command line. Full control over the
              evaluation process, good for larger scans:
            </p>
            <Code>promptfoo redteam run</Code>
            <div className="mt-4 flex gap-3">
              <Button onClick={handleSaveYaml} className="gap-2">
                <Save className="size-4" />
                Save YAML
              </Button>
              <Button variant="outline" onClick={handleOpenYamlDialog} className="gap-2">
                <Eye className="size-4" />
                View YAML
              </Button>
            </div>
          </div>

          <Separator className="my-6" />

          <div>
            <h3 className="mb-2 text-lg font-semibold">Option 2: Run Directly in Browser</h3>
            <p className="mb-4 text-muted-foreground">
              Run the red team evaluation right here. Simpler but less powerful than the CLI, good
              for tests and small scans:
            </p>
            {apiHealthStatus !== 'connected' && !isCheckingApiHealth && (
              <Alert variant="warning" className="mb-4">
                <AlertContent>
                  <AlertDescription>
                    {apiHealthStatus === 'blocked'
                      ? 'Cannot connect to Promptfoo Cloud. The "Run Now" option requires a connection to Promptfoo Cloud.'
                      : apiHealthStatus === 'disabled'
                        ? 'Remote generation is disabled. The "Run Now" option is not available.'
                        : 'Checking connection status...'}
                  </AlertDescription>
                </AlertContent>
              </Alert>
            )}
            <div className="mb-4">
              <div className="flex items-center gap-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        onClick={handleRunWithSettings}
                        disabled={isRunNowDisabled}
                        className="gap-2"
                      >
                        {isRunning ? <Spinner className="size-4" /> : <Play className="size-4" />}
                        {isRunning ? 'Running...' : 'Run Now'}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {runNowTooltipMessage && <TooltipContent>{runNowTooltipMessage}</TooltipContent>}
                </Tooltip>
                {isRunning && (
                  <Button variant="destructive" onClick={handleCancel} className="gap-2">
                    <Square className="size-4" />
                    Cancel
                  </Button>
                )}
                {evalId && (
                  <>
                    <Button asChild className="gap-2 bg-green-600 hover:bg-green-700">
                      <a href={REDTEAM_ROUTES.REPORT_DETAIL(evalId)}>
                        <BarChart2 className="size-4" />
                        View Report
                      </a>
                    </Button>
                    <Button asChild className="gap-2 bg-green-600 hover:bg-green-700">
                      <a href={EVAL_ROUTES.DETAIL(evalId)}>
                        <Search className="size-4" />
                        View Probes
                      </a>
                    </Button>
                  </>
                )}
              </div>
            </div>
            {logs.length > 0 && <LogViewer logs={logs} />}
          </div>
        </Card>

        {/* YAML Dialog */}
        <Dialog open={isYamlDialogOpen} onOpenChange={setIsYamlDialogOpen}>
          <DialogContent className="max-w-6xl w-[90vw] overflow-hidden">
            <DialogHeader>
              <DialogTitle>YAML Configuration</DialogTitle>
            </DialogHeader>
            <div className="min-w-0 overflow-auto">
              <YamlEditor initialYaml={yamlContent} readOnly />
            </div>
          </DialogContent>
        </Dialog>

        {/* Job Status Dialog */}
        <Dialog open={isJobStatusDialogOpen} onOpenChange={setIsJobStatusDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Job Already Running</DialogTitle>
            </DialogHeader>
            <p className="text-muted-foreground">
              There is already a red team evaluation running. Would you like to cancel it and start
              a new one?
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsJobStatusDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCancelExistingAndRun}>Cancel Existing & Run New</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {emailVerificationError && (
          <Alert variant="destructive" className="mt-4">
            <AlertContent>
              <AlertDescription>{emailVerificationError}</AlertDescription>
            </AlertContent>
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
      </div>
    </PageWrapper>
  );
}
