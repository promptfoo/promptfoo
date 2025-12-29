import React from 'react';

import { Alert, AlertDescription } from '@app/components/ui/alert';
import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@app/components/ui/dropdown-menu';
import { Input } from '@app/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { Spinner } from '@app/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { IS_RUNNING_LOCALLY } from '@app/constants';
import { EVAL_ROUTES, REDTEAM_ROUTES } from '@app/constants/routes';
import { useToast } from '@app/hooks/useToast';
import { useStore as useMainStore } from '@app/stores/evalConfig';
import { callApi, fetchUserEmail, updateEvalAuthor } from '@app/utils/api';
import { formatDuration } from '@app/utils/date';
import { displayNameOverrides } from '@promptfoo/redteam/constants/metadata';
import { formatPolicyIdentifierAsMetric } from '@promptfoo/redteam/plugins/policy/utils';
import invariant from '@promptfoo/util/invariant';
import {
  BarChart,
  ChevronDown,
  Clock,
  Copy,
  Edit,
  Eye,
  Play,
  Search,
  Settings,
  Share,
  Trash2,
  X,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDebounce } from 'use-debounce';
import { AuthorChip } from './AuthorChip';
import { ColumnSelector } from './ColumnSelector';
import CompareEvalMenuItem from './CompareEvalMenuItem';
import ConfigModal from './ConfigModal';
import { ConfirmEvalNameDialog } from './ConfirmEvalNameDialog';
import DownloadMenu from './DownloadMenu';
import { EvalIdChip } from './EvalIdChip';
import EvalSelectorDialog from './EvalSelectorDialog';
import EvalSelectorKeyboardShortcut from './EvalSelectorKeyboardShortcut';
import { useFilterMode } from './FilterModeProvider';
import { FilterModeSelector } from './FilterModeSelector';
import ResultsCharts from './ResultsCharts';
import FiltersButton from './ResultsFilters/FiltersButton';
import FiltersForm from './ResultsFilters/FiltersForm';
import ResultsTable from './ResultsTable';
import ShareModal from './ShareModal';
import { useResultsViewSettingsStore, useTableStore } from './store';
import SettingsModal from './TableSettings/TableSettingsModal';
import type { EvalResultsFilterMode, ResultLightweightWithLabel } from '@promptfoo/types';
import type { VisibilityState } from '@tanstack/table-core';

interface ResultsViewProps {
  recentEvals: ResultLightweightWithLabel[];
  onRecentEvalSelected: (file: string) => void;
  defaultEvalId?: string;
}

