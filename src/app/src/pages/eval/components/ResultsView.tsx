import React from 'react';

import { Alert, AlertContent, AlertDescription } from '@app/components/ui/alert';
import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { Chip } from '@app/components/ui/chip';
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
import { SearchInput } from '@app/components/ui/search-input';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@app/components/ui/select';
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
  Settings,
  Share,
  Trash2,
  X,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDebouncedCallback } from 'use-debounce';
import { AuthorChip } from './AuthorChip';
import { ColumnSelector } from './ColumnSelector';
import CompareEvalMenuItem from './CompareEvalMenuItem';
import ConfigModal from './ConfigModal';
import { ConfirmEvalNameDialog } from './ConfirmEvalNameDialog';
import { DownloadDialog, DownloadMenuItem } from './DownloadMenu';
import { EvalIdChip } from './EvalIdChip';
import EvalSelectorDialog from './EvalSelectorDialog';
import EvalSelectorKeyboardShortcut from './EvalSelectorKeyboardShortcut';
import { FilterChips } from './FilterChips';
import { useFilterMode } from './FilterModeProvider';
import { FilterModeSelector } from './FilterModeSelector';
import { HiddenColumnChips } from './HiddenColumnChips';
import ResultsCharts from './ResultsCharts';
import FiltersForm from './ResultsFilters/FiltersForm';
import ResultsTable from './ResultsTable';
import ShareModal from './ShareModal';
import { useResultsViewSettingsStore, useTableStore } from './store';
import SettingsModal from './TableSettings/TableSettingsModal';
import { hashVarSchema } from './utils';
import type { EvalResultsFilterMode, ResultLightweightWithLabel } from '@promptfoo/types';
import type { VisibilityState } from '@tanstack/table-core';

