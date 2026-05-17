import { useEffect, useMemo, useRef, useState } from 'react';

import EnterpriseBanner from '@app/components/EnterpriseBanner';
import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import { Card, CardContent } from '@app/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { DropdownMenuItem } from '@app/components/ui/dropdown-menu';
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
import { AlertTriangle, Filter, ListOrdered, Printer, Settings, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import FrameworkCompliance from './FrameworkCompliance';
import { type CategoryStats, type TestResultStats } from './FrameworkComplianceUtils';
import Overview from './Overview';
import ReportDownloadButton from './ReportDownloadButton';
import ReportSettingsDialogButton from './ReportSettingsDialogButton';
import RiskCategories from './RiskCategories';
import StrategyStats from './StrategyStats';
import { getPluginIdFromResult, getStrategyIdFromTest } from './shared';
import { useReportStore } from './store';
import TestSuites from './TestSuites';
import ToolsDialog from './ToolsDialog';

interface ReportProps {
  /** When provided, uses this evalId instead of reading from URL search params. */
  evalId?: string;
  /** When true, skips rendering the report's own header (persistent scroll header, header card, enterprise banner). Used when embedded inside EvalHeader. */
  embedded?: boolean;
  /** Called with dropdown menu items for the eval actions dropdown when embedded. */
  onActionsReady?: (actions: React.ReactNode) => void;
}

type FilterStatus = 'all' | 'pass' | 'fail';

type PluginResultEntry = {
  prompt: string;
  output: string;
  gradingResult?: GradingResult;
  result?: EvaluateResult;
};

type PluginResultMap = Record<string, PluginResultEntry[]>;

function getReportPrompts(evalData: ResultsFile) {
  return (
    (evalData.version >= 4
      ? evalData.prompts
      : (evalData.results as EvaluateSummaryV2).table.head.prompts) || []
  );
}

function getReportTableData(evalData: ResultsFile) {
  return (
    (evalData.version >= 4
      ? convertResultsToTable(evalData).body
      : (evalData.results as EvaluateSummaryV2).table.body) || []
  );
}

function shouldIncludePromptResult({
  prompts,
  selectedPromptIndex,
  promptIdx,
}: {
  prompts: ReturnType<typeof getReportPrompts>;
  selectedPromptIndex: number;
  promptIdx?: number;
}) {
  const selectedPrompt = prompts[selectedPromptIndex];
  return !(prompts.length > 1 && selectedPrompt && promptIdx !== selectedPromptIndex);
}

function buildFailuresByPlugin(evalData: ResultsFile, selectedPromptIndex: number): PluginResultMap {
  const prompts = getReportPrompts(evalData);
  const failures: PluginResultMap = {};

  evalData.results.results.forEach((result) => {
    if (
      !shouldIncludePromptResult({
        prompts,
        selectedPromptIndex,
        promptIdx: result.promptIdx,
      })
    ) {
      return;
    }

    const pluginId = getPluginIdFromResult(result);
    if (!pluginId) {
      console.warn(`Could not get failures for plugin ${pluginId}`);
      return;
    }
    if (result.error && result.failureReason === ResultFailureReason.ERROR) {
      return;
    }
    if (result.success && result.gradingResult?.pass) {
      return;
    }

    failures[pluginId] = failures[pluginId] || [];
    const injectVar = evalData.config.redteam?.injectVar ?? 'prompt';
    const injectVarValue = result.vars[injectVar]?.toString() || result.vars.query?.toString();
    failures[pluginId].push({
      prompt: injectVarValue || result.prompt.raw,
      output: result.response?.output,
      gradingResult: result.gradingResult || undefined,
      result,
    });
  });

  return failures;
}

function buildPassesByPlugin(evalData: ResultsFile, selectedPromptIndex: number): PluginResultMap {
  const prompts = getReportPrompts(evalData);
  const passes: PluginResultMap = {};

  evalData.results.results.forEach((result) => {
    if (
      !shouldIncludePromptResult({
        prompts,
        selectedPromptIndex,
        promptIdx: result.promptIdx,
      })
    ) {
      return;
    }

    const pluginId = getPluginIdFromResult(result);
    if (!pluginId) {
      console.warn(`Could not get passes for plugin ${pluginId}`);
      return;
    }
    if (result.error && result.failureReason === ResultFailureReason.ERROR) {
      return;
    }
    if (!result.success || !result.gradingResult?.pass) {
      return;
    }

    passes[pluginId] = passes[pluginId] || [];
    passes[pluginId].push({
      prompt: result.vars.query?.toString() || result.vars.prompt?.toString() || result.prompt.raw,
      output: result.response?.output,
      gradingResult: result.gradingResult || undefined,
      result,
    });
  });

  return passes;
}

function buildCategoryStats(evalData: ResultsFile, selectedPromptIndex: number) {
  const prompts = getReportPrompts(evalData);

  return evalData.results.results.reduce<Record<string, Required<TestResultStats>>>((acc, row) => {
    if (
      !shouldIncludePromptResult({
        prompts,
        selectedPromptIndex,
        promptIdx: row.promptIdx,
      })
    ) {
      return acc;
    }

    const pluginId = getPluginIdFromResult(row);
    if (!pluginId || (row.error && row.failureReason === ResultFailureReason.ERROR)) {
      return acc;
    }

    acc[pluginId] = acc[pluginId] || { pass: 0, total: 0, passWithFilter: 0, failCount: 0 };
    acc[pluginId].total += 1;

    const moderationPassed = row.gradingResult?.componentResults?.some(
      (result) => result.assertion?.type === 'moderation' && !result.pass,
    );

    if (row.success) {
      acc[pluginId].pass += 1;
      acc[pluginId].passWithFilter += 1;
    } else if (moderationPassed) {
      acc[pluginId].passWithFilter += 1;
    }

    if (row.failureReason === ResultFailureReason.ASSERT) {
      acc[pluginId].failCount += 1;
    }

    return acc;
  }, {});
}

function buildStrategyStats(
  failuresByPlugin: PluginResultMap,
  passesByPlugin: PluginResultMap,
): CategoryStats {
  const stats: CategoryStats = {};

  Object.values(failuresByPlugin).forEach((tests) => {
    tests.forEach((test) => {
      const strategyId = getStrategyIdFromTest(test);
      stats[strategyId] = stats[strategyId] || { pass: 0, total: 0, failCount: 0 };
      stats[strategyId].total += 1;
      stats[strategyId].failCount += 1;
    });
  });

  Object.values(passesByPlugin).forEach((tests) => {
    tests.forEach((test) => {
      const strategyId = getStrategyIdFromTest(test);
      stats[strategyId] = stats[strategyId] || { pass: 0, total: 0, failCount: 0 };
      stats[strategyId].total += 1;
      stats[strategyId].pass += 1;
    });
  });

  return stats;
}

function testMatchesFilters({
  test,
  selectedStrategies,
  searchQuery,
}: {
  test: PluginResultEntry;
  selectedStrategies: string[];
  searchQuery: string;
}) {
  if (searchQuery) {
    const searchLower = searchQuery.toLowerCase();
    const promptMatches = test.prompt?.toLowerCase().includes(searchLower);
    const outputMatches = test.output?.toLowerCase().includes(searchLower);
    if (!promptMatches && !outputMatches) {
      return false;
    }
  }

  if (selectedStrategies.length > 0) {
    const strategyId = test.result?.testCase?.metadata?.strategyId || getStrategyIdFromTest(test);
    if (!selectedStrategies.includes(strategyId)) {
      return false;
    }
  }

  return true;
}

function filterResultsByPlugin({
  resultsByPlugin,
  selectedCategories,
  selectedStrategies,
  statusFilter,
  searchQuery,
  skipStatus,
}: {
  resultsByPlugin: PluginResultMap;
  selectedCategories: string[];
  selectedStrategies: string[];
  statusFilter: FilterStatus;
  searchQuery: string;
  skipStatus: Exclude<FilterStatus, 'all'>;
}) {
  if (statusFilter === skipStatus) {
    return {} as PluginResultMap;
  }

  const filtered: PluginResultMap = {};
  Object.entries(resultsByPlugin).forEach(([pluginId, tests]) => {
    if (selectedCategories.length > 0 && !selectedCategories.includes(pluginId)) {
      return;
    }

    const filteredTests = tests.filter((test) =>
      testMatchesFilters({
        test,
        selectedStrategies,
        searchQuery,
      }),
    );

    if (filteredTests.length > 0) {
      filtered[pluginId] = filteredTests;
    }
  });

  return filtered;
}

function buildFilteredCategoryStats(
  filteredFailuresByPlugin: PluginResultMap,
  filteredPassesByPlugin: PluginResultMap,
) {
  const stats: Record<string, Required<TestResultStats>> = {};

  Object.entries(filteredFailuresByPlugin).forEach(([pluginId, tests]) => {
    stats[pluginId] = stats[pluginId] || { pass: 0, total: 0, passWithFilter: 0, failCount: 0 };
    stats[pluginId].total += tests.length;
    stats[pluginId].failCount += tests.length;
  });

  Object.entries(filteredPassesByPlugin).forEach(([pluginId, tests]) => {
    stats[pluginId] = stats[pluginId] || { pass: 0, total: 0, passWithFilter: 0, failCount: 0 };
    stats[pluginId].pass += tests.length;
    stats[pluginId].passWithFilter += tests.length;
    stats[pluginId].total += tests.length;
  });

  return stats;
}

function buildFilteredStrategyStats(
  filteredFailuresByPlugin: PluginResultMap,
  filteredPassesByPlugin: PluginResultMap,
) {
  const stats: CategoryStats = {};

  Object.values(filteredFailuresByPlugin).forEach((tests) => {
    tests.forEach((test) => {
      const strategyId = test.result?.testCase?.metadata?.strategyId || getStrategyIdFromTest(test);
      stats[strategyId] = stats[strategyId] || { pass: 0, total: 0, failCount: 0 };
      stats[strategyId].failCount += 1;
      stats[strategyId].total += 1;
    });
  });

  Object.values(filteredPassesByPlugin).forEach((tests) => {
    tests.forEach((test) => {
      const strategyId = test.result?.testCase?.metadata?.strategyId || getStrategyIdFromTest(test);
      stats[strategyId] = stats[strategyId] || { pass: 0, total: 0, failCount: 0 };
      stats[strategyId].total += 1;
      stats[strategyId].pass += 1;
    });
  });

  return stats;
}

function getCustomPolicyIds(evalData: ResultsFile | null) {
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
}

function getFrameworkCategoryStats({
  hasActiveFilters,
  filteredCategoryStats,
  categoryStats,
  customPolicyIds,
}: {
  hasActiveFilters: boolean;
  filteredCategoryStats: Record<string, Required<TestResultStats>>;
  categoryStats: Record<string, Required<TestResultStats>>;
  customPolicyIds: Set<unknown>;
}) {
  const stats = { ...(hasActiveFilters ? filteredCategoryStats : categoryStats) };
  Object.keys(stats).forEach((pluginId) => {
    if (customPolicyIds.has(pluginId)) {
      delete stats[pluginId];
    }
  });
  return stats;
}

function getTools(evalData: ResultsFile) {
  if (!Array.isArray(evalData.config.providers) || !isProviderOptions(evalData.config.providers[0])) {
    return [];
  }
  const providerTools = evalData.config.providers[0].config?.tools;
  return providerTools ? (Array.isArray(providerTools) ? providerTools : [providerTools]) : [];
}

function useReportEvalData(evalIdProp: string | undefined, recordEvent: ReturnType<typeof useTelemetry>['recordEvent']) {
  const [evalId, setEvalId] = useState<string | null>(evalIdProp ?? null);
  const [evalData, setEvalData] = useState<ResultsFile | null>(null);
  const searchParams = new URLSearchParams(window.location.search);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    const fetchEvalById = async (id: string) => {
      const resp = await callApi(`/results/${id}`, { cache: 'no-store' });
      const body = (await resp.json()) as SharedResults;
      setEvalData(body.data);
      recordEvent('funnel', {
        type: 'redteam',
        step: 'webui_report_viewed',
        source: 'webui',
        evalId: id,
      });
    };

    const fetchLatestEvalId = async () => {
      try {
        const resp = await callApi('/results', { cache: 'no-store' });
        if (!resp.ok) {
          console.error('Failed to fetch recent evals');
          return;
        }
        const body = (await resp.json()) as { data: ResultLightweightWithLabel[] };
        const latestEvalId = body.data?.[0]?.evalId;
        if (!latestEvalId) {
          console.log('No recent evals found');
          return;
        }
        setEvalId(latestEvalId);
        fetchEvalById(latestEvalId);
      } catch (error) {
        console.error('Error fetching latest eval:', error);
      }
    };

    const requestedEvalId = evalIdProp ?? searchParams.get('evalId');
    if (requestedEvalId) {
      setEvalId(requestedEvalId);
      fetchEvalById(requestedEvalId);
      return;
    }

    fetchLatestEvalId();
  }, [evalIdProp, recordEvent]);

  return {
    evalId,
    evalData,
    searchParams,
  };
}

