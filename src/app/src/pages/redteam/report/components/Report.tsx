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
import ToolsDialog, { Tool } from './ToolsDialog';

interface ReportProps {
  /** When provided, uses this evalId instead of reading from URL search params. */
  evalId?: string;
  /** When true, skips rendering the report's own header (persistent scroll header, header card, enterprise banner). Used when embedded inside EvalHeader. */
  embedded?: boolean;
  /** Called with dropdown menu items for the eval actions dropdown when embedded. */
  onActionsReady?: (actions: React.ReactNode) => void;
}

interface ReportActionButtonsProps {
  evalId: string | null;
  evalData: ResultsFile | null;
  hasActiveFilters: boolean;
  onToggleFilters: () => void;
  onNavigate: (url: string) => void;
}

function ReportActionButtons({
  evalId,
  evalData,
  hasActiveFilters,
  onToggleFilters,
  onNavigate,
}: ReportActionButtonsProps) {
  return (
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
                } else {
                  onNavigate(url);
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
            onClick={onToggleFilters}
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
  );
}

interface ReportFiltersCardProps {
  hasActiveFilters: boolean;
  searchQuery: string;
  statusFilter: 'all' | 'pass' | 'fail';
  selectedCategories: string[];
  selectedStrategies: string[];
  availableCategories: string[];
  availableStrategies: string[];
  onSearchChange: (q: string) => void;
  onStatusFilterChange: (v: 'all' | 'pass' | 'fail') => void;
  onCategoriesChange: (v: string[]) => void;
  onStrategiesChange: (v: string[]) => void;
  onClearAll: () => void;
}

