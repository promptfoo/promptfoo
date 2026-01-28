import React, { useEffect, useRef } from 'react';

import ErrorBoundary from '@app/components/ErrorBoundary';
import { Button } from '@app/components/ui/button';
import { Checkbox } from '@app/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { Spinner } from '@app/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { ROUTES } from '@app/constants/routes';
import { useToast } from '@app/hooks/useToast';
import { cn } from '@app/lib/utils';
import { callApi } from '@app/utils/api';
import { normalizeMediaText, resolveAudioSource, resolveImageSource } from '@app/utils/media';
import { getActualPrompt } from '@app/utils/providerResponse';
import { FILE_METADATA_KEY, HUMAN_ASSERTION_TYPE } from '@promptfoo/providers/constants';
import {
  type EvalResultsFilterMode,
  type EvaluateTable,
  type EvaluateTableOutput,
  type EvaluateTableRow,
  type GradingResult,
  type ProviderOptions,
  type Vars,
} from '@promptfoo/types';
import invariant from '@promptfoo/util/invariant';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowLeft, ArrowRight, ExternalLink, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import CustomMetrics from './CustomMetrics';
import CustomMetricsDialog from './CustomMetricsDialog';
import EvalOutputCell from './EvalOutputCell';
import EvalOutputPromptDialog from './EvalOutputPromptDialog';
import { useFilterMode } from './FilterModeProvider';
import { ProviderDisplay } from './ProviderDisplay';
import { type ProviderDef } from './providerConfig';
import { useResultsViewSettingsStore, useTableStore } from './store';
import TruncatedText from './TruncatedText';
import VariableMarkdownCell from './VariableMarkdownCell';
import type {
  CellContext,
  ColumnDef,
  ColumnSizingState,
  VisibilityState,
} from '@tanstack/table-core';

import type { TruncatedTextProps } from './TruncatedText';
import './ResultsTable.css';

import { NumberInput } from '@app/components/ui/number-input';
import { isBlobRef, isStorageRef, resolveAudioUrl } from '@app/utils/mediaStorage';
import { isEncodingStrategy } from '@promptfoo/redteam/constants/strategies';
import { useMetricsGetter, usePassingTestCounts, usePassRates, useTestCounts } from './hooks';

/**
 * Audio player component that handles both storage refs and base64 data
 */
function StorageRefAudioPlayer({ data, format = 'mp3' }: { data: string; format?: string }) {
  const [audioUrl, setAudioUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(isStorageRef(data) || isBlobRef(data));

  React.useEffect(() => {
    let cancelled = false;

    if (isStorageRef(data) || isBlobRef(data)) {
      setLoading(true);
      resolveAudioUrl(data, format).then((url) => {
        if (!cancelled) {
          setAudioUrl(url);
          setLoading(false);
        }
      });
    } else {
      // Inline base64
      const url = data.startsWith('data:') ? data : `data:audio/${format};base64,${data}`;
      setAudioUrl(url);
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [data, format]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-0.5">
        <Spinner className="size-4" />
        <span className="text-xs text-muted-foreground">Loading audio...</span>
      </div>
    );
  }

  if (!audioUrl) {
    return <span className="text-xs text-destructive">Failed to load audio</span>;
  }

  return (
    <audio controls style={{ maxWidth: '100%', height: '32px' }}>
      <source src={audioUrl} type={`audio/${format}`} />
      Your browser does not support the audio element.
    </audio>
  );
}

const VARIABLE_COLUMN_SIZE_PX = 200;
const PROMPT_COLUMN_SIZE_PX = 400;
const DESCRIPTION_COLUMN_SIZE_PX = 100;

function formatRowOutput(output: EvaluateTableOutput | string) {
  if (typeof output === 'string') {
    // Backwards compatibility for 0.15.0 breaking change. Remove eventually.
    const pass = output.startsWith('[PASS]');
    let text = output;
    if (output.startsWith('[PASS]')) {
      text = text.slice('[PASS]'.length);
    } else if (output.startsWith('[FAIL]')) {
      text = text.slice('[FAIL]'.length);
    } else if (output.startsWith('[ERROR]')) {
      text = text.slice('[ERROR]'.length);
    }
    return {
      text,
      pass,
      score: pass ? 1 : 0,
    };
  }
  return output;
}

function TableHeader({
  text,
  maxLength,
  expandedText,
  resourceId,
  className,
}: TruncatedTextProps & { expandedText?: string; resourceId?: string; className?: string }) {
  const [promptOpen, setPromptOpen] = React.useState(false);
  const handlePromptOpen = () => {
    setPromptOpen(true);
  };
  const handlePromptClose = () => {
    setPromptOpen(false);
  };
  return (
    <div className={`${className || ''} flex items-center gap-1`}>
      {expandedText ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="text-left cursor-pointer transition-colors px-2 py-1.5 -mx-2 rounded-md bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground font-mono text-[13px]"
              onClick={handlePromptOpen}
            >
              <span className="line-clamp-3">{text}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>View prompt</TooltipContent>
        </Tooltip>
      ) : (
        <TruncatedText text={text} maxLength={maxLength} />
      )}
      {expandedText && (
        <>
          {promptOpen && (
            <EvalOutputPromptDialog
              open={promptOpen}
              onClose={handlePromptClose}
              prompt={expandedText}
            />
          )}
          {resourceId && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link to={ROUTES.PROMPT_DETAIL(resourceId)} target="_blank" className="action">
                  <ExternalLink className="size-4" />
                </Link>
              </TooltipTrigger>
              <TooltipContent>View other evals and datasets for this prompt</TooltipContent>
            </Tooltip>
          )}
        </>
      )}
    </div>
  );
}

interface ResultsTableProps {
  maxTextLength: number;
  columnVisibility: VisibilityState;
  wordBreak: 'break-word' | 'break-all';
  filterMode: EvalResultsFilterMode;
  failureFilter: { [key: string]: boolean };
  debouncedSearchText?: string;
  showStats: boolean;
  onFailureFilterToggle: (columnId: string, checked: boolean) => void;
  zoom: number;
}

interface ExtendedEvaluateTableOutput extends EvaluateTableOutput {
  originalRowIndex?: number;
  originalPromptIndex?: number;
}

interface ExtendedEvaluateTableRow extends EvaluateTableRow {
  outputs: ExtendedEvaluateTableOutput[];
}

