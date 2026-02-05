import { useEffect, useMemo, useRef, useState } from 'react';

import EnterpriseBanner from '@app/components/EnterpriseBanner';
import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import { Card, CardContent } from '@app/components/ui/card';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { Spinner } from '@app/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { EVAL_ROUTES } from '@app/constants/routes';
import { usePageMeta } from '@app/hooks/usePageMeta';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { cn } from '@app/lib/utils';
import { callApi } from '@app/utils/api';
import { formatDataGridDate } from '@app/utils/date';
import {
  type EvaluateResult,
  type EvaluateSummaryV2,
  type GradingResult,
  isProviderOptions,
  ResultFailureReason,
  type ResultLightweightWithLabel,
  type ResultsFile,
  type SharedResults,
} from '@promptfoo/types';
import { convertResultsToTable } from '@promptfoo/util/convertEvalResultsToTable';
import { AlertTriangle, Filter, ListOrdered, Printer, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import FrameworkCompliance from './FrameworkCompliance';
import { type CategoryStats, type TestResultStats } from './FrameworkComplianceUtils';
import Overview from './Overview';
import ReportDownloadButton from './ReportDownloadButton';
import ReportSettingsDialogButton from './ReportSettingsDialogButton';
import RiskCategories from './RiskCategories';
import StrategyStats from './StrategyStats';
import { getPluginIdFromResult, getStrategyIdFromTest } from './shared';
import TestSuites from './TestSuites';
import ToolsDialog, { Tool } from './ToolsDialog';

const App = () => {
  const navigate = useNavigate();
  const [evalId, setEvalId] = useState<string | null>(null);
  const [evalData, setEvalData] = useState<ResultsFile | null>(null);
  const [selectedPromptIndex, setSelectedPromptIndex] = useState(0);
  const [isToolsDialogOpen, setIsToolsDialogOpen] = useState(false);
  const { recordEvent } = useTelemetry();

  const [isFiltersVisible, setIsFiltersVisible] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pass' | 'fail'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  // Scroll tracking for persistent header
  const [isScrolled, setIsScrolled] = useState(false);

  // Vulnerabilities table reference for scroll navigation
  const vulnerabilitiesDataGridRef = useRef<HTMLDivElement>(null);

  const searchParams = new URLSearchParams(window.location.search);
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    const fetchEvalById = async (id: string) => {
      const resp = await callApi(`/results/${id}`, {
        cache: 'no-store',
      });
      const body = (await resp.json()) as SharedResults;
      setEvalData(body.data);

      // Track funnel event for report viewed
      recordEvent('funnel', {
        type: 'redteam',
        step: 'webui_report_viewed',
        source: 'webui',
        evalId: id,
      });
    };

    if (searchParams) {
      const evalId = searchParams.get('evalId');
      if (evalId) {
        setEvalId(evalId);
        fetchEvalById(evalId);
      } else {
        // Need to fetch the latest evalId from the server
        const fetchLatestEvalId = async () => {
          try {
            const resp = await callApi('/results', { cache: 'no-store' });
            if (!resp.ok) {
              console.error('Failed to fetch recent evals');
              return;
            }
            const body = (await resp.json()) as { data: ResultLightweightWithLabel[] };
            if (body.data && body.data.length > 0) {
              const latestEvalId = body.data[0].evalId;
              setEvalId(latestEvalId);
              fetchEvalById(latestEvalId);
            } else {
              console.log('No recent evals found');
            }
          } catch (error) {
            console.error('Error fetching latest eval:', error);
          }
        };

        fetchLatestEvalId();
      }
    }
  }, [recordEvent]);

  // Track scroll position for persistent header visibility
  useEffect(() => {
    const handleScroll = () => {
      const scrollThreshold = 200;
      setIsScrolled(window.scrollY > scrollThreshold);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const failuresByPlugin = useMemo(() => {
    if (!evalData) {
      return {};
    }

    const prompts =
      (evalData.version >= 4
        ? evalData.prompts
        : (evalData.results as EvaluateSummaryV2).table.head.prompts) || [];
    const selectedPrompt = prompts[selectedPromptIndex];

    const failures: Record<
      string,
      { prompt: string; output: string; gradingResult?: GradingResult; result?: EvaluateResult }[]
    > = {};
    evalData?.results.results.forEach((result) => {
      // Filter by selected target/provider if multiple targets exist
      if (prompts.length > 1 && selectedPrompt && result.promptIdx !== selectedPromptIndex) {
        return;
      }

      const pluginId = getPluginIdFromResult(result);
      if (!pluginId) {
        console.warn(`Could not get failures for plugin ${pluginId}`);
        return;
      }

      // Exclude results with errors from being counted as failures
      // TODO: Errors which arise while grading may be mis-classified as ResultFailureReason.ASSERT
      // and leak past this check. Check `result.gradingResult.reason` for errors e.g. "API call error: *".
      if (result.error && result.failureReason === ResultFailureReason.ERROR) {
        return;
      }

      if (!result.success || !result.gradingResult?.pass) {
        if (!failures[pluginId]) {
          failures[pluginId] = [];
        }
        // Backwards compatibility for old evals that used 'query' instead of 'prompt'. 2024-12-12
        const injectVar = evalData.config.redteam?.injectVar ?? 'prompt';
        const injectVarValue =
          result.vars[injectVar]?.toString() || result.vars['query']?.toString();
        failures[pluginId].push({
          prompt: injectVarValue || result.prompt.raw,
          output: result.response?.output,
          gradingResult: result.gradingResult || undefined,
          result,
        });
      }
    });
    return failures;
  }, [evalData, selectedPromptIndex]);

  const passesByPlugin = useMemo(() => {
    if (!evalData) {
      return {};
    }

    const prompts =
      (evalData.version >= 4
        ? evalData.prompts
        : (evalData.results as EvaluateSummaryV2).table.head.prompts) || [];
    const selectedPrompt = prompts[selectedPromptIndex];

    const passes: Record<
      string,
      { prompt: string; output: string; gradingResult?: GradingResult; result?: EvaluateResult }[]
    > = {};
    evalData?.results.results.forEach((result) => {
      // Filter by selected target/provider if multiple targets exist
      if (prompts.length > 1 && selectedPrompt && result.promptIdx !== selectedPromptIndex) {
        return;
      }

      const pluginId = getPluginIdFromResult(result);
      if (!pluginId) {
        console.warn(`Could not get passes for plugin ${pluginId}`);
        return;
      }

      // Exclude results with errors from being counted
      if (result.error && result.failureReason === ResultFailureReason.ERROR) {
        return;
      }

      if (result.success && result.gradingResult?.pass) {
        if (!passes[pluginId]) {
          passes[pluginId] = [];
        }
        passes[pluginId].push({
          prompt:
            result.vars.query?.toString() || result.vars.prompt?.toString() || result.prompt.raw,
          output: result.response?.output,
          gradingResult: result.gradingResult || undefined,
          result,
        });
      }
    });
    return passes;
  }, [evalData, selectedPromptIndex]);

  const categoryStats = useMemo(() => {
    if (!evalData) {
      return {};
    }

    const prompts =
      (evalData.version >= 4
        ? evalData.prompts
        : (evalData.results as EvaluateSummaryV2).table.head.prompts) || [];
    const selectedPrompt = prompts[selectedPromptIndex];

    return evalData.results.results.reduce(
      (acc, row) => {
        // Filter by selected target/provider if multiple targets exist
        if (prompts.length > 1 && selectedPrompt && row.promptIdx !== selectedPromptIndex) {
          return acc;
        }

        const pluginId = getPluginIdFromResult(row);
        if (!pluginId) {
          return acc;
        }

        // Exclude results with errors from statistics
        if (row.error && row.failureReason === ResultFailureReason.ERROR) {
          return acc;
        }

        acc[pluginId] = acc[pluginId] || { pass: 0, total: 0, passWithFilter: 0, failCount: 0 };
        acc[pluginId].total++;

        // Check if moderation tests failed but other tests passed - this indicates content was
        // flagged by moderation but would have passed otherwise
        const moderationPassed = row.gradingResult?.componentResults?.some(
          (result) => result.assertion?.type === 'moderation' && !result.pass,
        );

        if (row.success) {
          acc[pluginId].pass++;
          acc[pluginId].passWithFilter++; // Both regular and filtered pass counts increment
        } else if (moderationPassed) {
          acc[pluginId].passWithFilter++; // Only filtered pass count increments (partial success under moderation)
        }

        // Increment for grader-originated failures
        if (row.failureReason === ResultFailureReason.ASSERT) {
          acc[pluginId].failCount++;
        }

        return acc;
      },
      {} as Record<string, Required<TestResultStats>>,
    );
  }, [evalData, selectedPromptIndex]);

  const strategyStats = useMemo(() => {
    if (!failuresByPlugin || !passesByPlugin) {
      return {};
    }

    const stats: CategoryStats = {};

    Object.values(failuresByPlugin).forEach((tests) => {
      tests.forEach((test) => {
        const strategyId = getStrategyIdFromTest(test);

        if (!stats[strategyId]) {
          stats[strategyId] = { pass: 0, total: 0, failCount: 0 };
        }

        stats[strategyId].total += 1;
        stats[strategyId].failCount += 1;
      });
    });

    Object.values(passesByPlugin).forEach((tests) => {
      tests.forEach((test) => {
        const strategyId = getStrategyIdFromTest(test);

        if (!stats[strategyId]) {
          stats[strategyId] = { pass: 0, total: 0, failCount: 0 };
        }

        stats[strategyId].total += 1;
        stats[strategyId].pass += 1;
      });
    });

    return stats;
  }, [failuresByPlugin, passesByPlugin]);

  const availableCategories = useMemo(() => {
    return Object.keys(categoryStats).sort();
  }, [categoryStats]);

  const availableStrategies = useMemo(() => {
    return Object.keys(strategyStats).sort();
  }, [strategyStats]);

  const filteredFailuresByPlugin = useMemo(() => {
    if (!failuresByPlugin) {
      return {} as typeof failuresByPlugin;
    }

    const filtered: typeof failuresByPlugin = {};

    Object.entries(failuresByPlugin).forEach(([pluginId, tests]) => {
      if (selectedCategories.length > 0 && !selectedCategories.includes(pluginId)) {
        return;
      }

      if (statusFilter === 'pass') {
        return;
      }

      const filteredTests = tests.filter((test) => {
        if (searchQuery) {
          const searchLower = searchQuery.toLowerCase();
          const promptMatches = test.prompt?.toLowerCase().includes(searchLower);
          const outputMatches = test.output?.toLowerCase().includes(searchLower);
          if (!promptMatches && !outputMatches) {
            return false;
          }
        }

        if (selectedStrategies.length > 0) {
          const strategyId =
            test?.result?.testCase?.metadata?.strategyId || getStrategyIdFromTest(test);
          if (!selectedStrategies.includes(strategyId)) {
            return false;
          }
        }

        return true;
      });

      if (filteredTests.length > 0) {
        filtered[pluginId] = filteredTests;
      }
    });

    return filtered;
  }, [failuresByPlugin, selectedCategories, selectedStrategies, statusFilter, searchQuery]);

  const filteredPassesByPlugin = useMemo(() => {
    if (!passesByPlugin) {
      return {} as typeof passesByPlugin;
    }

    const filtered: typeof passesByPlugin = {};

    Object.entries(passesByPlugin).forEach(([pluginId, tests]) => {
      if (selectedCategories.length > 0 && !selectedCategories.includes(pluginId)) {
        return;
      }

      if (statusFilter === 'fail') {
        return;
      }

      const filteredTests = tests.filter((test) => {
        if (searchQuery) {
          const searchLower = searchQuery.toLowerCase();
          const promptMatches = test.prompt?.toLowerCase().includes(searchLower);
          const outputMatches = test.output?.toLowerCase().includes(searchLower);
          if (!promptMatches && !outputMatches) {
            return false;
          }
        }

        if (selectedStrategies.length > 0) {
          const strategyId =
            test?.result?.testCase?.metadata?.strategyId || getStrategyIdFromTest(test);
          if (!selectedStrategies.includes(strategyId)) {
            return false;
          }
        }

        return true;
      });

      if (filteredTests.length > 0) {
        filtered[pluginId] = filteredTests;
      }
    });

    return filtered;
  }, [passesByPlugin, selectedCategories, selectedStrategies, statusFilter, searchQuery]);

  /**
   * Recalculates category (plugin) stats given the filtered failures and passes.
   */
  const filteredCategoryStats = useMemo(() => {
    const stats: Record<string, Required<TestResultStats>> = {};

    Object.entries(filteredFailuresByPlugin).forEach(([pluginId, tests]) => {
      // Initialize the stats for the plugin
      stats[pluginId] = stats[pluginId] || { pass: 0, total: 0, passWithFilter: 0, failCount: 0 };
      stats[pluginId].total += tests.length;
      stats[pluginId].failCount += tests.length;
    });

    Object.entries(filteredPassesByPlugin).forEach(([pluginId, tests]) => {
      // Initialize the stats for the plugin if it doesn't already exist
      stats[pluginId] = stats[pluginId] || { pass: 0, total: 0, passWithFilter: 0, failCount: 0 };
      stats[pluginId].pass += tests.length;
      stats[pluginId].passWithFilter += tests.length;
      stats[pluginId].total += tests.length;
    });

    return stats;
  }, [filteredFailuresByPlugin, filteredPassesByPlugin]);

  const filteredStrategyStats = useMemo(() => {
    const stats: CategoryStats = {};

    Object.values(filteredFailuresByPlugin).forEach((tests) => {
      tests.forEach((test) => {
        const strategyId =
          test?.result?.testCase?.metadata?.strategyId || getStrategyIdFromTest(test);

        if (!stats[strategyId]) {
          stats[strategyId] = { pass: 0, total: 0, failCount: 0 };
        }

        stats[strategyId].failCount += 1;
        stats[strategyId].total += 1;
      });
    });

    Object.values(filteredPassesByPlugin).forEach((tests) => {
      tests.forEach((test) => {
        const strategyId =
          test?.result?.testCase?.metadata?.strategyId || getStrategyIdFromTest(test);

        if (!stats[strategyId]) {
          stats[strategyId] = { pass: 0, total: 0, failCount: 0 };
        }

        stats[strategyId].total += 1;
        stats[strategyId].pass += 1;
      });
    });

    return stats;
  }, [filteredFailuresByPlugin, filteredPassesByPlugin]);

  const hasActiveFilters =
    selectedCategories.length > 0 ||
    selectedStrategies.length > 0 ||
    statusFilter !== 'all' ||
    Boolean(searchQuery);

  /**
   * Extracts custom policy IDs from the results in order to then
   * filter policies from the categories stats for the framework compliance section.
   */
  const customPolicyIds = useMemo(() => {
    const ids = new Set();
    if (!evalData) {
      return ids;
    }

    evalData.results.results.forEach((row) => {
      if (row.metadata?.pluginId === 'policy') {
        ids.add(getPluginIdFromResult(row));
      }
    });

    return ids;
  }, [evalData]);

  /**
   * Constructs category stats for the framework compliance section.
   *
   * - Determines whether to use filtered or unfiltered category stats based on the presence of active filters.
   * - Removes custom policies; they do not belong to any framework.
   */
  const categoryStatsForFrameworkCompliance = useMemo(() => {
    const stats = { ...(hasActiveFilters ? filteredCategoryStats : categoryStats) };
    // Remove custom policies; they do not belong to any framework.
    Object.keys(stats).forEach((pluginId) => {
      if (customPolicyIds.has(pluginId)) {
        delete stats[pluginId];
      }
    });
    return stats;
  }, [hasActiveFilters, filteredCategoryStats, categoryStats, customPolicyIds]);

  const actionButtons = useMemo(
    () => (
      <div className="flex items-center gap-1">
        {evalId && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="view all logs"
                className="text-muted-foreground hover:text-foreground"
                onClick={(event) => {
                  const url = EVAL_ROUTES.DETAIL(evalId);
                  if (event.ctrlKey || event.metaKey) {
                    window.open(url, '_blank');
                  } else if (evalId) {
                    navigate(url);
                  }
                }}
              >
                <ListOrdered className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>View all logs</TooltipContent>
          </Tooltip>
        )}
        {evalId && evalData && (
          <ReportDownloadButton
            evalDescription={evalData?.config.description || evalId}
            evalData={evalData}
          />
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="print page"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => window.print()}
            >
              <Printer className="size-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Print this page (Ctrl+P) and select &apos;Save as PDF&apos; for best results
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="filter results"
              onClick={() => setIsFiltersVisible(!isFiltersVisible)}
              className={
                hasActiveFilters ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }
            >
              <Filter className="size-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Filter results</TooltipContent>
        </Tooltip>
        <ReportSettingsDialogButton />
      </div>
    ),
    [evalData, evalId, navigate, hasActiveFilters, isFiltersVisible],
  );

  usePageMeta({
    title: `Report: ${evalData?.config.description || evalId || 'Red Team'}`,
    description: 'Red team evaluation report',
  });

  if (!evalData || !evalId) {
    return (
      <div className="flex h-36 flex-col items-center justify-center gap-3">
        <Spinner className="size-5" />
        <span>Waiting for report data</span>
      </div>
    );
  }

  if (!evalData.config.redteam) {
    return (
      <div className="flex h-screen flex-col items-center justify-center p-6">
        <Card className="max-w-xl p-8 text-center">
          <AlertTriangle className="mx-auto mb-4 size-16 text-amber-500" />
          <h1 className="mb-6 text-2xl font-bold">Report unavailable</h1>
          <p className="text-muted-foreground">
            The {searchParams.get('evalId') ? 'selected' : 'latest'} evaluation results are not
            displayable in report format.
          </p>
          <p className="text-muted-foreground">Please run a red team and try again.</p>
        </Card>
      </div>
    );
  }

  const prompts =
    (evalData.version >= 4
      ? evalData.prompts
      : (evalData.results as EvaluateSummaryV2).table.head.prompts) || [];
  const selectedPrompt = prompts[selectedPromptIndex];
  const tableData =
    (evalData.version >= 4
      ? convertResultsToTable(evalData).body
      : (evalData.results as EvaluateSummaryV2).table.body) || [];

  let tools: Tool[] = [];
  if (Array.isArray(evalData.config.providers) && isProviderOptions(evalData.config.providers[0])) {
    const providerTools = evalData.config.providers[0].config?.tools;
    // If providerTools exists, convert it to an array (if it's not already)
    // Otherwise, use an empty array
    tools = providerTools ? (Array.isArray(providerTools) ? providerTools : [providerTools]) : [];
  }

  const clearAllFilters = () => {
    setSelectedCategories([]);
    setSelectedStrategies([]);
    setStatusFilter('all');
    setSearchQuery('');
  };

  return (
    <>
      {/* Persistent header on scroll */}
      <div
        className={cn(
          'fixed inset-x-0 top-0 z-50 border-b border-border bg-card transition-transform duration-150 print:hidden',
          isScrolled ? 'translate-y-0 shadow-md' : '-translate-y-full',
        )}
      >
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex min-h-16 items-center justify-between py-2">
            <h1 className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap pr-4 font-bold">
              {evalData.config.description || 'Risk Assessment'}
            </h1>
            <div className="shrink-0">{actionButtons}</div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-8 pt-4">
        <div className="flex flex-col gap-6">
          {evalData.config.redteam && <EnterpriseBanner evalId={evalId || ''} />}

          {/* Report Header Card */}
          <Card className="relative rounded-xl p-6 pr-48 shadow-md dark:shadow-none print:pr-4">
            <div className="absolute right-4 top-4 flex print:hidden">{actionButtons}</div>
            <h1 className="text-2xl font-bold">
              {evalData.config.description || 'Risk Assessment'}
            </h1>
            <p className="mb-4 text-muted-foreground">{formatDataGridDate(evalData.createdAt)}</p>
            <div className="flex flex-wrap gap-3">
              {selectedPrompt && prompts.length > 1 ? (
                <Select
                  value={String(selectedPromptIndex)}
                  onValueChange={(value) => setSelectedPromptIndex(Number(value))}
                >
                  <SelectTrigger className="h-6 w-auto rounded-full border-none bg-muted px-3 text-xs">
                    <SelectValue>
                      <span className="text-xs">
                        <strong>Target:</strong> {prompts[selectedPromptIndex].provider}
                      </span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {prompts.map((prompt, idx) => (
                      <SelectItem key={idx} value={String(idx)}>
                        {prompt.provider}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : selectedPrompt ? (
                <Badge variant="secondary">
                  <strong>Target:</strong> {selectedPrompt.provider}
                </Badge>
              ) : null}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Badge variant="secondary">
                      <strong>Depth:</strong>{' '}
                      {(
                        selectedPrompt?.metrics?.tokenUsage?.numRequests || tableData.length
                      ).toLocaleString()}{' '}
                      probes
                    </Badge>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {selectedPrompt?.metrics?.tokenUsage?.total
                    ? `${selectedPrompt.metrics.tokenUsage.total.toLocaleString()} tokens`
                    : ''}
                </TooltipContent>
              </Tooltip>
              {selectedPrompt && selectedPrompt.raw !== '{{prompt}}' && (
                <Badge variant="secondary">
                  <strong>Prompt:</strong> &quot;
                  {selectedPrompt.raw.length > 40
                    ? `${selectedPrompt.raw.substring(0, 40)}...`
                    : selectedPrompt.raw}
                  &quot;
                </Badge>
              )}
              {tools.length > 0 && (
                <Badge
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() => setIsToolsDialogOpen(true)}
                >
                  <strong>Tools:</strong> {tools.length} available
                </Badge>
              )}
            </div>
          </Card>

          {/* Filters Card */}
          {isFiltersVisible && (
            <Card className="print:hidden">
              <CardContent className="p-4">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Filters</h2>
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                      <X className="mr-1 size-4" />
                      Clear All
                    </Button>
                  )}
                </div>

                <div className="flex flex-col gap-4 md:flex-row">
                  <div className="min-w-[200px]">
                    <Label htmlFor="search" className="sr-only">
                      Search prompts & outputs
                    </Label>
                    <Input
                      id="search"
                      placeholder="Search prompts & outputs"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>

                  <div className="min-w-[120px]">
                    <Select
                      value={statusFilter}
                      onValueChange={(value) => setStatusFilter(value as 'all' | 'pass' | 'fail')}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="pass">Pass Only</SelectItem>
                        <SelectItem value="fail">Fail Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="min-w-[200px]">
                    <Select
                      value={selectedCategories.length === 1 ? selectedCategories[0] : 'all'}
                      onValueChange={(value) =>
                        setSelectedCategories(value === 'all' ? [] : [value])
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Risk Categories">
                          {selectedCategories.length > 0
                            ? `${selectedCategories.length} selected`
                            : 'Risk Categories'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {availableCategories.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="min-w-[200px]">
                    <Select
                      value={selectedStrategies.length === 1 ? selectedStrategies[0] : 'all'}
                      onValueChange={(value) =>
                        setSelectedStrategies(value === 'all' ? [] : [value])
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Strategies">
                          {selectedStrategies.length > 0
                            ? `${selectedStrategies.length} selected`
                            : 'Strategies'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Strategies</SelectItem>
                        {availableStrategies.map((strategy) => (
                          <SelectItem key={strategy} value={strategy}>
                            {strategy}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Overview
            categoryStats={hasActiveFilters ? filteredCategoryStats : categoryStats}
            plugins={evalData.config.redteam.plugins || []}
            vulnerabilitiesDataGridRef={vulnerabilitiesDataGridRef}
          />
          <StrategyStats
            strategyStats={hasActiveFilters ? filteredStrategyStats : strategyStats}
            failuresByPlugin={hasActiveFilters ? filteredFailuresByPlugin : failuresByPlugin}
            passesByPlugin={hasActiveFilters ? filteredPassesByPlugin : passesByPlugin}
            plugins={evalData.config.redteam.plugins || []}
          />
          <RiskCategories
            categoryStats={hasActiveFilters ? filteredCategoryStats : categoryStats}
            evalId={evalId}
            failuresByPlugin={hasActiveFilters ? filteredFailuresByPlugin : failuresByPlugin}
            passesByPlugin={hasActiveFilters ? filteredPassesByPlugin : passesByPlugin}
          />
          <TestSuites
            evalId={evalId}
            categoryStats={hasActiveFilters ? filteredCategoryStats : categoryStats}
            plugins={evalData.config.redteam.plugins || []}
            failuresByPlugin={hasActiveFilters ? filteredFailuresByPlugin : failuresByPlugin}
            passesByPlugin={hasActiveFilters ? filteredPassesByPlugin : passesByPlugin}
            vulnerabilitiesDataGridRef={vulnerabilitiesDataGridRef}
          />
          <FrameworkCompliance
            evalId={evalId}
            categoryStats={categoryStatsForFrameworkCompliance}
            config={evalData.config}
          />
        </div>
        <ToolsDialog
          open={isToolsDialogOpen}
          onClose={() => setIsToolsDialogOpen(false)}
          tools={tools}
        />
      </div>
    </>
  );
};

export default App;