interface ResultsViewProps {
  recentEvals: ResultLightweightWithLabel[];
  onRecentEvalSelected: (file: string) => void;
  defaultEvalId?: string;
}

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
    totalResultsCount,
    highlightedResultsCount,
    userRatedResultsCount,
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
    hiddenVarNamesBySchema,
    setHiddenVarNamesForSchema,
  } = useResultsViewSettingsStore();

  const { updateConfig } = useMainStore();

  const { showToast } = useToast();
  const initialSearchText = searchParams.get('search') || '';
  const [searchInputValue, setSearchInputValue] = React.useState(initialSearchText); // local, for responsive input
  const [debouncedSearchText, setDebouncedSearchText] = React.useState(initialSearchText); // debounced, for table/URL/pill

  // Debounced update for URL, table, and pill
  const debouncedUpdate = useDebouncedCallback((text: string) => {
    setDebouncedSearchText(text);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (text) {
          next.set('search', text);
        } else {
          next.delete('search');
        }
        return next;
      },
      { replace: true },
    );
  }, 300);

  const handleClearSearch = () => {
    setSearchInputValue('');
    debouncedUpdate.cancel();
    setDebouncedSearchText('');
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('search');
        return next;
      },
      { replace: true },
    );
  };

  const [failureFilter, setFailureFilter] = React.useState<{ [key: string]: boolean }>({});
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
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

  // State for eval actions dropdown menu
  const [evalActionsOpen, setEvalActionsOpen] = React.useState(false);

  // State for compare eval dialog
  const [compareDialogOpen, setCompareDialogOpen] = React.useState(false);

  // State for download dialog
  const [downloadDialogOpen, setDownloadDialogOpen] = React.useState(false);

  const currentEvalId = evalId || defaultEvalId || 'default';

  // Valid evalId for navigation (no fallback to 'default')
  const validEvalId = evalId || defaultEvalId;

  // Handle menu close
  const handleMenuClose = () => {
    setEvalActionsOpen(false);
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
    // Prevent self-comparison
    if (compareEvalId === currentEvalId) {
      setCompareDialogOpen(false);
      return;
    }
    setInComparisonMode(true);
    setComparisonEvalIds([...comparisonEvalIds, compareEvalId]);
    setCompareDialogOpen(false);
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

  // Helper to extract variable name from a column ID like "Variable 1"
  const getVarNameFromColumnId = React.useCallback(
    (columnId: string): string | null => {
      const match = columnId.match(/^Variable (\d+)$/);
      if (match) {
        const varIndex = parseInt(match[1], 10) - 1;
        return head.vars[varIndex] ?? null;
      }
      return null;
    },
    [head.vars],
  );

  // Compute schema hash from variable names - evals with the same vars share visibility
  const schemaHash = React.useMemo(() => hashVarSchema(head.vars), [head.vars]);

  // Get hidden var names for this schema
  const hiddenVarNames = React.useMemo(
    () => hiddenVarNamesBySchema[schemaHash] ?? [],
    [hiddenVarNamesBySchema, schemaHash],
  );

  // Build column state from:
  // - Schema-based hiddenVarNames for variable columns (persists across evals with same vars)
  // - Per-eval columnStates for prompts/description (eval-specific)
  const currentColumnState = React.useMemo(() => {
    const savedState = columnStates[currentEvalId];
    const columnVisibility: VisibilityState = {};
    const selectedColumns: string[] = [];

    allColumns.forEach((col) => {
      const varName = getVarNameFromColumnId(col);
      if (varName !== null) {
        // Variable columns: use schema-based hiddenVarNames
        const isHidden = hiddenVarNames.includes(varName);
        columnVisibility[col] = !isHidden;
        if (!isHidden) {
          selectedColumns.push(col);
        }
      } else {
        // Non-variable columns (description, prompts): use per-eval state, default to visible
        const isVisible = savedState?.columnVisibility[col] ?? true;
        columnVisibility[col] = isVisible;
        if (isVisible) {
          selectedColumns.push(col);
        }
      }
    });

    return { selectedColumns, columnVisibility };
  }, [allColumns, getVarNameFromColumnId, hiddenVarNames, columnStates, currentEvalId]);

  const visiblePromptCount = React.useMemo(
    () =>
      head.prompts.filter(
        (_, idx) => currentColumnState.columnVisibility[`Prompt ${idx + 1}`] !== false,
      ).length,
    [head.prompts, currentColumnState.columnVisibility],
  );

  const updateColumnVisibility = React.useCallback(
    (columns: string[]) => {
      // Update schema-based hiddenVarNames for variable columns
      // Only tracks hidden vars for this schema (set of variable names)
      const newHiddenVarNames: string[] = [];

      allColumns.forEach((col) => {
        const varName = getVarNameFromColumnId(col);
        if (varName !== null) {
          const isVisible = columns.includes(col);
          if (!isVisible) {
            newHiddenVarNames.push(varName);
          }
        }
      });

      setHiddenVarNamesForSchema(schemaHash, newHiddenVarNames);

      // Update per-eval columnStates for all columns (keeps original behavior for prompts/description)
      const newColumnVisibility: VisibilityState = {};
      allColumns.forEach((col) => {
        newColumnVisibility[col] = columns.includes(col);
      });
      setColumnState(currentEvalId, {
        selectedColumns: columns,
        columnVisibility: newColumnVisibility,
      });
    },
    [
      allColumns,
      getVarNameFromColumnId,
      schemaHash,
      setHiddenVarNamesForSchema,
      setColumnState,
      currentEvalId,
    ],
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

  // Render the charts if a) they can be rendered, and b) the viewport, at mount-time, is tall enough.
  const resultsChartsScores = React.useMemo(() => {
    if (!table?.body) {
      return [];
    }
    return table?.body
      .flatMap((row) => row.outputs.map((output) => output?.score))
      .filter((score) => typeof score === 'number' && !Number.isNaN(score));
  }, [table]);

  // Determine if charts should be rendered based on score variance
  const uniqueScores = React.useMemo(() => new Set(resultsChartsScores), [resultsChartsScores]);
  const hasVariedScores = uniqueScores.size > 1;
  // When all scores are identical, still show charts if the uniform score
  // is not a binary edge value (0 or 1). Graded assertions (like llm-rubric)
  // can produce meaningful uniform scores (e.g., 0.85) that users want to visualize.
  const hasMeaningfulUniformScore =
    uniqueScores.size === 1 && ![0, 1].includes([...uniqueScores][0]);

  const canRenderResultsCharts =
    table &&
    config &&
    table.head.prompts.length > 1 &&
    // No valid scores available
    resultsChartsScores.length > 0 &&
    // Show charts if scores vary OR if uniform score is meaningful (not binary 0/1)
    (hasVariedScores || hasMeaningfulUniformScore);
  const [renderResultsCharts, setRenderResultsCharts] = React.useState(window.innerHeight >= 1100);

  const [resultsTableZoom, setResultsTableZoom] = React.useState(1);

  return (
    <>
      <div
        className="px-4 pt-4 flex flex-col"
        style={{
          isolation: 'isolate',
          minHeight: 'calc(100vh - var(--nav-height) - var(--update-banner-height, 0px))',
        }}
      >
        <Card className="p-4 mb-4 bg-white dark:bg-zinc-900 shrink-0">
          <div className="flex flex-wrap gap-2 items-center max-w-full sm:flex-row eval-header">
            <div className="flex items-center w-full max-w-[250px]">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Chip
                    label="EVAL"
                    onClick={() => setEvalSelectorDialogOpen(true)}
                    trailingIcon={<ChevronDown className="size-4 text-muted-foreground" />}
                    className="w-full justify-start [&>span:first-child]:truncate"
                  >
                    {config?.description || evalId || 'Select...'}
                  </Chip>
                </TooltipTrigger>
                <TooltipContent>Click to select an eval</TooltipContent>
              </Tooltip>
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
            <Select
              value={String(resultsTableZoom)}
              onValueChange={(val) => setResultsTableZoom(Number(val))}
            >
              <SelectTrigger className="w-[115px] h-8 text-xs">
                <span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    ZOOM
                  </span>{' '}
                  {Math.round(resultsTableZoom * 100)}%
                </span>
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
            <FilterModeSelector
              filterMode={filterMode}
              onChange={handleFilterModeChange}
              showDifferentOption={visiblePromptCount > 1}
            />
            <SearchInput
              value={searchInputValue}
              onChange={(value) => {
                setSearchInputValue(value);
                debouncedUpdate(value);
              }}
              onClear={handleClearSearch}
              containerClassName="w-[200px]"
              className="h-8 text-xs"
            />

            <FiltersForm />

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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setViewSettingsModalOpen(true)}
                    >
                      <Settings className="size-4 mr-2" />
                      Table Settings
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit table view settings</TooltipContent>
                </Tooltip>
                {config && (
                  <DropdownMenu open={evalActionsOpen} onOpenChange={setEvalActionsOpen}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        Eval actions
                        <ChevronDown className="size-4 ml-2" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditNameDialogOpen(true)}>
                        <Edit className="size-4 mr-2" />
                        Edit name
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          updateConfig(config);
                          navigate('/setup/');
                        }}
                      >
                        <Play className="size-4 mr-2" />
                        Edit and re-run
                      </DropdownMenuItem>
                      <CompareEvalMenuItem onClick={() => setCompareDialogOpen(true)} />
                      <DropdownMenuItem onClick={() => setConfigModalOpen(true)}>
                        <Eye className="size-4 mr-2" />
                        View YAML
                      </DropdownMenuItem>
                      <DownloadMenuItem onClick={() => setDownloadDialogOpen(true)} />
                      <DropdownMenuItem onClick={() => setCopyDialogOpen(true)}>
                        <Copy className="size-4 mr-2" />
                        Copy
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleShareButtonClick} disabled={shareLoading}>
                        {shareLoading ? (
                          <Spinner className="size-4 mr-2" />
                        ) : (
                          <Share className="size-4 mr-2" />
                        )}
                        Share
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={handleDeleteEvalClick}
                        className="text-destructive"
                      >
                        <Trash2 className="size-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {canRenderResultsCharts && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRenderResultsCharts((prev) => !prev)}
                  >
                    <BarChart className="size-4 mr-2" />
                    {renderResultsCharts ? 'Hide Charts' : 'Show Charts'}
                  </Button>
                )}
                {/* TODO(Michael): Remove config.metadata.redteam check (2024-08-18) */}
                {(config?.redteam || config?.metadata?.redteam) && validEvalId && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        onClick={() => navigate(REDTEAM_ROUTES.REPORT_DETAIL(validEvalId))}
                      >
                        <Eye className="size-4 mr-2" />
                        Vulnerability Report
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>View vulnerability scan report</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </div>
          {(config?.redteam !== undefined ||
            debouncedSearchText ||
            filterMode !== 'all' ||
            filters.appliedCount > 0 ||
            highlightedResultsCount > 0 ||
            userRatedResultsCount > 0 ||
            stats?.durationMs != null ||
            currentColumnState.selectedColumns.length < columnData.length) && (
            <div className="flex flex-wrap gap-2 items-center mt-4 pt-4 border-t border-border/50">
              <FilterChips />
              {debouncedSearchText && (
                <Badge variant="secondary" className="text-xs h-5 gap-1">
                  Search:{' '}
                  {debouncedSearchText.length > 4
                    ? debouncedSearchText.substring(0, 5) + '...'
                    : debouncedSearchText}
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="ml-1 hover:bg-muted rounded-full"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              )}
              {filterMode !== 'all' && (
                <Badge variant="secondary" className="text-xs h-5 gap-1">
                  Filter: {filterMode}
                  <button
                    type="button"
                    onClick={() => setFilterMode('all')}
                    className="ml-1 hover:bg-muted rounded-full"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              )}
              {filters.appliedCount > 0 &&
                Object.values(filters.values).map((filter) => {
                  // For red team evals, skip metric filter badges since FilterChips already shows them
                  const isRedteamEval = config?.redteam !== undefined;
                  if (
                    isRedteamEval &&
                    filter.type === 'metric' &&
                    filter.operator === 'is_defined'
                  ) {
                    return null;
                  }

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
                      className="text-xs h-5 gap-1"
                      title={filter.value}
                    >
                      {label}
                      <button
                        type="button"
                        onClick={() => removeFilter(filter.id)}
                        className="ml-1 hover:bg-muted rounded-full"
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  );
                })}
              {highlightedResultsCount > 0 && (
                <Badge className="bg-primary/10 text-primary border border-primary/20 font-medium">
                  {highlightedResultsCount} highlighted
                </Badge>
              )}
              {userRatedResultsCount > 0 && (
                <Tooltip>
                  <TooltipTrigger>
                    <Badge
                      className="bg-purple-50 text-purple-700 border border-purple-200 font-medium cursor-pointer hover:bg-purple-100 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-800 dark:hover:bg-purple-950/50"
                      onClick={() => setFilterMode('user-rated')}
                    >
                      {userRatedResultsCount} user-rated
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    {userRatedResultsCount} output{userRatedResultsCount !== 1 ? 's' : ''} with user
                    ratings. Click to filter.
                  </TooltipContent>
                </Tooltip>
              )}
              {stats?.durationMs != null && (
                <Tooltip>
                  <TooltipTrigger>
                    <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800">
                      <Clock className="size-3.5 mr-1" />
                      {formatDuration(stats.durationMs)}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>Total evaluation duration (wall-clock time)</TooltipContent>
                </Tooltip>
              )}
              <HiddenColumnChips
                columnData={columnData}
                selectedColumns={currentColumnState.selectedColumns}
                onChange={handleChange}
              />
            </div>
          )}
          {canRenderResultsCharts && renderResultsCharts && (
            <ResultsCharts
              handleHideCharts={() => setRenderResultsCharts(false)}
              scores={resultsChartsScores}
            />
          )}
        </Card>
        <ResultsTable
          key={currentEvalId}
          maxTextLength={maxTextLength}
          columnVisibility={currentColumnState.columnVisibility}
          wordBreak={wordBreak}
          showStats={showInferenceDetails}
          filterMode={filterMode}
          failureFilter={failureFilter}
          debouncedSearchText={debouncedSearchText}
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
      <EvalSelectorDialog
        open={compareDialogOpen}
        onClose={() => setCompareDialogOpen(false)}
        onEvalSelected={handleComparisonEvalSelected}
        description="Only evals with the same dataset can be compared."
        focusedEvalId={currentEvalId}
        filterByDatasetId
      />
      <DownloadDialog open={downloadDialogOpen} onClose={() => setDownloadDialogOpen(false)} />
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
              <Trash2 className="size-5 text-destructive" />
              Delete eval?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Alert variant="warning">
              <AlertContent>
                <AlertDescription>This action cannot be undone.</AlertDescription>
              </AlertContent>
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
                  <Spinner className="size-4 mr-2" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="size-4 mr-2" />
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