function ResultsTableHeader({
  reactTable,
  tableWidth,
  maxTextLength,
  wordBreak,
  theadRef,
  stickyHeader,
  setStickyHeader,
  hasMinimalScrollRoom,
  zoom,
}: {
  reactTable: ReturnType<typeof useReactTable<EvaluateTableRow>>;
  tableWidth: number;
  maxTextLength: number;
  wordBreak: 'break-word' | 'break-all';
  theadRef: React.RefObject<HTMLTableSectionElement | null>;
  stickyHeader: boolean;
  setStickyHeader: (sticky: boolean) => void;
  hasMinimalScrollRoom: boolean;
  zoom: number;
}) {
  'use no memo';
  return (
    <div
      data-testid="results-table-header"
      className={cn(
        'relative',
        stickyHeader && 'results-table-sticky',
        hasMinimalScrollRoom && 'minimal-scroll-room',
      )}
    >
      <div className="header-dismiss" style={{ display: stickyHeader ? undefined : 'none' }}>
        <button
          type="button"
          onClick={() => setStickyHeader(false)}
          className="p-1.5 rounded hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>
      <table
        className={`results-table firefox-fix ${maxTextLength <= 25 ? 'compact' : ''}`}
        style={{
          wordBreak,
          width: `${tableWidth}px`,
          zoom,
        }}
      >
        <thead ref={theadRef}>
          {reactTable.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="header">
              {headerGroup.headers.map((header) => {
                const isMetadataCol =
                  header.column.id.startsWith('Variable') ||
                  header.column.id.startsWith('TransformVar_') ||
                  header.column.id === 'description';
                const isFinalRow = headerGroup.depth === 1;

                return (
                  <th
                    key={header.id}
                    tabIndex={0}
                    colSpan={header.colSpan}
                    style={{
                      width: header.getSize(),
                      borderBottom: !isMetadataCol && isFinalRow ? '2px solid #888' : 'none',
                      height: isFinalRow ? 'fit-content' : 'auto',
                    }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                    <div
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      className={`resizer ${header.column.getIsResizing() ? 'isResizing' : ''}`}
                    />
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
      </table>
    </div>
  );
}

function ResultsTable({
  maxTextLength,
  columnVisibility,
  wordBreak,
  filterMode,
  failureFilter,
  debouncedSearchText,
  showStats,
  onFailureFilterToggle,
  zoom,
}: ResultsTableProps) {
  'use no memo';
  const {
    evalId,
    table,
    setTable,
    config,
    version,
    filteredResultsCount,
    fetchEvalData,
    isFetching,
    filters,
  } = useTableStore();
  const { inComparisonMode, comparisonEvalIds } = useResultsViewSettingsStore();
  const { setFilterMode } = useFilterMode();

  const { showToast } = useToast();
  const navigate = useNavigate();

  invariant(table, 'Table should be defined');
  const { head, body } = table;

  const isRedteam = React.useMemo(() => {
    return config?.redteam !== undefined;
  }, [config?.redteam]);

  const visiblePromptCount = React.useMemo(
    () => head.prompts.filter((_, idx) => columnVisibility[`Prompt ${idx + 1}`] !== false).length,
    [head.prompts, columnVisibility],
  );

  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  const [lightboxImage, setLightboxImage] = React.useState<string | null>(null);
  const [pagination, setPagination] = React.useState<{ pageIndex: number; pageSize: number }>({
    pageIndex: 0,
    pageSize: filteredResultsCount > 10 ? 50 : 10,
  });

  // Persist column sizing state to prevent header resize flicker during pagination.
  // Without this, column widths reset when columns memo recalculates (due to deps like passRates changing).
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>({});

  /**
   * Reset the pagination state when the filtered results count changes.
   */
  React.useEffect(() => {
    setPagination({
      pageIndex: 0,
      pageSize: filteredResultsCount > 10 ? 50 : 10,
    });
  }, [filteredResultsCount]);

  const toggleLightbox = (url?: string) => {
    setLightboxImage(url || null);
    setLightboxOpen(!lightboxOpen);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  const handleRating = React.useCallback(
    async (
      rowIndex: number,
      promptIndex: number,
      resultId: string,
      isPass?: boolean | null,
      score?: number,
      comment?: string,
    ) => {
      const updatedData = [...body];
      const updatedRow = { ...updatedData[rowIndex] };
      const updatedOutputs = [...updatedRow.outputs];
      const existingOutput = updatedOutputs[promptIndex];

      let componentResults = existingOutput.gradingResult?.componentResults;
      let modifiedComponentResults = false;
      let finalPass = existingOutput.pass;
      let finalScore = existingOutput.score;

      // Update finalScore first if score parameter is provided
      if (typeof score !== 'undefined') {
        finalScore = score;
      } else if (typeof isPass !== 'undefined' && isPass !== null) {
        // Only default to 0/1 if no explicit score is provided and isPass is not null
        finalScore = isPass ? 1 : 0;
      }

      if (typeof isPass !== 'undefined') {
        // Make a copy to avoid mutating the original
        componentResults = [...(componentResults || [])];
        modifiedComponentResults = true;

        const humanResultIndex = componentResults.findIndex(
          (result) => result.assertion?.type === HUMAN_ASSERTION_TYPE,
        );

        // If isPass is null, remove the human assertion (unset manual grading)
        if (isPass === null) {
          if (humanResultIndex !== -1) {
            componentResults.splice(humanResultIndex, 1);
          }
          // Recalculate pass/score from remaining assertions
          if (componentResults.length > 0) {
            const passCount = componentResults.filter((r) => r.pass).length;
            finalPass = passCount === componentResults.length;
            // Calculate average score from remaining assertions
            const scores = componentResults
              .map((r) => r.score)
              .filter((s) => typeof s === 'number');
            if (scores.length > 0) {
              finalScore = scores.reduce((a, b) => a + b, 0) / scores.length;
            }
          }
        } else {
          // Add or update the human assertion
          finalPass = isPass;

          const newResult = {
            pass: finalPass,
            score: finalScore,
            reason: 'Manual result (overrides all other grading results)',
            comment,
            assertion: { type: HUMAN_ASSERTION_TYPE },
          };

          if (humanResultIndex === -1) {
            componentResults.push(newResult);
          } else {
            componentResults[humanResultIndex] = newResult;
          }
        }
      }

      updatedOutputs[promptIndex].pass = finalPass;
      updatedOutputs[promptIndex].score = finalScore;

      // Build gradingResult, ensuring required fields are always present
      // Destructure to exclude componentResults initially
      const { componentResults: _, ...existingGradingResultWithoutComponents } =
        existingOutput.gradingResult || {};

      const gradingResult: GradingResult = {
        // Copy over existing fields except componentResults
        ...existingGradingResultWithoutComponents,
        // Ensure required fields have valid values
        pass: existingOutput.gradingResult?.pass ?? finalPass,
        score: existingOutput.gradingResult?.score ?? finalScore,
        reason: existingOutput.gradingResult?.reason ?? 'Manual result',
        // Always update comment
        comment,
      };

      // Only update pass/score/reason/assertion if we're actually rating (not just commenting)
      if (typeof isPass !== 'undefined' || typeof score !== 'undefined') {
        gradingResult.pass = finalPass;
        gradingResult.score = finalScore;
        gradingResult.reason = 'Manual result (overrides all other grading results)';
        if (existingOutput.gradingResult?.assertion) {
          gradingResult.assertion = existingOutput.gradingResult.assertion;
        }
      }

      // Only include componentResults if we modified them, or if we didn't modify them but they exist and are not empty
      if (modifiedComponentResults && componentResults) {
        gradingResult.componentResults = componentResults;
      } else if (
        !modifiedComponentResults &&
        existingOutput.gradingResult?.componentResults &&
        existingOutput.gradingResult.componentResults.length > 0
      ) {
        gradingResult.componentResults = existingOutput.gradingResult.componentResults;
      }

      updatedOutputs[promptIndex].gradingResult = gradingResult;
      updatedRow.outputs = updatedOutputs;
      updatedData[rowIndex] = updatedRow;
      const newTable: EvaluateTable = {
        head,
        body: updatedData,
      };

      setTable(newTable);
      if (inComparisonMode) {
        showToast('Ratings are not saved in comparison mode', 'warning');
      } else {
        try {
          let response;
          if (version && version >= 4) {
            response = await callApi(`/eval/${evalId}/results/${resultId}/rating`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ ...gradingResult }),
            });
          } else {
            response = await callApi(`/eval/${evalId}`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ table: newTable }),
            });
          }
          if (!response.ok) {
            throw new Error('Network response was not ok');
          }
        } catch (error) {
          console.error('Failed to update table:', error);
        }
      }
    },
    [body, head, setTable, evalId, inComparisonMode, showToast],
  );

  const tableBody = React.useMemo(() => {
    return body.map((row, rowIndex) => ({
      ...row,
      outputs: row.outputs.map((output, promptIndex) => ({
        ...output,
        originalRowIndex: rowIndex,
        originalPromptIndex: promptIndex,
      })),
    })) as ExtendedEvaluateTableRow[];
  }, [body]);

  const parseQueryParams = (queryString: string) => {
    return Object.fromEntries(new URLSearchParams(queryString));
  };

  // Create a stable reference for applied filters to avoid unnecessary re-renders
  const appliedFiltersString = React.useMemo(() => {
    const appliedFilters = Object.values(filters.values)
      .filter((filter) => {
        // For metadata filters with exists operator, only field is required
        if (filter.type === 'metadata' && filter.operator === 'exists') {
          return Boolean(filter.field);
        }
        // For other metadata operators, both field and value are required
        if (filter.type === 'metadata') {
          return Boolean(filter.value && filter.field);
        }
        // For metric filters with is_defined operator, only field is required
        if (filter.type === 'metric' && filter.operator === 'is_defined') {
          return Boolean(filter.field);
        }
        // For metric filters with comparison operators, both field and value are required
        if (filter.type === 'metric') {
          return Boolean(filter.value && filter.field);
        }
        // For non-metadata/non-metric filters, value is required
        return Boolean(filter.value);
      })
      .sort((a, b) => a.sortIndex - b.sortIndex); // Sort by sortIndex for stability
    // Create a stable string representation of applied filters
    return JSON.stringify(
      appliedFilters.map((f) => ({
        type: f.type,
        operator: f.operator,
        value: f.value,
        field: f.field,
        logicOperator: f.logicOperator,
        sortIndex: f.sortIndex, // Include sortIndex for complete representation
      })),
    );
  }, [filters.values]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  React.useEffect(() => {
    // Use functional update to avoid stale closure over pagination state
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, [failureFilter, filterMode, debouncedSearchText, appliedFiltersString]);

  // Add a ref to track the current evalId to compare with new values
  const previousEvalIdRef = useRef<string | null>(null);

  // Reset pagination when evalId changes. Do not mark previousEvalIdRef here to
  // allow the fetch effect to skip the first fetch after an eval switch.
  React.useEffect(() => {
    if (evalId !== previousEvalIdRef.current) {
      // Use functional update to avoid stale closure over pagination state
      setPagination((prev) => ({ pageIndex: 0, pageSize: prev.pageSize }));

      // Don't fetch here - the parent component (Eval.tsx) is responsible
      // for the initial data load when changing evalId
    }
  }, [evalId]);

  // Only fetch data when pagination or filters change, but not when evalId changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  React.useEffect(() => {
    if (!evalId) {
      return;
    }

    // Skip fetching if this is the first render for a new evalId
    // Data should already be loaded by Eval.tsx
    if (pagination.pageIndex === 0 && evalId !== previousEvalIdRef.current) {
      previousEvalIdRef.current = evalId;
      return;
    }

    fetchEvalData(evalId, {
      pageIndex: pagination.pageIndex,
      pageSize: pagination.pageSize,
      filterMode,
      searchText: debouncedSearchText,
      // Only pass the filters that have been applied.
      // For metadata filters with exists operator, only field is required.
      // For other metadata operators, both field and value are required.
      // For metric filters with is_defined operator, only field is required.
      // For metric filters with comparison operators, both field and value are required.
      // For non-metadata/non-metric filters, value is required.
      filters: Object.values(filters.values).filter((filter) => {
        if (filter.type === 'metadata' && filter.operator === 'exists') {
          return Boolean(filter.field);
        }
        if (filter.type === 'metadata') {
          return Boolean(filter.value && filter.field);
        }
        if (filter.type === 'metric' && filter.operator === 'is_defined') {
          return Boolean(filter.field);
        }
        if (filter.type === 'metric') {
          return Boolean(filter.value && filter.field);
        }
        return Boolean(filter.value);
      }),
      skipSettingEvalId: true, // Don't change evalId when paginating or filtering
    });
  }, [
    // evalId is NOT in the dependency array
    pagination.pageIndex,
    pagination.pageSize,
    filterMode,
    comparisonEvalIds,
    debouncedSearchText,
    fetchEvalData,
    appliedFiltersString, // Use the stable string representation instead of filters.values
    // Removed filters.appliedCount since appliedFiltersString covers it
  ]);

  const testCounts = useTestCounts();
  const passingTestCounts = usePassingTestCounts();
  const passRates = usePassRates();
  const getMetrics = useMetricsGetter();

  const numAsserts = React.useMemo(
    () =>
      head.prompts.map((_, idx) => {
        const { total: metrics } = getMetrics(idx);
        return (metrics?.assertFailCount ?? 0) + (metrics?.assertPassCount ?? 0);
      }),
    [head.prompts, getMetrics],
  );

  const numGoodAsserts = React.useMemo(
    () =>
      head.prompts.map((_, idx) => {
        const { total: metrics } = getMetrics(idx);
        return metrics?.assertPassCount || 0;
      }),
    [head.prompts, getMetrics],
  );

  const columnHelper = React.useMemo(() => createColumnHelper<EvaluateTableRow>(), []);

  const { renderMarkdown } = useResultsViewSettingsStore();
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  const variableColumns = React.useMemo(() => {
    if (head.vars.length > 0) {
      const injectVarName = config?.redteam?.injectVar || 'prompt';

      return [
        columnHelper.group({
          id: 'vars',
          header: () => <span className="font-bold">Variables</span>,
          columns: head.vars.map((varName, idx) =>
            columnHelper.accessor((row: EvaluateTableRow) => row.vars[idx], {
              id: `Variable ${idx + 1}`,
              header: () => (
                <TableHeader text={varName} maxLength={maxTextLength} className="font-bold" />
              ),
              cell: (info: CellContext<EvaluateTableRow, string>) => {
                let value: string | object = info.getValue();
                const _originalValue = value; // Store original value for tooltip
                const row = info.row.original;

                // For red team evals and dynamic prompts, show the actual prompt sent to the model
                // Priority: 1) response.prompt (provider-reported), 2) redteamFinalPrompt (legacy)
                if (varName === injectVarName) {
                  // Check all outputs to find one with provider-reported prompt or redteamFinalPrompt
                  for (const output of row.outputs || []) {
                    const actualPrompt = getActualPrompt(output?.response);
                    if (actualPrompt) {
                      value = actualPrompt;
                      break;
                    }
                  }
                }

                // For variables like embeddedInjection, check transformDisplayVars as fallback
                // This handles layer mode where embeddedInjection is in transformDisplayVars, not vars
                if (!value || value === '') {
                  for (const output of row.outputs || []) {
                    const transformVars = output?.metadata?.transformDisplayVars as
                      | Record<string, string>
                      | undefined;
                    if (transformVars?.[varName]) {
                      value = transformVars[varName];
                      break;
                    }
                  }
                }

                // Get first output for file metadata check
                const output = row.outputs && row.outputs.length > 0 ? row.outputs[0] : null;

                const fileMetadata = output?.metadata?.[FILE_METADATA_KEY] as
                  | Record<string, { path: string; type: string; format?: string }>
                  | undefined;
                const isMediaFile = fileMetadata && fileMetadata[varName];

                if (isMediaFile && typeof value === 'string') {
                  // Handle various media types
                  const mediaMetadata = fileMetadata[varName];
                  const mediaType = mediaMetadata.type;
                  const format = mediaMetadata.format || '';
                  const normalizedValue = normalizeMediaText(value);
                  const audioSource =
                    mediaType === 'audio'
                      ? resolveAudioSource({ data: value, format, blobRef: value })
                      : null;
                  const imageSrc =
                    mediaType === 'image'
                      ? resolveImageSource({ data: value, format, blobRef: value })
                      : undefined;

                  let mediaElement = null;

                  if (mediaType === 'audio' && audioSource) {
                    mediaElement = (
                      <audio controls style={{ maxWidth: '100%' }}>
                        <source src={audioSource.src} type={audioSource.type || 'audio/mpeg'} />
                        Your browser does not support the audio element.
                      </audio>
                    );
                  } else if (mediaType === 'video') {
                    const mediaSrc =
                      normalizedValue.startsWith('data:') ||
                      normalizedValue.startsWith('http') ||
                      normalizedValue.startsWith('/api/')
                        ? normalizedValue
                        : `data:${mediaType}/${format};base64,${value}`;

                    mediaElement = (
                      <video controls style={{ maxWidth: '100%', maxHeight: '200px' }}>
                        <source src={mediaSrc} type={`video/${format || 'mp4'}`} />
                        Your browser does not support the video element.
                      </video>
                    );
                  } else if (mediaType === 'image' && imageSrc) {
                    mediaElement = (
                      <img
                        src={imageSrc}
                        alt="Input image"
                        style={{ maxWidth: '100%', maxHeight: '200px' }}
                        onClick={() => toggleLightbox?.(imageSrc)}
                      />
                    );
                  }

                  if (mediaElement) {
                    return (
                      <div className="cell">
                        <div style={{ marginBottom: '8px' }}>{mediaElement}</div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span style={{ fontSize: '0.8em', color: '#666' }}>
                              {mediaMetadata.path} ({mediaType}/{format})
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Original file path</TooltipContent>
                        </Tooltip>
                      </div>
                    );
                  }
                }

                if (typeof value === 'object') {
                  value = JSON.stringify(value, null, 2);
                  if (renderMarkdown) {
                    value = `\`\`\`json\n${value}\n\`\`\``;
                  }
                }
                // Use memoized VariableMarkdownCell to prevent re-renders when
                // table layout changes (e.g., column visibility toggles).
                // @see https://github.com/promptfoo/promptfoo/issues/969
                const cellContent = renderMarkdown ? (
                  <VariableMarkdownCell value={value} maxTextLength={maxTextLength} />
                ) : (
                  <TruncatedText text={value} maxLength={maxTextLength} />
                );

                // Determine if we should show original text (decoded) even without redteamFinalPrompt
                const testMetadata: Record<string, unknown> = row.test?.metadata || {};
                const metadataOriginal =
                  typeof testMetadata.originalText === 'string'
                    ? testMetadata.originalText
                    : undefined;
                const strategyId = testMetadata.strategyId;
                const shouldShowOriginal =
                  varName === injectVarName &&
                  typeof strategyId === 'string' &&
                  isEncodingStrategy(strategyId) &&
                  Boolean(metadataOriginal);

                // Show original text for encoding strategies
                if (shouldShowOriginal) {
                  const originalForDisplay = metadataOriginal || '';
                  // Check if value is a storage ref or base64 for audio/image
                  const isAudioContent =
                    strategyId === 'audio' ||
                    (typeof value === 'string' &&
                      (isStorageRef(value) || isBlobRef(value)) &&
                      value.includes('audio/'));
                  const isImageContent =
                    strategyId === 'image' ||
                    (typeof value === 'string' &&
                      (isStorageRef(value) || isBlobRef(value)) &&
                      value.includes('image/'));

                  return (
                    <div className="cell" data-capture="true">
                      {/* For audio: show player instead of raw base64/storageRef */}
                      {isAudioContent && typeof value === 'string' ? (
                        <div>
                          <StorageRefAudioPlayer data={value} />
                        </div>
                      ) : isImageContent ? (
                        /* For image: show image or placeholder */
                        <div>
                          {typeof value === 'string' &&
                          (isStorageRef(value) || isBlobRef(value)) ? (
                            <span className="text-xs text-muted-foreground">
                              Image preview not yet supported for storage refs
                            </span>
                          ) : (
                            cellContent
                          )}
                        </div>
                      ) : (
                        /* For other encoding strategies: show raw content */
                        cellContent
                      )}

                      {/* Show original decoded text */}
                      {originalForDisplay && (
                        <div className="mt-1.5 text-muted-foreground text-[0.8em]">
                          <strong>Original (decoded):</strong>{' '}
                          <TruncatedText
                            text={String(originalForDisplay)}
                            maxLength={maxTextLength}
                          />
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <div className="cell" data-capture="true">
                    {cellContent}
                  </div>
                );
              },
              size: VARIABLE_COLUMN_SIZE_PX,
            }),
          ),
        }),
      ];
    }
    return [];
  }, [columnHelper, head, head.vars, maxTextLength, renderMarkdown, config]);

  // Extract transformDisplayVars from output metadata (used by per-turn layer transforms like indirect-web-pwn)
  const transformDisplayVarsColumns = React.useMemo(() => {
    // Collect unique transformDisplayVars keys from all outputs
    const transformVarKeys = new Set<string>();
    tableBody.forEach((row) => {
      row.outputs?.forEach((output) => {
        const transformVars = output?.metadata?.transformDisplayVars as
          | Record<string, string>
          | undefined;
        if (transformVars) {
          Object.keys(transformVars).forEach((key) => transformVarKeys.add(key));
        }
      });
    });

    if (transformVarKeys.size === 0) {
      return [];
    }

    // Filter out keys that already exist in head.vars to avoid duplicate columns
    // This handles the case where standalone mode has embeddedInjection in vars
    // and layer mode has it in transformDisplayVars - we want one unified column
    const existingVarNames = new Set(head.vars);
    const varKeyArray = Array.from(transformVarKeys).filter((key) => !existingVarNames.has(key));

    // If all keys were filtered out (they all exist in vars), don't create a duplicate column group
    if (varKeyArray.length === 0) {
      return [];
    }

    return [
      columnHelper.group({
        id: 'transformDisplayVars',
        header: () => <span className="font-bold">Variables</span>,
        columns: varKeyArray.map((varName) =>
          columnHelper.accessor(
            (row: EvaluateTableRow) => {
              // Get the value from the first output's transformDisplayVars
              const output = row.outputs?.[0];
              const transformVars = output?.metadata?.transformDisplayVars as
                | Record<string, string>
                | undefined;
              return transformVars?.[varName] || '';
            },
            {
              id: `TransformVar_${varName}`,
              header: () => (
                <TableHeader
                  text={varName.replace(/^__/, '')} // Remove __ prefix for display
                  maxLength={maxTextLength}
                  className="font-bold"
                />
              ),
              cell: (info: CellContext<EvaluateTableRow, string>) => {
                const value = info.getValue();
                return (
                  <div className="cell">
                    <TruncatedText text={value} maxLength={maxTextLength} />
                  </div>
                );
              },
              size: VARIABLE_COLUMN_SIZE_PX,
            },
          ),
        ),
      }),
    ];
  }, [columnHelper, tableBody, maxTextLength, head.vars]);

  const getOutput = React.useCallback(
    (rowIndex: number, promptIndex: number) => {
      return tableBody[rowIndex].outputs[promptIndex];
    },
    [tableBody],
  );

  const getFirstOutput = React.useCallback(
    (rowIndex: number) => {
      return tableBody[rowIndex].outputs[0];
    },
    [tableBody],
  );

  const metricTotals = React.useMemo(() => {
    // Use the backend's already-correct namedScoresCount instead of recalculating
    const firstProvider = table?.head?.prompts?.[0];
    const backendCounts = firstProvider?.metrics?.namedScoresCount;

    if (backendCounts) {
      return backendCounts;
    }

    const totals: Record<string, number> = {};
    table?.body.forEach((row) => {
      row.test.assert?.forEach((assertion) => {
        if (assertion.metric) {
          totals[assertion.metric] = (totals[assertion.metric] || 0) + 1;
        }
        if ('assert' in assertion && Array.isArray(assertion.assert)) {
          assertion.assert.forEach((subAssertion) => {
            if ('metric' in subAssertion && subAssertion.metric) {
              totals[subAssertion.metric] = (totals[subAssertion.metric] || 0) + 1;
            }
          });
        }
      });
    });
    return totals;
  }, [table?.head?.prompts, table?.body]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  const promptColumns = React.useMemo(() => {
    return [
      columnHelper.group({
        id: 'prompts',
        header: () => <span className="font-bold">Outputs</span>,
        columns: head.prompts.map((prompt, idx) =>
          columnHelper.accessor((row: EvaluateTableRow) => formatRowOutput(row.outputs[idx]), {
            id: `Prompt ${idx + 1}`,
            header: () => {
              const pct = passRates[idx]?.total?.toFixed(2) ?? '0.00';
              const columnId = `Prompt ${idx + 1}`;
              const isChecked = failureFilter[columnId] || false;

              // Get metrics for this prompt (total and filtered)
              const { total: metrics, filtered: filteredMetrics } = getMetrics(idx);

              const details = showStats ? (
                <div className="prompt-detail collapse-hidden">
                  {metrics?.tokenUsage?.numRequests !== undefined && (
                    <div>
                      <strong>{isRedteam ? 'Probes:' : 'Requests:'}</strong>{' '}
                      {metrics.tokenUsage.numRequests}
                    </div>
                  )}
                  {numAsserts[idx] ? (
                    <div>
                      <strong>Asserts:</strong> {numGoodAsserts[idx]}/{numAsserts[idx]} passed
                    </div>
                  ) : null}
                  {metrics?.cost ? (
                    <div>
                      <strong>Total Cost:</strong>{' '}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span style={{ cursor: 'help' }}>
                            $
                            {Intl.NumberFormat(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: metrics.cost >= 1 ? 2 : 4,
                            }).format(metrics.cost)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {`Average: $${Intl.NumberFormat(undefined, {
                            minimumFractionDigits: 1,
                            maximumFractionDigits:
                              testCounts[idx]?.total && metrics.cost / testCounts[idx].total >= 1
                                ? 2
                                : 4,
                          }).format(
                            testCounts[idx]?.total ? metrics.cost / testCounts[idx].total : 0,
                          )} per test`}
                        </TooltipContent>
                      </Tooltip>
                      {filteredMetrics?.cost && testCounts[idx]?.filtered ? (
                        <span style={{ fontSize: '0.9em', color: '#666', marginLeft: '4px' }}>
                          ($
                          {Intl.NumberFormat(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: filteredMetrics.cost >= 1 ? 2 : 4,
                          }).format(filteredMetrics.cost)}{' '}
                          filtered)
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  {metrics?.tokenUsage?.total ? (
                    <div>
                      <strong>Total Tokens:</strong>{' '}
                      {Intl.NumberFormat(undefined, {
                        maximumFractionDigits: 0,
                      }).format(metrics.tokenUsage.total)}
                      {filteredMetrics?.tokenUsage?.total ? (
                        <span style={{ fontSize: '0.9em', color: '#666', marginLeft: '4px' }}>
                          (
                          {Intl.NumberFormat(undefined, {
                            maximumFractionDigits: 0,
                          }).format(filteredMetrics.tokenUsage.total)}{' '}
                          filtered)
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  {metrics?.tokenUsage?.total ? (
                    <div>
                      <strong>Avg Tokens:</strong>{' '}
                      {Intl.NumberFormat(undefined, {
                        maximumFractionDigits: 0,
                      }).format(
                        testCounts[idx]?.total
                          ? metrics.tokenUsage.total / testCounts[idx].total
                          : 0,
                      )}
                      {filteredMetrics?.tokenUsage?.total && testCounts[idx]?.filtered ? (
                        <span style={{ fontSize: '0.9em', color: '#666', marginLeft: '4px' }}>
                          (
                          {Intl.NumberFormat(undefined, {
                            maximumFractionDigits: 0,
                          }).format(
                            filteredMetrics.tokenUsage.total / testCounts[idx].filtered,
                          )}{' '}
                          filtered)
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  {metrics?.totalLatencyMs ? (
                    <div>
                      <strong>Avg Latency:</strong>{' '}
                      {Intl.NumberFormat(undefined, {
                        maximumFractionDigits: 0,
                      }).format(
                        testCounts[idx]?.total ? metrics.totalLatencyMs / testCounts[idx].total : 0,
                      )}{' '}
                      ms
                      {filteredMetrics?.totalLatencyMs && testCounts[idx]?.filtered ? (
                        <span style={{ fontSize: '0.9em', color: '#666', marginLeft: '4px' }}>
                          (
                          {Intl.NumberFormat(undefined, {
                            maximumFractionDigits: 0,
                          }).format(filteredMetrics.totalLatencyMs / testCounts[idx].filtered)}{' '}
                          ms filtered)
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  {metrics?.totalLatencyMs && metrics?.tokenUsage?.completion ? (
                    <div>
                      <strong>Tokens/Sec:</strong>{' '}
                      {metrics.totalLatencyMs > 0
                        ? Intl.NumberFormat(undefined, {
                            maximumFractionDigits: 0,
                          }).format(metrics.tokenUsage.completion / (metrics.totalLatencyMs / 1000))
                        : '0'}
                    </div>
                  ) : null}
                </div>
              ) : null;
              // Get provider string, handling both string and object formats
              const providerString =
                typeof prompt.provider === 'string'
                  ? prompt.provider
                  : typeof prompt.provider === 'object' && prompt.provider !== null
                    ? (prompt.provider as ProviderOptions).id || JSON.stringify(prompt.provider)
                    : String(prompt.provider || 'Unknown provider');

              return (
                <div className="output-header">
                  <div className="pills collapse-font-small">
                    {prompt.provider ? (
                      <div className="provider">
                        <ProviderDisplay
                          providerString={providerString}
                          providersArray={config?.providers as ProviderDef[] | undefined}
                          fallbackIndex={idx}
                        />
                      </div>
                    ) : null}
                    <div className="summary">
                      <div
                        className={`highlight ${
                          passRates[idx]?.filtered !== null
                            ? `success-${Math.round((passRates[idx].filtered ?? 0) / 20) * 20}`
                            : passRates[idx]?.total
                              ? `success-${Math.round(passRates[idx].total / 20) * 20}`
                              : 'success-0'
                        }`}
                      >
                        {passRates[idx]?.filtered !== null ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <strong>{passRates[idx].filtered?.toFixed(2)}% passing</strong> (
                                {passingTestCounts[idx]?.filtered}/{testCounts[idx]?.filtered}{' '}
                                filtered, {passingTestCounts[idx]?.total}/{testCounts[idx]?.total}{' '}
                                total)
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {`Filtered: ${passingTestCounts[idx]?.filtered}/${testCounts[idx]?.filtered} passing (${passRates[idx].filtered?.toFixed(2)}%). Total: ${passingTestCounts[idx]?.total}/${testCounts[idx]?.total} passing (${passRates[idx]?.total?.toFixed(2)}%)`}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <>
                            <strong>{pct}% passing</strong> ({passingTestCounts[idx]?.total}/
                            {testCounts[idx]?.total} cases)
                          </>
                        )}
                      </div>
                    </div>
                    {metrics?.testErrorCount && metrics.testErrorCount > 0 ? (
                      <div className="summary error-pill" onClick={() => setFilterMode('errors')}>
                        <div className="highlight fail">
                          <strong>Errors:</strong> {metrics?.testErrorCount || 0}
                        </div>
                      </div>
                    ) : null}
                    {!isRedteam &&
                    metrics?.namedScores &&
                    Object.keys(metrics.namedScores).length > 0 ? (
                      <div className="collapse-hidden">
                        <CustomMetrics
                          lookup={metrics.namedScores}
                          counts={metrics.namedScoresCount}
                          metricTotals={metricTotals}
                          onShowMore={() => setCustomMetricsDialogOpen(true)}
                        />
                      </div>
                    ) : null}
                    {/* TODO(ian): Remove backwards compatibility for prompt.provider added 12/26/23 */}
                  </div>
                  <TableHeader
                    className="prompt-container collapse-font-small"
                    text={prompt.label || prompt.display || prompt.raw}
                    expandedText={prompt.raw}
                    maxLength={maxTextLength}
                    resourceId={prompt.id}
                  />
                  {details}
                  {filterMode === 'failures' && head.prompts.length > 1 && (
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={(checked) =>
                          onFailureFilterToggle(columnId, checked === true)
                        }
                      />
                      <span>Show failures</span>
                    </label>
                  )}
                </div>
              );
            },
            cell: (info: CellContext<EvaluateTableRow, EvaluateTableOutput>) => {
              const output = getOutput(info.row.index, idx);
              return output ? (
                <ErrorBoundary
                  name={`EvalOutputCell-${info.row.index}-${idx}`}
                  fallback={
                    <div style={{ padding: '20px', color: 'red', fontSize: '12px' }}>
                      Error loading cell
                    </div>
                  }
                >
                  <EvalOutputCell
                    output={output}
                    maxTextLength={maxTextLength}
                    rowIndex={info.row.index}
                    promptIndex={idx}
                    onRating={handleRating.bind(
                      null,
                      output.originalRowIndex ?? info.row.index,
                      output.originalPromptIndex ?? idx,
                      output.id,
                    )}
                    firstOutput={getFirstOutput(info.row.index)}
                    showDiffs={filterMode === 'different' && visiblePromptCount > 1}
                    searchText={debouncedSearchText}
                    showStats={showStats}
                    evaluationId={evalId || undefined}
                    testCaseId={info.row.original.test?.metadata?.testCaseId || output.id}
                    isRedteam={isRedteam}
                  />
                </ErrorBoundary>
              ) : (
                <div style={{ padding: '20px' }}>'Test still in progress...'</div>
              );
            },
            size: PROMPT_COLUMN_SIZE_PX,
          }),
        ),
      }),
    ];
  }, [
    body.length,
    config?.providers,
    columnHelper,
    failureFilter,
    filterMode,
    getFirstOutput,
    getMetrics,
    getOutput,
    handleRating,
    head,
    head.prompts,
    maxTextLength,
    metricTotals,
    numAsserts,
    numGoodAsserts,
    onFailureFilterToggle,
    debouncedSearchText,
    showStats,
    filters.appliedCount,
    passRates,
    passingTestCounts,
    testCounts,
  ]);

  const descriptionColumn = React.useMemo(() => {
    const hasAnyDescriptions = body.some((row) => row.test.description);
    if (hasAnyDescriptions) {
      return {
        accessorFn: (row: EvaluateTableRow) => row.test.description || '',
        id: 'description',
        header: () => <span className="font-bold">Description</span>,
        cell: (info: CellContext<EvaluateTableRow, unknown>) => (
          <div className="cell">
            <TruncatedText text={String(info.getValue())} maxLength={maxTextLength} />
          </div>
        ),
        size: DESCRIPTION_COLUMN_SIZE_PX,
      };
    }
    return null;
  }, [body, maxTextLength]);

  const columns = React.useMemo(() => {
    const cols: ColumnDef<EvaluateTableRow, unknown>[] = [];
    if (descriptionColumn) {
      cols.push(descriptionColumn);
    }
    cols.push(...variableColumns, ...transformDisplayVarsColumns, ...promptColumns);
    return cols;
  }, [descriptionColumn, variableColumns, transformDisplayVarsColumns, promptColumns]);

  const pageCount = Math.ceil(filteredResultsCount / pagination.pageSize);

  const reactTable = useReactTable({
    data: tableBody,
    columns,
    columnResizeMode: 'onChange',
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount,
    state: {
      columnVisibility,
      columnSizing,
      pagination,
    },
    onColumnSizingChange: setColumnSizing,
    enableColumnResizing: true,
  });

  const { stickyHeader, setStickyHeader } = useResultsViewSettingsStore();

  const clearRowIdFromUrl = React.useCallback(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('rowId')) {
      url.searchParams.delete('rowId');
      navigate({ pathname: url.pathname, search: url.search }, { replace: true });
    }
  }, [navigate]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    const params = parseQueryParams(window.location.search);
    const rowId = params['rowId'];

    if (rowId && Number.isInteger(Number(rowId))) {
      const parsedRowId = Number(rowId);
      const rowIndex = Math.max(0, Math.min(parsedRowId - 1, filteredResultsCount - 1));

      let hasScrolled = false;

      const rowPageIndex = Math.floor(rowIndex / pagination.pageSize);

      const maxPageIndex = pageCount - 1;
      const safeRowPageIndex = Math.min(rowPageIndex, maxPageIndex);

      if (pagination.pageIndex !== safeRowPageIndex) {
        setPagination((prev) => ({
          ...prev,
          pageIndex: safeRowPageIndex,
        }));
      }

      const scrollToRow = () => {
        if (hasScrolled) {
          return;
        }

        const localRowIndex = rowIndex % pagination.pageSize;
        const rowElement = document.querySelector(`#row-${localRowIndex}`);

        if (rowElement) {
          hasScrolled = true;

          requestAnimationFrame(() => {
            rowElement.scrollIntoView({
              behavior: 'smooth',
              block: 'nearest',
            });
          });
        }
      };

      const tableContainer =
        document.querySelector('.results-table')?.parentElement || document.body;

      const observer = new MutationObserver(() => {
        if (hasScrolled) {
          observer.disconnect();
          return;
        }

        const localRowIndex = rowIndex % pagination.pageSize;
        const rowElement = document.querySelector(`#row-${localRowIndex}`);
        if (rowElement) {
          scrollToRow();
          observer.disconnect();
        }
      });

      observer.observe(tableContainer, {
        childList: true,
        subtree: true,
      });

      const timeoutId = setTimeout(() => {
        if (!hasScrolled) {
          console.warn('Timeout reached while waiting for row to be rendered');
          observer.disconnect();
        }
      }, 5000);

      return () => {
        observer.disconnect();
        clearTimeout(timeoutId);
      };
    }
  }, [pagination.pageIndex, pagination.pageSize, reactTable, filteredResultsCount]);

  // Use TanStack Table's built-in method to calculate total width of visible columns.
  // This automatically handles both column visibility changes and user-initiated column resizing.
  const tableWidth = reactTable.getTotalSize();

  // Listen for scroll events on the table container and sync the header horizontally
  const tableRef = useRef<HTMLDivElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);

  // Detect if there's minimal scroll room - in this case, disable height collapse
  // to prevent jitter feedback loop (height change affects scroll position)
  const [hasMinimalScrollRoom, setHasMinimalScrollRoom] = React.useState(false);

  const checkScrollRoom = React.useCallback(() => {
    const scrollRoom = document.documentElement.scrollHeight - window.innerHeight;
    setHasMinimalScrollRoom(scrollRoom < 150);
  }, []);

  useEffect(() => {
    checkScrollRoom();
    window.addEventListener('resize', checkScrollRoom);
    // Re-check after initial render
    const timeoutId = setTimeout(checkScrollRoom, 100);

    return () => {
      window.removeEventListener('resize', checkScrollRoom);
      clearTimeout(timeoutId);
    };
  }, [checkScrollRoom]);

  // Re-check scroll room when content changes (filtered results count affects page height)
  // biome-ignore lint/correctness/useExhaustiveDependencies: filteredResultsCount is intentionally used as a trigger to re-check scroll room when the number of rows changes
  useEffect(() => {
    checkScrollRoom();
  }, [filteredResultsCount, checkScrollRoom]);

  useEffect(() => {
    if (!tableRef.current || !theadRef.current) {
      return;
    }

    const container = tableRef.current;
    let rafId: number | null = null;

    const handleScroll = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        if (theadRef.current) {
          const xScroll = container.scrollLeft;
          theadRef.current.style.transform = `translateX(-${xScroll}px)`;
        }
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    // Initial sync
    handleScroll();
    // Keep in sync on resize
    window.addEventListener('resize', handleScroll);

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      container.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, []);

  const [customMetricsDialogOpen, setCustomMetricsDialogOpen] = React.useState(false);

  return (
    // NOTE: It's important that the JSX Fragment is the top-level element within the DOM tree
    // of this component. This ensures that the pagination footer is always pinned to the bottom
    // of the viewport (because the parent container is a flexbox).
    <>
      {filteredResultsCount === 0 &&
        !isFetching &&
        (debouncedSearchText || filterMode !== 'all' || filters.appliedCount > 0) && (
          <div className="p-5 text-center bg-black/[0.03] dark:bg-white/[0.03] rounded my-5">
            <p>No results found for the current filters.</p>
          </div>
        )}
      <div className="h-4" />
      <ResultsTableHeader
        reactTable={reactTable}
        tableWidth={tableWidth}
        maxTextLength={maxTextLength}
        wordBreak={wordBreak}
        theadRef={theadRef}
        stickyHeader={stickyHeader}
        setStickyHeader={setStickyHeader}
        hasMinimalScrollRoom={hasMinimalScrollRoom}
        zoom={zoom}
      />
      <div
        id="results-table-container"
        style={{
          zoom,
          borderTop: '1px solid',
          borderColor: stickyHeader ? 'transparent' : 'var(--border-color)',
          // Grow vertically into any empty space; this applies when total number of evals is so few that the table otherwise
          // won't extend to the bottom of the viewport.
          flexGrow: 1,
          position: 'relative',
        }}
        ref={tableRef}
      >
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center bg-background/70 z-20 transition-opacity duration-300 backdrop-blur-[2px]',
            isFetching ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
          )}
        >
          <Spinner className="size-[60px]" />
        </div>
        <table
          className={`results-table firefox-fix ${maxTextLength <= 25 ? 'compact' : ''}`}
          style={{
            wordBreak,
            width: `${tableWidth}px`,
          }}
        >
          <tbody>
            {reactTable.getRowModel().rows.map((row) => {
              let colBorderDrawn = false;

              return (
                <tr key={row.id} id={`row-${row.index % pagination.pageSize}`}>
                  {row.getVisibleCells().map((cell) => {
                    const isMetadataCol =
                      cell.column.id.startsWith('Variable') ||
                      cell.column.id.startsWith('TransformVar_') ||
                      cell.column.id === 'description';
                    const shouldDrawColBorder = !isMetadataCol && !colBorderDrawn;
                    if (shouldDrawColBorder) {
                      colBorderDrawn = true;
                    }

                    let cellContent = flexRender(cell.column.columnDef.cell, cell.getContext());
                    const value = cell.getValue();
                    const imgSrc =
                      typeof value === 'string' ? resolveImageSource(value) : undefined;
                    if (imgSrc) {
                      // If this is a variable column for the inject var, try to show the original image text
                      let originalImageText: string | undefined;
                      const columnId = String(cell.column.id);
                      const match = columnId.match(/^Variable (\d+)$/);
                      if (match) {
                        const varIdx = Number(match[1]) - 1;
                        const injectVarName = config?.redteam?.injectVar || 'prompt';
                        const varNameForCol = head.vars[varIdx];
                        if (varNameForCol === injectVarName) {
                          const testMeta: Record<string, unknown> =
                            row.original.test?.metadata || {};
                          const fromMeta =
                            typeof testMeta.originalText === 'string'
                              ? testMeta.originalText
                              : undefined;
                          const testVars: Vars = row.original.test?.vars || {};
                          const fromVars =
                            typeof testVars.image_text === 'string'
                              ? (testVars.image_text as string)
                              : undefined;
                          originalImageText = fromVars || fromMeta;
                        }
                      }

                      cellContent = (
                        <>
                          <img
                            src={imgSrc}
                            alt="Base64 encoded image"
                            style={{
                              maxWidth: '100%',
                              height: 'auto',
                              cursor: 'pointer',
                            }}
                            onClick={() => toggleLightbox(imgSrc)}
                          />
                          {lightboxOpen && lightboxImage === imgSrc && (
                            <div className="lightbox" onClick={() => toggleLightbox()}>
                              <img
                                src={lightboxImage}
                                alt="Lightbox"
                                style={{
                                  maxWidth: '90%',
                                  maxHeight: '90vh',
                                  objectFit: 'contain',
                                }}
                              />
                            </div>
                          )}
                          {originalImageText ? (
                            <div className="mt-1.5 text-muted-foreground text-[0.8em]">
                              <strong>Original (image text):</strong>{' '}
                              <TruncatedText
                                text={String(originalImageText)}
                                maxLength={maxTextLength}
                              />
                            </div>
                          ) : null}
                        </>
                      );
                    }

                    return (
                      <td
                        tabIndex={0}
                        key={cell.id}
                        style={{
                          width: cell.column.getSize(),
                        }}
                        className={`${isMetadataCol ? 'variable' : ''}${shouldDrawColBorder ? 'first-prompt-col' : 'second-prompt-column'}`}
                      >
                        {cellContent}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="pagination sticky bottom-0 z-10 flex items-center gap-4 flex-wrap justify-between bg-background border-t border-border w-screen px-4 -mx-4 shadow-lg py-2">
        <div>
          Showing{' '}
          {filteredResultsCount === 0 ? (
            <span className="font-semibold">0</span>
          ) : (
            <>
              <span className="font-semibold">
                {pagination.pageIndex * pagination.pageSize + 1}
              </span>{' '}
              to{' '}
              <span className="font-semibold">
                {Math.min((pagination.pageIndex + 1) * pagination.pageSize, filteredResultsCount)}
              </span>{' '}
              of <span className="font-semibold">{filteredResultsCount}</span>
            </>
          )}{' '}
          results
        </div>

        {filteredResultsCount > 0 && (
          <div>
            Page{' '}
            <span className="font-semibold">{reactTable.getState().pagination.pageIndex + 1}</span>{' '}
            of <span className="font-semibold">{pageCount}</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* PAGE SIZE SELECTOR */}
          <div className="flex items-center gap-2">
            <span>Results per page:</span>
            <Select
              value={String(pagination.pageSize)}
              onValueChange={(value) => {
                setPagination((prev) => ({
                  ...prev,
                  pageSize: Number(value),
                }));
                window.scrollTo(0, 0);
              }}
              disabled={filteredResultsCount <= 10}
            >
              <SelectTrigger className="w-20 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="50" disabled={filteredResultsCount <= 10}>
                  50
                </SelectItem>
                <SelectItem value="100" disabled={filteredResultsCount <= 50}>
                  100
                </SelectItem>
                <SelectItem value="500" disabled={filteredResultsCount <= 100}>
                  500
                </SelectItem>
                <SelectItem value="1000" disabled={filteredResultsCount <= 500}>
                  1000
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* PAGE NAVIGATOR */}
          <div
            className={cn(
              'flex items-center gap-2',
              pageCount <= 1 && 'opacity-50 pointer-events-none',
            )}
          >
            <span>Go to:</span>
            <NumberInput
              value={pagination.pageIndex + 1}
              onChange={(v) => {
                const page = v !== undefined ? v - 1 : null;
                if (page !== null && page >= 0 && page < pageCount) {
                  setPagination((prev) => ({
                    ...prev,
                    pageIndex: Math.min(Math.max(page, 0), pageCount - 1),
                  }));
                  clearRowIdFromUrl();
                }
              }}
              className="w-[60px] h-8 text-center"
              min={1}
              max={pageCount || 1}
              disabled={pageCount === 1}
            />
          </div>

          {/* PAGE NAVIGATION BUTTONS */}
          <div className="flex">
            <Button
              variant="outline"
              size="icon"
              className="rounded-r-none"
              onClick={() => {
                setPagination((prev) => ({
                  ...prev,
                  pageIndex: Math.max(prev.pageIndex - 1, 0),
                }));
                clearRowIdFromUrl();
                window.scrollTo(0, 0);
              }}
              disabled={reactTable.getState().pagination.pageIndex === 0}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="rounded-l-none -ml-px"
              onClick={() => {
                setPagination((prev) => ({
                  ...prev,
                  pageIndex: Math.min(prev.pageIndex + 1, pageCount - 1),
                }));
                clearRowIdFromUrl();
                window.scrollTo(0, 0);
              }}
              disabled={reactTable.getState().pagination.pageIndex + 1 >= pageCount}
            >
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
      <CustomMetricsDialog
        open={customMetricsDialogOpen}
        onClose={() => setCustomMetricsDialogOpen(false)}
      />
    </>
  );
}

export default React.memo(ResultsTable);