function ReportLoadingState() {
  return (
    <div className="flex h-36 flex-col items-center justify-center gap-3">
      <Spinner className="size-5" />
      <span>Waiting for report data</span>
    </div>
  );
}

function ReportUnavailableState({ hasSelectedEval }: { hasSelectedEval: boolean }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center p-6">
      <Card className="max-w-xl p-8 text-center">
        <AlertTriangle className="mx-auto mb-4 size-16 text-amber-500" />
        <h1 className="mb-6 text-2xl font-bold">Report unavailable</h1>
        <p className="text-muted-foreground">
          The {hasSelectedEval ? 'selected' : 'latest'} evaluation results are not displayable in
          report format.
        </p>
        <p className="text-muted-foreground">Please run a red team and try again.</p>
      </Card>
    </div>
  );
}

function ReportActionButtons({
  evalId,
  evalData,
  navigate,
  hasActiveFilters,
  isFiltersVisible,
  onToggleFilters,
}: {
  evalId: string;
  evalData: ResultsFile;
  navigate: ReturnType<typeof useNavigate>;
  hasActiveFilters: boolean;
  isFiltersVisible: boolean;
  onToggleFilters: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
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
                return;
              }
              navigate(url);
            }}
          >
            <ListOrdered className="size-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>View all logs</TooltipContent>
      </Tooltip>
      <ReportDownloadButton evalDescription={evalData.config.description || evalId} evalData={evalData} />
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
            onClick={onToggleFilters}
            className={hasActiveFilters ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}
          >
            <Filter className="size-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{isFiltersVisible ? 'Hide filters' : 'Filter results'}</TooltipContent>
      </Tooltip>
      <ReportSettingsDialogButton />
    </div>
  );
}