function ReportFiltersCard({
  hasActiveFilters,
  searchQuery,
  statusFilter,
  selectedCategories,
  selectedStrategies,
  availableCategories,
  availableStrategies,
  onSearchChange,
  onStatusFilterChange,
  onCategoriesChange,
  onStrategiesChange,
  onClearAll,
}: ReportFiltersCardProps) {
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
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          <div className="min-w-[120px]">
            <Select
              value={statusFilter}
              onValueChange={(value) => onStatusFilterChange(value as 'all' | 'pass' | 'fail')}
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
              onValueChange={(value) => onCategoriesChange(value === 'all' ? [] : [value])}
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
              onValueChange={(value) => onStrategiesChange(value === 'all' ? [] : [value])}
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

type PluginTestResult = {
  prompt: string;
  output: string;
  gradingResult?: GradingResult;
  result?: EvaluateResult;
};

async function fetchEvalDataById(id: string): Promise<ResultsFile> {
  const resp = await callApi(`/results/${id}`, { cache: 'no-store' });
  const body = (await resp.json()) as SharedResults;
  return body.data;
}

async function fetchLatestEvalId(): Promise<string | null> {
  try {
    const resp = await callApi('/results', { cache: 'no-store' });
    if (!resp.ok) {
      console.error('Failed to fetch recent evals');
      return null;
    }
    const body = (await resp.json()) as { data: ResultLightweightWithLabel[] };
    if (body.data && body.data.length > 0) {
      return body.data[0].evalId;
    }
    console.log('No recent evals found');
    return null;
  } catch (error) {
    console.error('Error fetching latest eval:', error);
    return null;
  }
}

function getPromptsFromEvalData(evalData: ResultsFile) {
  return (
    (evalData.version >= 4
      ? evalData.prompts
      : (evalData.results as EvaluateSummaryV2).table.head.prompts) || []
  );
}

function isResultErrored(result: EvaluateResult): boolean {
  return !!(result.error && result.failureReason === ResultFailureReason.ERROR);
}

function buildPluginResultMap(
  evalData: ResultsFile,
  selectedPromptIndex: number,
  includeResult: (result: EvaluateResult) => boolean,
  getTestEntry: (result: EvaluateResult, injectVar: string) => PluginTestResult,
): Record<string, PluginTestResult[]> {
  const prompts = getPromptsFromEvalData(evalData);
  const selectedPrompt = prompts[selectedPromptIndex];
  const injectVar = evalData.config.redteam?.injectVar ?? 'prompt';

  const map: Record<string, PluginTestResult[]> = {};
  evalData.results.results.forEach((result) => {
    if (prompts.length > 1 && selectedPrompt && result.promptIdx !== selectedPromptIndex) {
      return;
    }
    const pluginId = getPluginIdFromResult(result);
    if (!pluginId) {
      return;
    }
    if (isResultErrored(result)) {
      return;
    }
    if (includeResult(result)) {
      if (!map[pluginId]) {
        map[pluginId] = [];
      }
      map[pluginId].push(getTestEntry(result, injectVar));
    }
  });
  return map;
}

function matchesSearchQuery(test: PluginTestResult, searchQuery: string): boolean {
  if (!searchQuery) {
    return true;
  }
  const searchLower = searchQuery.toLowerCase();
  return !!(
    test.prompt?.toLowerCase().includes(searchLower) ||
    test.output?.toLowerCase().includes(searchLower)
  );
}

function matchesStrategyFilter(test: PluginTestResult, selectedStrategies: string[]): boolean {
  if (selectedStrategies.length === 0) {
    return true;
  }
  const strategyId = test?.result?.testCase?.metadata?.strategyId || getStrategyIdFromTest(test);
  return selectedStrategies.includes(strategyId);
}

function filterPluginResults(
  pluginMap: Record<string, PluginTestResult[]>,
  selectedCategories: string[],
  statusFilter: 'all' | 'pass' | 'fail',
  excludeStatus: 'pass' | 'fail' | null,
  searchQuery: string,
  selectedStrategies: string[],
): Record<string, PluginTestResult[]> {
  const filtered: Record<string, PluginTestResult[]> = {};
  Object.entries(pluginMap).forEach(([pluginId, tests]) => {
    if (selectedCategories.length > 0 && !selectedCategories.includes(pluginId)) {
      return;
    }
    if (excludeStatus && statusFilter === excludeStatus) {
      return;
    }
    const filteredTests = tests.filter(
      (test) =>
        matchesSearchQuery(test, searchQuery) && matchesStrategyFilter(test, selectedStrategies),
    );
    if (filteredTests.length > 0) {
      filtered[pluginId] = filteredTests;
    }
  });
  return filtered;
}

function computeCategoryStats(
  evalData: ResultsFile,
  selectedPromptIndex: number,
): Record<string, Required<TestResultStats>> {
  const prompts = getPromptsFromEvalData(evalData);
  const selectedPrompt = prompts[selectedPromptIndex];

  return evalData.results.results.reduce(
    (acc, row) => {
      if (prompts.length > 1 && selectedPrompt && row.promptIdx !== selectedPromptIndex) {
        return acc;
      }
      const pluginId = getPluginIdFromResult(row);
      if (!pluginId) {
        return acc;
      }
      if (isResultErrored(row)) {
        return acc;
      }

      acc[pluginId] = acc[pluginId] || { pass: 0, total: 0, passWithFilter: 0, failCount: 0 };
      acc[pluginId].total++;

      // Check if moderation tests failed but other tests passed
      const moderationPassed = row.gradingResult?.componentResults?.some(
        (result) => result.assertion?.type === 'moderation' && !result.pass,
      );

      if (row.success) {
        acc[pluginId].pass++;
        acc[pluginId].passWithFilter++;
      } else if (moderationPassed) {
        acc[pluginId].passWithFilter++;
      }

      if (row.failureReason === ResultFailureReason.ASSERT) {
        acc[pluginId].failCount++;
      }

      return acc;
    },
    {} as Record<string, Required<TestResultStats>>,
  );
}

function getFailureTestEntry(result: EvaluateResult, injectVar: string): PluginTestResult {
  // Backwards compatibility for old evals that used 'query' instead of 'prompt'. 2024-12-12
  const injectVarValue = result.vars[injectVar]?.toString() || result.vars['query']?.toString();
  return {
    prompt: injectVarValue || result.prompt.raw,
    output: result.response?.output,
    gradingResult: result.gradingResult || undefined,
    result,
  };
}

function getPassTestEntry(result: EvaluateResult): PluginTestResult {
  return {
    prompt: result.vars.query?.toString() || result.vars.prompt?.toString() || result.prompt.raw,
    output: result.response?.output,
    gradingResult: result.gradingResult || undefined,
    result,
  };
}

function isFailureResult(result: EvaluateResult): boolean {
  return !result.success || !result.gradingResult?.pass;
}

function isPassResult(result: EvaluateResult): boolean {
  return !!(result.success && result.gradingResult?.pass);
}

function extractCustomPolicyIds(evalData: ResultsFile): Set<unknown> {
  const ids = new Set();
  evalData.results.results.forEach((row) => {
    if (row.metadata?.pluginId === 'policy') {
      ids.add(getPluginIdFromResult(row));
    }
  });
  return ids;
}

function extractProviderTools(evalData: ResultsFile): Tool[] {
  if (Array.isArray(evalData.config.providers) && isProviderOptions(evalData.config.providers[0])) {
    const providerTools = evalData.config.providers[0].config?.tools;
    if (providerTools) {
      return Array.isArray(providerTools) ? providerTools : [providerTools];
    }
  }
  return [];
}

interface ReportHeaderCardProps {
  evalData: ResultsFile;
  prompts: ResultsFile['prompts'];
  selectedPromptIndex: number;
  tableData: unknown[];
  tools: Tool[];
  actionButtons: React.ReactNode;
  onPromptIndexChange: (idx: number) => void;
  onToolsDialogOpen: () => void;
}

function ReportHeaderCard({
  evalData,
  prompts,
  selectedPromptIndex,
  tableData,
  tools,
  actionButtons,
  onPromptIndexChange,
  onToolsDialogOpen,
}: ReportHeaderCardProps) {
  const selectedPrompt = prompts?.[selectedPromptIndex];
  return (
    <Card className="relative rounded-xl p-6 pr-48 shadow-md dark:shadow-none print:pr-4">
      <div className="absolute right-4 top-4 flex print:hidden">{actionButtons}</div>
      <h1 className="text-2xl font-bold">{evalData.config.description || 'Risk Assessment'}</h1>
      <p className="mb-4 text-muted-foreground">{formatDataGridDate(evalData.createdAt)}</p>
      <div className="flex flex-wrap gap-3">
        {selectedPrompt && prompts && prompts.length > 1 ? (
          <Select
            value={String(selectedPromptIndex)}
            onValueChange={(value) => onPromptIndexChange(Number(value))}
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
          <Badge variant="secondary" className="cursor-pointer" onClick={onToolsDialogOpen}>
            <strong>Tools:</strong> {tools.length} available
          </Badge>
        )}
      </div>
    </Card>
  );
}

interface ReportSettingsEmbeddedDialogProps {
  open: boolean;
  onClose: () => void;
  pluginPassRateThreshold: number;
  onThresholdChange: (value: number) => void;
}

function ReportSettingsEmbeddedDialog({
  open,
  onClose,
  pluginPassRateThreshold,
  onThresholdChange,
}: ReportSettingsEmbeddedDialogProps) {
  const clampedValue = Number.isNaN(pluginPassRateThreshold)
    ? 0
    : Math.min(1, Math.max(0, pluginPassRateThreshold || 0));
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="plugin-pass-rate-embedded">Plugin Pass Rate Threshold</Label>
              <span className="text-sm font-medium text-muted-foreground">
                {Number.isNaN(pluginPassRateThreshold)
                  ? 'NaN'
                  : `${(clampedValue * 100).toFixed(0)}%`}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Sets the threshold for considering a plugin as passed on the risk cards.
            </p>
            <input
              id="plugin-pass-rate-embedded"
              type="range"
              value={clampedValue}
              onChange={(e) => onThresholdChange(Number.parseFloat(e.target.value))}
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
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function computeStrategyStats(
  failuresByPlugin: Record<string, PluginTestResult[]>,
  passesByPlugin: Record<string, PluginTestResult[]>,
): CategoryStats {
  const stats: CategoryStats = {};

  const addToStats = (tests: PluginTestResult[], isFailure: boolean) => {
    tests.forEach((test) => {
      const strategyId =
        test?.result?.testCase?.metadata?.strategyId || getStrategyIdFromTest(test);
      if (!stats[strategyId]) {
        stats[strategyId] = { pass: 0, total: 0, failCount: 0 };
      }
      stats[strategyId].total += 1;
      if (isFailure) {
        stats[strategyId].failCount += 1;
      } else {
        stats[strategyId].pass += 1;
      }
    });
  };

  Object.values(failuresByPlugin).forEach((tests) => addToStats(tests, true));
  Object.values(passesByPlugin).forEach((tests) => addToStats(tests, false));

  return stats;
}

function computeFilteredCategoryStats(
  filteredFailuresByPlugin: Record<string, PluginTestResult[]>,
  filteredPassesByPlugin: Record<string, PluginTestResult[]>,
): Record<string, Required<TestResultStats>> {
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

const App = ({ evalId: evalIdProp, embedded, onActionsReady }: ReportProps = {}) => {
  const navigate = useNavigate();
  const [evalId, setEvalId] = useState<string | null>(evalIdProp ?? null);
  const [evalData, setEvalData] = useState<ResultsFile | null>(null);
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

  const searchParams = new URLSearchParams(window.location.search);
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    const loadEvalById = async (id: string) => {
      const data = await fetchEvalDataById(id);
      setEvalData(data);
      recordEvent('funnel', {
        type: 'redteam',
        step: 'webui_report_viewed',
        source: 'webui',
        evalId: id,
      });
    };

    if (evalIdProp) {
      setEvalId(evalIdProp);
      loadEvalById(evalIdProp);
      return;
    }

    const urlEvalId = searchParams.get('evalId');
    if (urlEvalId) {
      setEvalId(urlEvalId);
      loadEvalById(urlEvalId);
      return;
    }

    fetchLatestEvalId().then((latestId) => {
      if (latestId) {
        setEvalId(latestId);
        loadEvalById(latestId);
      }
    });
  }, [evalIdProp, recordEvent]);

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
    () =>
      evalData
        ? // TODO: Errors which arise while grading may be mis-classified as ResultFailureReason.ASSERT
          // and leak past this check. Check `result.gradingResult.reason` for errors e.g. "API call error: *".
          buildPluginResultMap(evalData, selectedPromptIndex, isFailureResult, getFailureTestEntry)
        : {},
    [evalData, selectedPromptIndex],
  );

  const passesByPlugin = useMemo(
    () =>
      evalData
        ? buildPluginResultMap(evalData, selectedPromptIndex, isPassResult, getPassTestEntry)
        : {},
    [evalData, selectedPromptIndex],
  );

  const categoryStats = useMemo(
    () => (evalData ? computeCategoryStats(evalData, selectedPromptIndex) : {}),
    [evalData, selectedPromptIndex],
  );

  const strategyStats = useMemo(
    () => computeStrategyStats(failuresByPlugin, passesByPlugin),
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
      filterPluginResults(
        failuresByPlugin,
        selectedCategories,
        statusFilter,
        'pass',
        searchQuery,
        selectedStrategies,
      ),
    [failuresByPlugin, selectedCategories, selectedStrategies, statusFilter, searchQuery],
  );

  const filteredPassesByPlugin = useMemo(
    () =>
      filterPluginResults(
        passesByPlugin,
        selectedCategories,
        statusFilter,
        'fail',
        searchQuery,
        selectedStrategies,
      ),
    [passesByPlugin, selectedCategories, selectedStrategies, statusFilter, searchQuery],
  );

  /**
   * Recalculates category (plugin) stats given the filtered failures and passes.
   */
  const filteredCategoryStats = useMemo(
    () => computeFilteredCategoryStats(filteredFailuresByPlugin, filteredPassesByPlugin),
    [filteredFailuresByPlugin, filteredPassesByPlugin],
  );

  const filteredStrategyStats = useMemo(
    () => computeStrategyStats(filteredFailuresByPlugin, filteredPassesByPlugin),
    [filteredFailuresByPlugin, filteredPassesByPlugin],
  );

  const hasActiveFilters =
    selectedCategories.length > 0 ||
    selectedStrategies.length > 0 ||
    statusFilter !== 'all' ||
    Boolean(searchQuery);

  const activeCategoryStats = hasActiveFilters ? filteredCategoryStats : categoryStats;
  const activeStrategyStats = hasActiveFilters ? filteredStrategyStats : strategyStats;
  const activeFailuresByPlugin = hasActiveFilters ? filteredFailuresByPlugin : failuresByPlugin;
  const activePassesByPlugin = hasActiveFilters ? filteredPassesByPlugin : passesByPlugin;

  /**
   * Extracts custom policy IDs from the results in order to then
   * filter policies from the categories stats for the framework compliance section.
   */
  const customPolicyIds = useMemo(
    () => (evalData ? extractCustomPolicyIds(evalData) : new Set()),
    [evalData],
  );

  /**
   * Constructs category stats for the framework compliance section.
   *
   * - Determines whether to use filtered or unfiltered category stats based on the presence of active filters.
   * - Removes custom policies; they do not belong to any framework.
   */
  const categoryStatsForFrameworkCompliance = useMemo(() => {
    const base = hasActiveFilters ? filteredCategoryStats : categoryStats;
    return Object.fromEntries(
      Object.entries(base).filter(([pluginId]) => !customPolicyIds.has(pluginId)),
    );
  }, [hasActiveFilters, filteredCategoryStats, categoryStats, customPolicyIds]);

  const actionButtons = (
    <ReportActionButtons
      evalId={evalId}
      evalData={evalData}
      hasActiveFilters={hasActiveFilters}
      onToggleFilters={() => setIsFiltersVisible(!isFiltersVisible)}
      onNavigate={navigate}
    />
  );

  // Expose action menu items to parent when embedded
  useEffect(() => {
    if (!embedded || !onActionsReady || !evalData || !evalId) {
      return;
    }
    onActionsReady(
      <>
        <DropdownMenuItem onClick={() => setIsFiltersVisible((v) => !v)}>
          <Filter className="size-4 mr-2" />
          {isFiltersVisible ? 'Hide filters' : 'Show filters'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => window.print()}>
          <Printer className="size-4 mr-2" />
          Print / Save as PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setReportSettingsOpen(true)}>
          <Settings className="size-4 mr-2" />
          Report settings
        </DropdownMenuItem>
      </>,
    );
  }, [embedded, onActionsReady, evalData, evalId, isFiltersVisible]);

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

  const prompts = getPromptsFromEvalData(evalData);
  const tableData =
    evalData.version >= 4
      ? convertResultsToTable(evalData).body
      : ((evalData.results as EvaluateSummaryV2).table.body ?? []);

  const tools = extractProviderTools(evalData);

  const clearAllFilters = () => {
    setSelectedCategories([]);
    setSelectedStrategies([]);
    setStatusFilter('all');
    setSearchQuery('');
  };

  return (
    <>
      {!embedded && (
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
        </>
      )}

      <div className="mx-auto max-w-7xl px-4 pb-8 pt-4 print:max-w-none print:px-0 print:pt-0 print:pb-0">
        <div className="flex flex-col gap-6">
          {!embedded && evalData.config.redteam && <EnterpriseBanner evalId={evalId || ''} />}

          {!embedded && (
            <ReportHeaderCard
              evalData={evalData}
              prompts={prompts}
              selectedPromptIndex={selectedPromptIndex}
              tableData={tableData}
              tools={tools}
              actionButtons={actionButtons}
              onPromptIndexChange={setSelectedPromptIndex}
              onToolsDialogOpen={() => setIsToolsDialogOpen(true)}
            />
          )}

          {/* Filters Card */}
          {isFiltersVisible && (
            <ReportFiltersCard
              hasActiveFilters={hasActiveFilters}
              searchQuery={searchQuery}
              statusFilter={statusFilter}
              selectedCategories={selectedCategories}
              selectedStrategies={selectedStrategies}
              availableCategories={availableCategories}
              availableStrategies={availableStrategies}
              onSearchChange={setSearchQuery}
              onStatusFilterChange={setStatusFilter}
              onCategoriesChange={setSelectedCategories}
              onStrategiesChange={setSelectedStrategies}
              onClearAll={clearAllFilters}
            />
          )}

          <Overview
            categoryStats={activeCategoryStats}
            plugins={evalData.config.redteam.plugins || []}
            vulnerabilitiesDataGridRef={vulnerabilitiesDataGridRef}
          />
          <StrategyStats
            strategyStats={activeStrategyStats}
            failuresByPlugin={activeFailuresByPlugin}
            passesByPlugin={activePassesByPlugin}
            plugins={evalData.config.redteam.plugins || []}
          />
          <RiskCategories
            categoryStats={activeCategoryStats}
            evalId={evalId}
            failuresByPlugin={activeFailuresByPlugin}
            passesByPlugin={activePassesByPlugin}
          />
          <TestSuites
            evalId={evalId}
            categoryStats={activeCategoryStats}
            plugins={evalData.config.redteam.plugins || []}
            failuresByPlugin={activeFailuresByPlugin}
            passesByPlugin={activePassesByPlugin}
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
        <ReportSettingsEmbeddedDialog
          open={reportSettingsOpen}
          onClose={() => setReportSettingsOpen(false)}
          pluginPassRateThreshold={pluginPassRateThreshold}
          onThresholdChange={setPluginPassRateThreshold}
        />
      )}
    </>
  );
};

export default App;