const SearchInputField = React.memo(
  ({
    value,
    onChange,
    onKeyDown,
    placeholder = 'Search...',
  }: {
    value: string;
    onChange: (value: string) => void;
    onKeyDown?: React.KeyboardEventHandler;
    placeholder?: string;
  }) => {
    const [localValue, setLocalValue] = React.useState(value);

    React.useEffect(() => {
      setLocalValue(value);
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setLocalValue(newValue);
      onChange(newValue);
    };

    const handleClear = () => {
      setLocalValue('');
      onChange('');
    };

    return (
      <div className="relative w-full max-w-[400px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9 pr-8 rounded-full h-9"
          placeholder={placeholder}
          value={localValue}
          onChange={handleChange}
          onKeyDown={onKeyDown}
        />
        {localValue && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted transition-colors"
                aria-label="Clear search (Esc)"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Clear search (Esc)</TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  },
);

export default function ResultsView({
  recentEvals,
  onRecentEvalSelected,
  defaultEvalId,
}: ResultsViewProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    author,
    table,

    config,
    setConfig,
    evalId,
    setAuthor,
    filteredResultsCount,
    totalResultsCount,
    highlightedResultsCount,
    filters,
    removeFilter,
    stats,
  } = useTableStore();

  const { filterMode, setFilterMode } = useFilterMode();

  const {
    setInComparisonMode,
    columnStates,
    setColumnState,
    maxTextLength,
    wordBreak,
    showInferenceDetails,
    comparisonEvalIds,
    setComparisonEvalIds,
  } = useResultsViewSettingsStore();

  const { updateConfig } = useMainStore();

  const { showToast } = useToast();
  const [searchText, setSearchText] = React.useState(searchParams.get('search') || '');
  const [debouncedSearchValue] = useDebounce(searchText, 1000);

  const handleSearchTextChange = React.useCallback(
    (text: string) => {
      setSearchParams((prev) => ({ ...prev, search: text }), { replace: true });
      setSearchText(text);
    },
    [setSearchParams],
  );

  const [failureFilter, setFailureFilter] = React.useState<{ [key: string]: boolean }>({});
  const handleFailureFilterToggle = React.useCallback(
    (columnId: string, checked: boolean) => {
      setFailureFilter((prevFailureFilter) => ({ ...prevFailureFilter, [columnId]: checked }));
    },
    [setFailureFilter],
  );

  invariant(table, 'Table data must be loaded before rendering ResultsView');
  const { head } = table;

  const handleFilterModeChange = (mode: EvalResultsFilterMode) => {
    setFilterMode(mode);

    const newFailureFilter: { [key: string]: boolean } = {};
    head.prompts.forEach((_, idx) => {
      const columnId = `Prompt ${idx + 1}`;
      newFailureFilter[columnId] = mode === 'failures';
    });
    setFailureFilter(newFailureFilter);
  };

  const [shareModalOpen, setShareModalOpen] = React.useState(false);
  const [shareLoading, setShareLoading] = React.useState(false);

  const [filtersFormOpen, setFiltersFormOpen] = React.useState(false);
  const filtersButtonRef = React.useRef<HTMLButtonElement>(null);

  // State for anchor element
  const [_anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);

  const currentEvalId = evalId || defaultEvalId || 'default';

  // Valid evalId for navigation (no fallback to 'default')
  const validEvalId = evalId || defaultEvalId;

  // Handle menu close
  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  // Function to open the eval actions menu
  const _handleOpenMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleShareButtonClick = async () => {
    if (IS_RUNNING_LOCALLY) {
      setShareLoading(true);
      setShareModalOpen(true);
    } else {
      // For non-local instances, just show the modal
      setShareModalOpen(true);
    }
  };

  const handleShare = async (id: string): Promise<string> => {
    try {
      if (!IS_RUNNING_LOCALLY) {
        // For non-local instances, include base path in the URL
        const basePath = import.meta.env.VITE_PUBLIC_BASENAME || '';
        return `${window.location.host}${basePath}${EVAL_ROUTES.DETAIL(id)}`;
      }

      const response = await callApi('/results/share', {
        method: 'POST',
        body: JSON.stringify({ id }),
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error('Failed to generate share URL');
      }
      const { url } = await response.json();
      return url;
    } catch (error) {
      console.error('Failed to generate share URL:', error);
      throw error;
    } finally {
      setShareLoading(false);
    }
  };

  const handleComparisonEvalSelected = async (compareEvalId: string) => {
    setAnchorEl(null);

    setInComparisonMode(true);
    setComparisonEvalIds([...comparisonEvalIds, compareEvalId]);
  };

  const hasAnyDescriptions = React.useMemo(
    () => table.body?.some((row) => row.description),
    [table.body],
  );

  const promptOptions = head.prompts.map((prompt, idx) => {
    const label = prompt.label || prompt.display || prompt.raw;
    const provider = prompt.provider || 'unknown';
    const displayLabel = [
      label && `"${label.slice(0, 60)}${label.length > 60 ? '...' : ''}"`,
      provider && `[${provider}]`,
    ]
      .filter(Boolean)
      .join(' ');

    return {
      value: `Prompt ${idx + 1}`,
      label: displayLabel,
      description: label,
      group: 'Prompts',
    };
  });

  const columnData = React.useMemo(() => {
    return [
      ...(hasAnyDescriptions ? [{ value: 'description', label: 'Description' }] : []),
      ...head.vars.map((_, idx) => ({
        value: `Variable ${idx + 1}`,
        label: `Var ${idx + 1}: ${
          head.vars[idx].length > 100 ? head.vars[idx].slice(0, 97) + '...' : head.vars[idx]
        }`,
        group: 'Variables',
      })),
      ...promptOptions,
    ];
  }, [head.vars, promptOptions, hasAnyDescriptions]);

  const [configModalOpen, setConfigModalOpen] = React.useState(false);
  const [viewSettingsModalOpen, setViewSettingsModalOpen] = React.useState(false);
  const [editNameDialogOpen, setEditNameDialogOpen] = React.useState(false);
  const [copyDialogOpen, setCopyDialogOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const allColumns = React.useMemo(
    () => [
      ...(hasAnyDescriptions ? ['description'] : []),
      ...head.vars.map((_, idx) => `Variable ${idx + 1}`),
      ...head.prompts.map((_, idx) => `Prompt ${idx + 1}`),
    ],
    [hasAnyDescriptions, head.vars, head.prompts],
  );

  const currentColumnState = columnStates[currentEvalId] || {
    selectedColumns: allColumns,
    columnVisibility: allColumns.reduce((acc, col) => ({ ...acc, [col]: true }), {}),
  };

  const visiblePromptCount = React.useMemo(
    () =>
      head.prompts.filter(
        (_, idx) => currentColumnState.columnVisibility[`Prompt ${idx + 1}`] !== false,
      ).length,
    [head.prompts, currentColumnState.columnVisibility],
  );

  const updateColumnVisibility = React.useCallback(
    (columns: string[]) => {
      const newColumnVisibility: VisibilityState = {};
      allColumns.forEach((col) => {
        newColumnVisibility[col] = columns.includes(col);
      });
      setColumnState(currentEvalId, {
        selectedColumns: columns,
        columnVisibility: newColumnVisibility,
      });
    },
    [allColumns, setColumnState, currentEvalId],
  );

  const handleChange = React.useCallback(
    (newSelectedColumns: string[]) => {
      updateColumnVisibility(newSelectedColumns);
    },
    [updateColumnVisibility],
  );

  const handleSaveEvalName = React.useCallback(
    async (newName: string) => {
      try {
        invariant(config, 'Config must be loaded before updating its description');
        const newConfig = { ...config, description: newName };

        const response = await callApi(`/eval/${evalId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ config: newConfig }),
        });

        if (!response.ok) {
          throw new Error('Failed to update eval name');
        }

        setConfig(newConfig);
      } catch (error) {
        console.error('Failed to update eval name:', error);
        showToast(
          `Failed to update eval name: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'error',
        );
        throw error;
      }
    },
    [config, evalId, setConfig, showToast],
  );

  const handleCopyEval = React.useCallback(
    async (description: string) => {
      try {
        invariant(evalId, 'Eval ID must be set before copying');

        const response = await callApi(`/eval/${evalId}/copy`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ description }),
        });

        if (!response.ok) {
          throw new Error('Failed to copy evaluation');
        }

        const { id: newEvalId, distinctTestCount } = await response.json();

        // Open in new tab (Google Docs pattern)
        window.open(EVAL_ROUTES.DETAIL(newEvalId), '_blank');

        // Show success toast
        showToast(`Copied ${distinctTestCount.toLocaleString()} results successfully`, 'success');
      } catch (error) {
        console.error('Failed to copy evaluation:', error);
        showToast(
          `Failed to copy evaluation: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'error',
        );
        throw error;
      }
    },
    [evalId, showToast],
  );

  /**
   * Determines the next eval to navigate to after deleting the current one
   * @returns The eval ID to navigate to, or null to go home
   */
  const getNextEvalAfterDelete = (): string | null => {
    if (!evalId || recentEvals.length === 0) {
      return null;
    }

    const currentIndex = recentEvals.findIndex((e) => e.evalId === evalId);

    // If current eval not in list or only one eval, go home
    if (currentIndex === -1 || recentEvals.length === 1) {
      return null;
    }

    // Try next eval first
    if (currentIndex < recentEvals.length - 1) {
      return recentEvals[currentIndex + 1].evalId;
    }

    // If this is the last eval, go to previous
    if (currentIndex > 0) {
      return recentEvals[currentIndex - 1].evalId;
    }

    return null;
  };

  const handleDeleteEvalClick = () => {
    handleMenuClose();

    if (!evalId) {
      showToast('Cannot delete: Eval ID not found', 'error');
      return;
    }

    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!evalId) {
      return;
    }

    setIsDeleting(true);

    try {
      const response = await callApi(`/eval/${evalId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete eval');
      }

      showToast('Eval deleted', 'success');

      // Navigate to next eval or home
      const nextEvalId = getNextEvalAfterDelete();
      if (nextEvalId) {
        onRecentEvalSelected(nextEvalId);
      } else {
        navigate('/', { replace: true });
      }
    } catch (error) {
      console.error('Failed to delete eval:', error);
      showToast(
        `Failed to delete eval: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
      );
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const [evalSelectorDialogOpen, setEvalSelectorDialogOpen] = React.useState(false);

  const handleEvalIdCopyClick = () => {
    if (evalId) {
      navigator.clipboard.writeText(evalId).then(
        () => {
          showToast('Eval ID copied to clipboard', 'success');
        },
        () => {
          showToast('Failed to copy Eval ID to clipboard', 'error');
          console.error('Failed to copy to clipboard');
        },
      );
    }
  };

  const [currentUserEmail, setCurrentUserEmail] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetchUserEmail().then((email) => {
      setCurrentUserEmail(email);
    });
  }, []);

  const handleEditAuthor = async (newAuthor: string) => {
    if (evalId) {
      try {
        await updateEvalAuthor(evalId, newAuthor);
        setAuthor(newAuthor);
      } catch (error) {
        console.error('Failed to update author:', error);
        throw error;
      }
    }
  };

  const handleSearchKeyDown = React.useCallback<React.KeyboardEventHandler>(
    (event) => {
      if (event.key === 'Escape') {
        handleSearchTextChange('');
        event.preventDefault();
        event.stopPropagation();
      }
    },
    [handleSearchTextChange],
  );

  // Render the charts if a) they can be rendered, and b) the viewport, at mount-time, is tall enough.
  const resultsChartsScores = React.useMemo(() => {
    if (!table?.body) {
      return [];
    }
    return table?.body
      .flatMap((row) => row.outputs.map((output) => output?.score))
      .filter((score) => typeof score === 'number' && !Number.isNaN(score));
  }, [table]);

  const canRenderResultsCharts =
    table &&
    config &&
    table.head.prompts.length > 1 &&
    // No valid scores available
    resultsChartsScores.length > 0 &&
    // All scores are the same, charts not useful.
    new Set(resultsChartsScores).size > 1;
  const [renderResultsCharts, setRenderResultsCharts] = React.useState(window.innerHeight >= 1100);

  const [resultsTableZoom, setResultsTableZoom] = React.useState(1);

  return (
    <>
      <div className="px-4 pt-4" style={{ isolation: 'isolate' }}>
        <div className="transition-all duration-300">
          <div className="flex flex-wrap gap-2 items-center max-w-full sm:flex-row eval-header">
            <div className="flex items-center w-full max-w-[250px]">
              <button
                type="button"
                onClick={() => setEvalSelectorDialogOpen(true)}
                className="flex items-center w-full h-9 px-3 border border-input rounded-md bg-background text-sm cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <Search className="h-4 w-4 mr-2 text-muted-foreground" />
                <span className="flex-1 text-left truncate">
                  {config?.description || evalId || 'Search or select an eval...'}
                </span>
                <ChevronDown className="h-4 w-4 ml-2 text-muted-foreground" />
              </button>
              <EvalSelectorDialog
                open={evalSelectorDialogOpen}
                onClose={() => setEvalSelectorDialogOpen(false)}
                onEvalSelected={(evalId) => {
                  setEvalSelectorDialogOpen(false);
                  onRecentEvalSelected(evalId);
                }}
                focusedEvalId={evalId ?? undefined}
              />
            </div>
            {evalId && <EvalIdChip evalId={evalId} onCopy={handleEvalIdCopyClick} />}
            <AuthorChip
              author={author}
              onEditAuthor={handleEditAuthor}
              currentUserEmail={currentUserEmail}
              editable
            />
            {Object.keys(config?.tags || {}).map((tag) => (
              <Badge key={tag} variant="secondary" className="opacity-70">
                {`${tag}: ${config?.tags?.[tag]}`}
              </Badge>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 items-center max-w-full sm:flex-row mt-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Zoom</label>
              <Select
                value={String(resultsTableZoom)}
                onValueChange={(val) => setResultsTableZoom(Number(val))}
              >
                <SelectTrigger className="w-[100px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.5">50%</SelectItem>
                  <SelectItem value="0.75">75%</SelectItem>
                  <SelectItem value="0.9">90%</SelectItem>
                  <SelectItem value="1">100%</SelectItem>
                  <SelectItem value="1.25">125%</SelectItem>
                  <SelectItem value="1.5">150%</SelectItem>
                  <SelectItem value="2">200%</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <FilterModeSelector
                filterMode={filterMode}
                onChange={handleFilterModeChange}
                showDifferentOption={visiblePromptCount > 1}
              />
            </div>
            <div>
              <SearchInputField
                value={searchText}
                onChange={handleSearchTextChange}
                onKeyDown={handleSearchKeyDown}
                placeholder="Text or regex"
              />
            </div>

            <FiltersButton
              appliedFiltersCount={filters.appliedCount}
              onClick={() => setFiltersFormOpen(true)}
              ref={filtersButtonRef}
            />
            <FiltersForm
              open={filtersFormOpen}
              onClose={() => setFiltersFormOpen(false)}
              anchorEl={filtersButtonRef.current}
            />

            <div className="flex items-center bg-muted/50 rounded-2xl px-3 py-1 text-sm">
              {searchText || filterMode !== 'all' || filters.appliedCount > 0 ? (
                <>
                  <strong>{filteredResultsCount}</strong>
                  <span className="mx-1">of</span>
                  <strong>{totalResultsCount}</strong>
                  <span className="mx-1">results</span>
                  {searchText && (
                    <Badge variant="secondary" className="ml-1 text-xs h-5 gap-1">
                      Search:{' '}
                      {searchText.length > 4 ? searchText.substring(0, 5) + '...' : searchText}
                      <button
                        type="button"
                        onClick={() => handleSearchTextChange('')}
                        className="ml-1 hover:bg-muted rounded-full"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {filterMode !== 'all' && (
                    <Badge variant="secondary" className="ml-1 text-xs h-5 gap-1">
                      Filter: {filterMode}
                      <button
                        type="button"
                        onClick={() => setFilterMode('all')}
                        className="ml-1 hover:bg-muted rounded-full"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {filters.appliedCount > 0 &&
                    Object.values(filters.values).map((filter) => {
                      // For metadata filters with exists operator, only field is required
                      // For metric filters with is_defined operator, only field is required
                      // For other filters, check field and value requirements
                      if (filter.type === 'metadata' && filter.operator === 'exists') {
                        if (!filter.field) {
                          return null;
                        }
                      } else if (filter.type === 'metric' && filter.operator === 'is_defined') {
                        if (!filter.field) {
                          return null;
                        }
                      } else if (filter.type === 'metadata' || filter.type === 'metric') {
                        if (!filter.value || !filter.field) {
                          return null;
                        }
                      } else if (!filter.value) {
                        return null;
                      }

                      const truncatedValue =
                        filter.value.length > 50 ? filter.value.slice(0, 50) + '...' : filter.value;

                      let label: string;
                      if (filter.type === 'metric') {
                        const operatorSymbols: Record<string, string> = {
                          is_defined: 'is defined',
                          eq: '==',
                          neq: '!=',
                          gt: '>',
                          gte: '≥',
                          lt: '<',
                          lte: '≤',
                        };
                        const operatorDisplay = operatorSymbols[filter.operator] || filter.operator;
                        if (filter.operator === 'is_defined') {
                          label = `Metric: ${filter.field}`;
                        } else {
                          label = `${filter.field} ${operatorDisplay} ${truncatedValue}`;
                        }
                      } else if (filter.type === 'plugin') {
                        const displayName =
                          displayNameOverrides[filter.value as keyof typeof displayNameOverrides] ||
                          filter.value;
                        label =
                          filter.operator === 'not_equals'
                            ? `Plugin != ${displayName}`
                            : `Plugin: ${displayName}`;
                      } else if (filter.type === 'strategy') {
                        const displayName =
                          displayNameOverrides[filter.value as keyof typeof displayNameOverrides] ||
                          filter.value;
                        label = `Strategy: ${displayName}`;
                      } else if (filter.type === 'severity') {
                        const severityDisplay =
                          filter.value.charAt(0).toUpperCase() + filter.value.slice(1);
                        label = `Severity: ${severityDisplay}`;
                      } else if (filter.type === 'policy') {
                        const policyName = filters.policyIdToNameMap?.[filter.value];
                        label = formatPolicyIdentifierAsMetric(policyName ?? filter.value);
                      } else {
                        if (filter.operator === 'exists') {
                          label = `Metadata: ${filter.field}`;
                        } else {
                          label = `${filter.field} ${filter.operator.replace('_', ' ')} "${truncatedValue}"`;
                        }
                      }

                      return (
                        <Badge
                          key={filter.id}
                          variant="secondary"
                          className="ml-1 text-xs h-5 gap-1"
                          title={filter.value}
                        >
                          {label}
                          <button
                            type="button"
                            onClick={() => removeFilter(filter.id)}
                            className="ml-1 hover:bg-muted rounded-full"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      );
                    })}
                </>
              ) : (
                <>{filteredResultsCount} results</>
              )}
            </div>
            {highlightedResultsCount > 0 && (
              <Badge className="bg-primary/10 text-primary border border-primary/20 font-medium">
                {highlightedResultsCount} highlighted
              </Badge>
            )}
            {(() => {
              const formattedDuration =
                stats?.durationMs != null ? formatDuration(stats.durationMs) : null;
              return formattedDuration ? (
                <Tooltip>
                  <TooltipTrigger>
                    <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800">
                      <Clock className="h-3.5 w-3.5 mr-1" />
                      {formattedDuration}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>Total evaluation duration (wall-clock time)</TooltipContent>
                </Tooltip>
              ) : null;
            })()}
            <div className="flex-1" />
            <div className="flex justify-end">
              <div className="flex flex-wrap gap-2 items-center max-w-full sm:flex-row">
                <ColumnSelector
                  columnData={columnData}
                  selectedColumns={currentColumnState.selectedColumns}
                  onChange={handleChange}
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" onClick={() => setViewSettingsModalOpen(true)}>
                      <Settings className="h-4 w-4 mr-2" />
                      Table Settings
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit table view settings</TooltipContent>
                </Tooltip>
                {config && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline">
                        Eval actions
                        <ChevronDown className="h-4 w-4 ml-2" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditNameDialogOpen(true)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit name
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          updateConfig(config);
                          navigate('/setup/');
                        }}
                      >
                        <Play className="h-4 w-4 mr-2" />
                        Edit and re-run
                      </DropdownMenuItem>
                      <CompareEvalMenuItem
                        initialEvals={recentEvals}
                        onComparisonEvalSelected={handleComparisonEvalSelected}
                        onMenuClose={handleMenuClose}
                      />
                      <DropdownMenuItem onClick={() => setConfigModalOpen(true)}>
                        <Eye className="h-4 w-4 mr-2" />
                        View YAML
                      </DropdownMenuItem>
                      <DownloadMenu />
                      <DropdownMenuItem onClick={() => setCopyDialogOpen(true)}>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleShareButtonClick} disabled={shareLoading}>
                        {shareLoading ? (
                          <Spinner className="h-4 w-4 mr-2" />
                        ) : (
                          <Share className="h-4 w-4 mr-2" />
                        )}
                        Share
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={handleDeleteEvalClick}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {canRenderResultsCharts && (
                  <Button variant="ghost" onClick={() => setRenderResultsCharts((prev) => !prev)}>
                    <BarChart className="h-4 w-4 mr-2" />
                    {renderResultsCharts ? 'Hide Charts' : 'Show Charts'}
                  </Button>
                )}
                {/* TODO(Michael): Remove config.metadata.redteam check (2024-08-18) */}
                {(config?.redteam || config?.metadata?.redteam) && validEvalId && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button onClick={() => navigate(REDTEAM_ROUTES.REPORT_DETAIL(validEvalId))}>
                        <Eye className="h-4 w-4 mr-2" />
                        Vulnerability Report
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>View vulnerability scan report</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </div>
          {canRenderResultsCharts && renderResultsCharts && (
            <ResultsCharts
              handleHideCharts={() => setRenderResultsCharts(false)}
              scores={resultsChartsScores}
            />
          )}
        </div>
        <ResultsTable
          key={currentEvalId}
          maxTextLength={maxTextLength}
          columnVisibility={currentColumnState.columnVisibility}
          wordBreak={wordBreak}
          showStats={showInferenceDetails}
          filterMode={filterMode}
          failureFilter={failureFilter}
          debouncedSearchText={debouncedSearchValue}
          onFailureFilterToggle={handleFailureFilterToggle}
          zoom={resultsTableZoom}
        />
      </div>
      <ConfigModal open={configModalOpen} onClose={() => setConfigModalOpen(false)} />
      <ShareModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        evalId={currentEvalId}
        onShare={handleShare}
      />
      <SettingsModal open={viewSettingsModalOpen} onClose={() => setViewSettingsModalOpen(false)} />
      <ConfirmEvalNameDialog
        open={editNameDialogOpen}
        onClose={() => setEditNameDialogOpen(false)}
        title="Edit Eval Name"
        label="Description"
        currentName={config?.description || ''}
        actionButtonText="Save"
        onConfirm={handleSaveEvalName}
      />
      <ConfirmEvalNameDialog
        open={copyDialogOpen}
        onClose={() => setCopyDialogOpen(false)}
        title="Copy Evaluation"
        label="Description"
        currentName={`${config?.description || 'Evaluation'} (Copy)`}
        actionButtonText="Create Copy"
        onConfirm={handleCopyEval}
        showSizeWarning={totalResultsCount > 10000}
        itemCount={totalResultsCount}
        itemLabel="results"
      />
      <EvalSelectorKeyboardShortcut onEvalSelected={onRecentEvalSelected} />

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => !isDeleting && setDeleteDialogOpen(open)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Delete eval?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Alert variant="warning">
              <AlertDescription>This action cannot be undone.</AlertDescription>
            </Alert>
            <p className="text-sm text-muted-foreground">You are about to permanently delete:</p>
            <div className="mt-2 p-3 bg-muted/50 rounded-md border border-border">
              <p className="font-medium">{config?.description || evalId || 'Unnamed eval'}</p>
              <div className="flex gap-2 mt-1 text-sm text-muted-foreground">
                <span>
                  {totalResultsCount.toLocaleString()} result{totalResultsCount !== 1 ? 's' : ''}
                </span>
                <span>•</span>
                <span>
                  {head.prompts.length} prompt{head.prompts.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={isDeleting}>
              {isDeleting ? (
                <>
                  <Spinner className="h-4 w-4 mr-2" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