function useEmbeddedReportActions({
  embedded,
  onActionsReady,
  evalData,
  evalId,
  isFiltersVisible,
  onToggleFilters,
  onOpenSettings,
}: {
  embedded?: boolean;
  onActionsReady?: (actions: React.ReactNode) => void;
  evalData: ResultsFile | null;
  evalId: string | null;
  isFiltersVisible: boolean;
  onToggleFilters: () => void;
  onOpenSettings: () => void;
}) {
  useEffect(() => {
    if (!embedded || !onActionsReady || !evalData || !evalId) {
      return;
    }
    onActionsReady(
      <>
        <DropdownMenuItem onClick={onToggleFilters}>
          <Filter className="size-4 mr-2" />
          {isFiltersVisible ? 'Hide filters' : 'Show filters'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => window.print()}>
          <Printer className="size-4 mr-2" />
          Print / Save as PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onOpenSettings}>
          <Settings className="size-4 mr-2" />
          Report settings
        </DropdownMenuItem>
      </>,
    );
  }, [
    embedded,
    onActionsReady,
    evalData,
    evalId,
    isFiltersVisible,
    onToggleFilters,
    onOpenSettings,
  ]);
}

function PersistentReportHeader({
  isScrolled,
  title,
  actionButtons,
}: {
  isScrolled: boolean;
  title: string;
  actionButtons: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'fixed inset-x-0 top-0 z-50 border-b border-border bg-card transition-transform duration-150 print:hidden',
        isScrolled ? 'translate-y-0 shadow-md' : '-translate-y-full',
      )}
    >
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex min-h-16 items-center justify-between py-2">
          <h1 className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap pr-4 font-bold">
            {title}
          </h1>
          <div className="shrink-0">{actionButtons}</div>
        </div>
      </div>
    </div>
  );
}

function ReportHeaderCard({
  evalData,
  prompts,
  selectedPrompt,
  selectedPromptIndex,
  tableData,
  tools,
  actionButtons,
  onPromptChange,
  onOpenToolsDialog,
}: {
  evalData: ResultsFile;
  prompts: ReturnType<typeof getReportPrompts>;
  selectedPrompt: ReturnType<typeof getReportPrompts>[number];
  selectedPromptIndex: number;
  tableData: ReturnType<typeof getReportTableData>;
  tools: ReturnType<typeof getTools>;
  actionButtons: React.ReactNode;
  onPromptChange: (index: number) => void;
  onOpenToolsDialog: () => void;
}) {
  const depth = selectedPrompt?.metrics?.tokenUsage?.numRequests || tableData.length;
  const totalTokens = selectedPrompt?.metrics?.tokenUsage?.total;
  const promptLabel =
    selectedPrompt && selectedPrompt.raw !== '{{prompt}}'
      ? selectedPrompt.raw.length > 40
        ? `${selectedPrompt.raw.substring(0, 40)}...`
        : selectedPrompt.raw
      : null;

  return (
    <Card
      data-testid="report-header-card"
      className="relative rounded-xl p-6 shadow-md sm:pr-48 dark:shadow-none print:pr-4"
    >
      <div
        data-testid="report-header-actions"
        className="mb-4 flex justify-end print:hidden sm:absolute sm:right-4 sm:top-4 sm:mb-0"
      >
        {actionButtons}
      </div>
      <h1 className="text-2xl font-bold">{evalData.config.description || 'Risk Assessment'}</h1>
      <p className="mb-4 text-muted-foreground">{formatDataGridDate(evalData.createdAt)}</p>
      <div className="flex flex-wrap gap-3">
        {selectedPrompt && prompts.length > 1 ? (
          <Select value={String(selectedPromptIndex)} onValueChange={(value) => onPromptChange(Number(value))}>
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
                <strong>Depth:</strong> {depth.toLocaleString()} probes
              </Badge>
            </span>
          </TooltipTrigger>
          <TooltipContent>{totalTokens ? `${totalTokens.toLocaleString()} tokens` : ''}</TooltipContent>
        </Tooltip>
        {promptLabel && (
          <Badge variant="secondary">
            <strong>Prompt:</strong> &quot;{promptLabel}&quot;
          </Badge>
        )}
        {tools.length > 0 && (
          <Badge variant="secondary" className="cursor-pointer" onClick={onOpenToolsDialog}>
            <strong>Tools:</strong> {tools.length} available
          </Badge>
        )}
      </div>
    </Card>
  );
}

function ReportFiltersCard({
  hasActiveFilters,
  searchQuery,
  statusFilter,
  selectedCategories,
  selectedStrategies,
  availableCategories,
  availableStrategies,
  onClearAll,
  onSearchQueryChange,
  onStatusFilterChange,
  onSelectedCategoriesChange,
  onSelectedStrategiesChange,
}: {
  hasActiveFilters: boolean;
  searchQuery: string;
  statusFilter: FilterStatus;
  selectedCategories: string[];
  selectedStrategies: string[];
  availableCategories: string[];
  availableStrategies: string[];
  onClearAll: () => void;
  onSearchQueryChange: (value: string) => void;
  onStatusFilterChange: (value: FilterStatus) => void;
  onSelectedCategoriesChange: (value: string[]) => void;
  onSelectedStrategiesChange: (value: string[]) => void;
}) {
  return (
    <Card className="print:hidden">
      <CardContent className="p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Filters</h2>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={onClearAll}>
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
              onChange={(event) => onSearchQueryChange(event.target.value)}
            />
          </div>

          <div className="min-w-[120px]">
            <Select value={statusFilter} onValueChange={(value) => onStatusFilterChange(value as FilterStatus)}>
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
              onValueChange={(value) => onSelectedCategoriesChange(value === 'all' ? [] : [value])}
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
              onValueChange={(value) => onSelectedStrategiesChange(value === 'all' ? [] : [value])}
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
  );
}

function EmbeddedReportSettingsDialog({
  open,
  pluginPassRateThreshold,
  onOpenChange,
  onThresholdChange,
}: {
  open: boolean;
  pluginPassRateThreshold: number;
  onOpenChange: (open: boolean) => void;
  onThresholdChange: (value: number) => void;
}) {
  const normalizedThreshold = Number.isNaN(pluginPassRateThreshold)
    ? 0
    : Math.min(1, Math.max(0, pluginPassRateThreshold || 0));
  const thresholdLabel = Number.isNaN(pluginPassRateThreshold)
    ? 'NaN'
    : `${(normalizedThreshold * 100).toFixed(0)}%`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="plugin-pass-rate-embedded">Plugin Pass Rate Threshold</Label>
              <span className="text-sm font-medium text-muted-foreground">{thresholdLabel}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Sets the threshold for considering a plugin as passed on the risk cards.
            </p>
            <input
              id="plugin-pass-rate-embedded"
              type="range"
              value={normalizedThreshold}
              onChange={(event) => onThresholdChange(Number.parseFloat(event.target.value))}
              min={0}
              max={1}
              step={0.05}
              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-muted accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const App = ({ evalId: evalIdProp, embedded, onActionsReady }: ReportProps = {}) => {
  const navigate = useNavigate();
  const [selectedPromptIndex, setSelectedPromptIndex] = useState(0);
  const [isToolsDialogOpen, setIsToolsDialogOpen] = useState(false);
  const { recordEvent } = useTelemetry();

  const [isFiltersVisible, setIsFiltersVisible] = useState(false);
  const [reportSettingsOpen, setReportSettingsOpen] = useState(false);
  const { pluginPassRateThreshold, setPluginPassRateThreshold } = useReportStore();
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pass' | 'fail'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  // Scroll tracking for persistent header
  const [isScrolled, setIsScrolled] = useState(false);

  // Vulnerabilities table reference for scroll navigation
  const vulnerabilitiesDataGridRef = useRef<HTMLDivElement>(null);

  const { evalId, evalData, searchParams } = useReportEvalData(evalIdProp, recordEvent);

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

  const failuresByPlugin = useMemo(
    () => (evalData ? buildFailuresByPlugin(evalData, selectedPromptIndex) : {}),
    [evalData, selectedPromptIndex],
  );

  const passesByPlugin = useMemo(
    () => (evalData ? buildPassesByPlugin(evalData, selectedPromptIndex) : {}),
    [evalData, selectedPromptIndex],
  );

  const categoryStats = useMemo(
    () => (evalData ? buildCategoryStats(evalData, selectedPromptIndex) : {}),
    [evalData, selectedPromptIndex],
  );

  const strategyStats = useMemo(
    () => buildStrategyStats(failuresByPlugin, passesByPlugin),
    [failuresByPlugin, passesByPlugin],
  );

  const availableCategories = useMemo(() => {
    return Object.keys(categoryStats).sort();
  }, [categoryStats]);

  const availableStrategies = useMemo(() => {
    return Object.keys(strategyStats).sort();
  }, [strategyStats]);

  const filteredFailuresByPlugin = useMemo(
    () =>
      filterResultsByPlugin({
        resultsByPlugin: failuresByPlugin,
        selectedCategories,
        selectedStrategies,
        statusFilter,
        searchQuery,
        skipStatus: 'pass',
      }),
    [failuresByPlugin, selectedCategories, selectedStrategies, statusFilter, searchQuery],
  );

  const filteredPassesByPlugin = useMemo(
    () =>
      filterResultsByPlugin({
        resultsByPlugin: passesByPlugin,
        selectedCategories,
        selectedStrategies,
        statusFilter,
        searchQuery,
        skipStatus: 'fail',
      }),
    [passesByPlugin, selectedCategories, selectedStrategies, statusFilter, searchQuery],
  );

  /**
   * Recalculates category (plugin) stats given the filtered failures and passes.
   */
  const filteredCategoryStats = useMemo(
    () => buildFilteredCategoryStats(filteredFailuresByPlugin, filteredPassesByPlugin),
    [filteredFailuresByPlugin, filteredPassesByPlugin],
  );

  const filteredStrategyStats = useMemo(
    () => buildFilteredStrategyStats(filteredFailuresByPlugin, filteredPassesByPlugin),
    [filteredFailuresByPlugin, filteredPassesByPlugin],
  );

  const hasActiveFilters =
    selectedCategories.length > 0 ||
    selectedStrategies.length > 0 ||
    statusFilter !== 'all' ||
    Boolean(searchQuery);

  /**
   * Extracts custom policy IDs from the results in order to then
   * filter policies from the categories stats for the framework compliance section.
   */
  const customPolicyIds = useMemo(() => getCustomPolicyIds(evalData), [evalData]);

  /**
   * Constructs category stats for the framework compliance section.
   *
   * - Determines whether to use filtered or unfiltered category stats based on the presence of active filters.
   * - Removes custom policies; they do not belong to any framework.
   */
  const categoryStatsForFrameworkCompliance = useMemo(
    () =>
      getFrameworkCategoryStats({
        hasActiveFilters,
        filteredCategoryStats,
        categoryStats,
        customPolicyIds,
      }),
    [hasActiveFilters, filteredCategoryStats, categoryStats, customPolicyIds],
  );

  const actionButtons = useMemo(
    () => (
      evalId &&
      evalData && (
        <ReportActionButtons
          evalId={evalId}
          evalData={evalData}
          navigate={navigate}
          hasActiveFilters={hasActiveFilters}
          isFiltersVisible={isFiltersVisible}
          onToggleFilters={() => setIsFiltersVisible((visible) => !visible)}
        />
      )
    ),
    [evalData, evalId, navigate, hasActiveFilters, isFiltersVisible],
  );

  useEmbeddedReportActions({
    embedded,
    onActionsReady,
    evalData,
    evalId,
    isFiltersVisible,
    onToggleFilters: () => setIsFiltersVisible((visible) => !visible),
    onOpenSettings: () => setReportSettingsOpen(true),
  });

  usePageMeta({
    title: `Report: ${evalData?.config.description || evalId || 'Red Team'}`,
    description: 'Red team evaluation report',
  });

  if (!evalData || !evalId) {
    return <ReportLoadingState />;
  }

  if (!evalData.config.redteam) {
    return <ReportUnavailableState hasSelectedEval={Boolean(searchParams.get('evalId'))} />;
  }

  const prompts = getReportPrompts(evalData);
  const selectedPrompt = prompts[selectedPromptIndex];
  const tableData = getReportTableData(evalData);
  const tools = getTools(evalData);

  const clearAllFilters = () => {
    setSelectedCategories([]);
    setSelectedStrategies([]);
    setStatusFilter('all');
    setSearchQuery('');
  };

  return (
    <>
      {!embedded && (
        <PersistentReportHeader
          isScrolled={isScrolled}
          title={evalData.config.description || 'Risk Assessment'}
          actionButtons={actionButtons}
        />
      )}

      <div className="mx-auto w-full min-w-0 max-w-7xl px-4 pb-8 pt-4 print:max-w-none print:px-0 print:pt-0 print:pb-0">
        <div className="flex flex-col gap-6">
          {!embedded && <EnterpriseBanner evalId={evalId} />}

          {!embedded && (
            <ReportHeaderCard
              evalData={evalData}
              prompts={prompts}
              selectedPrompt={selectedPrompt}
              selectedPromptIndex={selectedPromptIndex}
              tableData={tableData}
              tools={tools}
              actionButtons={actionButtons}
              onPromptChange={setSelectedPromptIndex}
              onOpenToolsDialog={() => setIsToolsDialogOpen(true)}
            />
          )}

          {isFiltersVisible && (
            <ReportFiltersCard
              hasActiveFilters={hasActiveFilters}
              searchQuery={searchQuery}
              statusFilter={statusFilter}
              selectedCategories={selectedCategories}
              selectedStrategies={selectedStrategies}
              availableCategories={availableCategories}
              availableStrategies={availableStrategies}
              onClearAll={clearAllFilters}
              onSearchQueryChange={setSearchQuery}
              onStatusFilterChange={setStatusFilter}
              onSelectedCategoriesChange={setSelectedCategories}
              onSelectedStrategiesChange={setSelectedStrategies}
            />
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
      {embedded && (
        <EmbeddedReportSettingsDialog
          open={reportSettingsOpen}
          pluginPassRateThreshold={pluginPassRateThreshold}
          onOpenChange={(isOpen) => setReportSettingsOpen(isOpen)}
          onThresholdChange={setPluginPassRateThreshold}
        />
      )}
    </>
  );
};

export default App;
