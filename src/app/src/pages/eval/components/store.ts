import { callApi } from '@app/utils/api';
import { Severity } from '@promptfoo/redteam/constants';
import {
  isPolicyMetric,
  isValidPolicyObject,
  makeInlinePolicyId,
  makeDefaultPolicyName,
} from '@promptfoo/redteam/plugins/policy/utils';
import { getRiskCategorySeverityMap } from '@promptfoo/redteam/sharedFrontend';
import { convertResultsToTable } from '@promptfoo/util/convertEvalResultsToTable';
import { v4 as uuidv4 } from 'uuid';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PolicyObject, Policy } from '@promptfoo/redteam/types';
import type {
  EvalResultsFilterMode,
  EvalTableDTO,
  EvaluateSummaryV2,
  EvaluateTable,
  RedteamPluginObject,
  ResultsFile,
  UnifiedConfig,
} from '@promptfoo/types';
import type { VisibilityState } from '@tanstack/table-core';

function computeHighlightCount(table: EvaluateTable | null): number {
  if (!table) {
    return 0;
  }
  return table.body.reduce((count, row) => {
    return (
      count +
      row.outputs.filter((o) => o?.gradingResult?.comment?.trim().startsWith('!highlight')).length
    );
  }, 0);
}

function computeAvailableMetrics(table: EvaluateTable | null): string[] {
  if (!table || !table.head?.prompts) {
    return [];
  }

  const metrics = new Set<string>();
  table.head.prompts.forEach((prompt) => {
    if (prompt.metrics?.namedScores) {
      Object.keys(prompt.metrics.namedScores).forEach((metric) => {
        // Exclude policy metrics as they are handled by the separate policy filter
        if (!isPolicyMetric(metric)) {
          metrics.add(metric);
        }
      });
    }
  });

  return Array.from(metrics).sort();
}

/**
 * Extracts unique policy IDs from plugins.
 */
function buildPolicyOptions(plugins?: RedteamPluginObject[]): string[] {
  const policyIds = new Set<string>();
  plugins?.forEach((plugin) => {
    if (typeof plugin !== 'string' && plugin.id === 'policy') {
      const policy = plugin?.config?.policy;
      if (policy) {
        if (isValidPolicyObject(policy)) {
          policyIds.add(policy.id);
        } else {
          policyIds.add(makeInlinePolicyId(policy));
        }
      }
    }
  });

  return Array.from(policyIds).sort();
}

type PolicyIdToNameMap = Record<PolicyObject['id'], PolicyObject['name']>;

/**
 * Creates a mapping of policy IDs to their names for display purposes.
 * Used by the filter form to show policy names in the dropdown.
 */
function extractPolicyIdToNameMap(plugins: RedteamPluginObject[]): PolicyIdToNameMap {
  return plugins
    .filter((plugin) => typeof plugin !== 'string' && plugin.id === 'policy')
    .reduce((map: PolicyIdToNameMap, plugin, index) => {
      const policy = plugin?.config?.policy as Policy;
      if (isValidPolicyObject(policy)) {
        map[policy.id] = policy.name;
      } else {
        const id = makeInlinePolicyId(policy);
        map[id] = makeDefaultPolicyName(index);
      }
      return map;
    }, {});
}

function extractUniqueStrategyIds(strategies?: Array<string | { id: string }> | null): string[] {
  const strategyIds =
    strategies?.map((strategy) => (typeof strategy === 'string' ? strategy : strategy.id)) ?? [];

  return Array.from(new Set([...strategyIds, 'basic']));
}

/**
 * The `plugin`, `strategy`, `severity`, and `policy` filter options are only available for redteam evaluations.
 * This function conditionally constructs these based on whether the evaluation was a red team. If it was not,
 * it returns an empty object.
 *
 * @param config - The eval config
 * @param table - The eval table (needed to extract policy options from metrics)
 */
function buildRedteamFilterOptions(
  config?: Partial<UnifiedConfig> | null,
  _table?: EvaluateTable | null,
): { plugin: string[]; strategy: string[]; severity: string[]; policy: string[] } | {} {
  const isRedteam = Boolean(config?.redteam);

  // For non-redteam evaluations, don't provide redteam-specific filter options.
  // Note: This is separate from metadata filtering - if users have metadata fields
  // named "plugin", "strategy", or "severity", they can still filter on them using
  // the metadata filter type (which uses field/value pairs).
  if (!isRedteam) {
    return {};
  }

  return {
    // Deduplicate plugins (handles custom plugins)
    plugin: Array.from(
      new Set(
        config?.redteam?.plugins?.map((plugin) =>
          typeof plugin === 'string' ? plugin : plugin.id,
        ) ?? [],
      ),
    ),
    strategy: extractUniqueStrategyIds(config?.redteam?.strategies),
    severity: computeAvailableSeverities(config?.redteam?.plugins),
    policy: buildPolicyOptions(config?.redteam?.plugins),
  };
}

function computeAvailableSeverities(
  plugins?: Array<string | { id: string; severity?: string }> | null,
): string[] {
  if (!plugins || plugins.length === 0) {
    return [];
  }

  // Get the risk category severity map with any overrides from plugins
  const severityMap = getRiskCategorySeverityMap(
    plugins.map((plugin) => (typeof plugin === 'string' ? { id: plugin } : plugin)) as any,
  );

  // Extract unique severities from the map
  const severities = new Set<string>();
  Object.values(severityMap).forEach((severity) => {
    if (severity) {
      severities.add(severity);
    }
  });

  // Return sorted array of severity values (in order of criticality)
  const severityOrder = [Severity.Critical, Severity.High, Severity.Medium, Severity.Low];
  return severityOrder.filter((sev) => severities.has(sev));
}

interface FetchEvalOptions {
  pageIndex?: number;
  pageSize?: number;
  filterMode?: EvalResultsFilterMode;
  searchText?: string;
  skipSettingEvalId?: boolean;
  skipLoadingState?: boolean;
  filters?: ResultsFilter[];
}

interface ColumnState {
  selectedColumns: string[];
  columnVisibility: VisibilityState;
}

export interface PaginationState {
  pageIndex: number;
  pageSize: number;
}

export type ResultsFilterType =
  | 'metric'
  | 'metadata'
  | 'plugin'
  | 'strategy'
  | 'severity'
  | 'policy';

export type ResultsFilterOperator = 'equals' | 'contains' | 'not_contains' | 'exists';

export type ResultsFilter = {
  /**
   * A unique identifier for the filter.
   */
  id: string;
  type: ResultsFilterType;
  value: string;
  operator: ResultsFilterOperator;
  logicOperator: 'and' | 'or';
  /**
   * For metadata filters, this is the field name in the metadata object
   */
  field?: string;
  /**
   * The order in which this filter was added (for maintaining consistent ordering)
   */
  sortIndex: number;
};

interface TableState {
  evalId: string | null;
  setEvalId: (evalId: string) => void;

  author: string | null;
  setAuthor: (author: string | null) => void;

  table: EvaluateTable | null;
  setTable: (table: EvaluateTable | null) => void;
  setTableFromResultsFile: (resultsFile: ResultsFile) => void;

  config: Partial<UnifiedConfig> | null;
  setConfig: (config: Partial<UnifiedConfig> | null) => void;

  version: number | null;
  setVersion: (version: number) => void;

  filteredResultsCount: number;
  setFilteredResultsCount: (count: number) => void;

  highlightedResultsCount: number;

  totalResultsCount: number;
  setTotalResultsCount: (count: number) => void;

  fetchEvalData: (id: string, options?: FetchEvalOptions) => Promise<EvalTableDTO | null>;
  isFetching: boolean;
  isStreaming: boolean;
  setIsStreaming: (isStreaming: boolean) => void;

  shouldHighlightSearchText: boolean;

  /**
   * Adds a new filter to the filters array.
   * @param filter - The filter to add.
   */
  addFilter: (filter: {
    type: ResultsFilterType;
    operator: ResultsFilter['operator'];
    value: string;
    logicOperator?: ResultsFilter['logicOperator'];
    field?: string;
  }) => void;

  /**
   * Removes a filter from the filters array.
   * @param id - The id of the filter to remove.
   */
  removeFilter: (id: ResultsFilter['id']) => void;

  /**
   * Removes all filters from the filters array.
   */
  removeAllFilters: () => void;

  /**
   * Resets all filters to their initial state.
   */
  resetFilters: () => void;

  /**
   * Updates a filter in the filters array.
   * @param filter - The filter to update.
   */
  updateFilter: (filter: ResultsFilter) => void;

  /**
   * Updates the logic operator for all filters
   * @param logicOperator - The logic operator to set for all filters
   */
  updateAllFilterLogicOperators: (logicOperator: ResultsFilter['logicOperator']) => void;

  filters: {
    /**
     * The filters that are currently defined. Note that a filter is only applied once it has
     * a non-empty string value defined.
     */
    values: Record<ResultsFilter['id'], ResultsFilter>;
    /**
     * The number of filters that have a value i.e. they're applied.
     */
    appliedCount: number;
    /**
     * The options for each filter type.
     */
    options: {
      metric: string[];
      metadata: string[];
      // Redteam-specific filter options are only available for redteam evaluations.
      plugin?: string[];
      strategy?: string[];
      severity?: string[];
      policy?: string[];
    };
    /**
     * Mapping of policy IDs to their names for display purposes.
     */
    policyIdToNameMap?: Record<string, string | undefined>;
  };

  /**
   * Metadata keys for dropdown population
   */
  metadataKeys: string[];
  metadataKeysLoading: boolean;
  metadataKeysError: boolean;
  fetchMetadataKeys: (id: string) => Promise<string[]>;
  currentMetadataKeysRequest: AbortController | null;

  filterMode: EvalResultsFilterMode;
  setFilterMode: (filterMode: EvalResultsFilterMode) => void;
  resetFilterMode: () => void;
}

interface SettingsState {
  maxTextLength: number;
  setMaxTextLength: (maxTextLength: number) => void;
  wordBreak: 'break-word' | 'break-all';
  setWordBreak: (wordBreak: 'break-word' | 'break-all') => void;
  showInferenceDetails: boolean;
  setShowInferenceDetails: (showInferenceDetails: boolean) => void;
  renderMarkdown: boolean;
  setRenderMarkdown: (renderMarkdown: boolean) => void;
  prettifyJson: boolean;
  setPrettifyJson: (prettifyJson: boolean) => void;
  showPrompts: boolean;
  setShowPrompts: (showPrompts: boolean) => void;
  showPassFail: boolean;
  setShowPassFail: (showPassFail: boolean) => void;

  inComparisonMode: boolean;
  setInComparisonMode: (inComparisonMode: boolean) => void;
  comparisonEvalIds: string[];
  setComparisonEvalIds: (comparisonEvalIds: string[]) => void;
  stickyHeader: boolean;
  setStickyHeader: (stickyHeader: boolean) => void;

  columnStates: Record<string, ColumnState>;
  setColumnState: (evalId: string, state: ColumnState) => void;

  maxImageWidth: number;
  setMaxImageWidth: (maxImageWidth: number) => void;
  maxImageHeight: number;
  setMaxImageHeight: (maxImageHeight: number) => void;
}

export const useResultsViewSettingsStore = create<SettingsState>()(
  persist(
    (set, _get) => ({
      maxTextLength: 250,
      setMaxTextLength: (maxTextLength: number) => set(() => ({ maxTextLength })),
      wordBreak: 'break-word',
      setWordBreak: (wordBreak: 'break-word' | 'break-all') => set(() => ({ wordBreak })),
      showInferenceDetails: true,
      setShowInferenceDetails: (showInferenceDetails: boolean) =>
        set(() => ({ showInferenceDetails })),
      renderMarkdown: false,
      setRenderMarkdown: (renderMarkdown: boolean) => set(() => ({ renderMarkdown })),
      prettifyJson: false,
      setPrettifyJson: (prettifyJson: boolean) => set(() => ({ prettifyJson })),
      showPrompts: false,
      setShowPrompts: (showPrompts: boolean) => set(() => ({ showPrompts })),
      showPassFail: true,
      setShowPassFail: (showPassFail: boolean) => set(() => ({ showPassFail })),

      inComparisonMode: false,
      setInComparisonMode: (inComparisonMode: boolean) => set(() => ({ inComparisonMode })),
      comparisonEvalIds: [],
      setComparisonEvalIds: (comparisonEvalIds: string[]) => set(() => ({ comparisonEvalIds })),
      stickyHeader: true,
      setStickyHeader: (stickyHeader: boolean) => set(() => ({ stickyHeader })),

      columnStates: {},
      setColumnState: (evalId: string, state: ColumnState) =>
        set((prevState) => ({
          columnStates: {
            ...prevState.columnStates,
            [evalId]: state,
          },
        })),

      maxImageWidth: 256,
      setMaxImageWidth: (maxImageWidth: number) => set(() => ({ maxImageWidth })),
      maxImageHeight: 256,
      setMaxImageHeight: (maxImageHeight: number) => set(() => ({ maxImageHeight })),
    }),
    // Default storage is localStorage
    { name: 'eval-settings' },
  ),
);

// Helper function to determine if a filter is applied
const isFilterApplied = (filter: Partial<ResultsFilter> | ResultsFilter): boolean => {
  if (filter.type === 'metadata') {
    // For metadata filters with exists operator, only field is required
    if (filter.operator === 'exists') {
      return Boolean(filter.field);
    }
    // For other metadata operators, both field and value are required
    return Boolean(filter.value && filter.field);
  }
  // For non-metadata filters, value is required
  return Boolean(filter.value);
};

export const useTableStore = create<TableState>()((set, get) => ({
  evalId: null,
  setEvalId: (evalId: string) => set(() => ({ evalId })),

  author: null,
  setAuthor: (author: string | null) => set(() => ({ author })),

  version: null,
  setVersion: (version: number) => set(() => ({ version })),

  table: null,

  /**
   * Note: This method is only used when ratings are updated; therefore filters
   * are not updated.
   */
  setTable: (table: EvaluateTable | null) => {
    set((prevState) => ({
      table,
      highlightedResultsCount: computeHighlightCount(table),
      filters: prevState.filters,
    }));
  },

  setTableFromResultsFile: (resultsFile: ResultsFile) => {
    if (resultsFile.version && resultsFile.version >= 4) {
      const table = convertResultsToTable(resultsFile);

      set((prevState) => ({
        table,
        version: resultsFile.version,
        highlightedResultsCount: computeHighlightCount(table),
        filters: {
          ...prevState.filters,
          options: {
            metric: computeAvailableMetrics(table),
            metadata: [],
            ...buildRedteamFilterOptions(resultsFile.config, table),
          },
          policyIdToNameMap: extractPolicyIdToNameMap(resultsFile.config.redteam?.plugins ?? []),
        },
      }));
    } else {
      const results = resultsFile.results as EvaluateSummaryV2;
      set((prevState) => ({
        table: results.table,
        version: resultsFile.version,
        highlightedResultsCount: computeHighlightCount(results.table),
        filters: {
          ...prevState.filters,
          options: {
            metric: computeAvailableMetrics(results.table),
            metadata: [],
            ...buildRedteamFilterOptions(resultsFile.config, results.table),
          },
          policyIdToNameMap: extractPolicyIdToNameMap(resultsFile.config.redteam?.plugins ?? []),
        },
      }));
    }
  },
  config: null,
  setConfig: (config: Partial<UnifiedConfig> | null) => set(() => ({ config })),

  filteredResultsCount: 0,
  setFilteredResultsCount: (count: number) => set(() => ({ filteredResultsCount: count })),
  totalResultsCount: 0,
  setTotalResultsCount: (count: number) => set(() => ({ totalResultsCount: count })),

  highlightedResultsCount: 0,

  isFetching: false,
  isStreaming: false,
  setIsStreaming: (isStreaming: boolean) => set(() => ({ isStreaming })),

  shouldHighlightSearchText: false,

  fetchEvalData: async (id: string, options: FetchEvalOptions = {}) => {
    const {
      pageIndex = 0,
      pageSize = 50,
      // Default to current store value to keep initial load consistent with UI state
      filterMode = get().filterMode,
      searchText = '',
      skipSettingEvalId = false,
      skipLoadingState = false,
      filters = [],
    } = options;

    const { comparisonEvalIds } = useResultsViewSettingsStore.getState();

    // Cancel any existing metadata keys request and reset state for new eval
    const currentState = get();
    if (currentState.currentMetadataKeysRequest) {
      currentState.currentMetadataKeysRequest.abort();
    }

    set({
      isFetching: skipLoadingState ? get().isFetching : true,
      shouldHighlightSearchText: false,
      // Clear previous metadata keys to prevent memory accumulation
      metadataKeys: [],
      metadataKeysLoading: false,
      metadataKeysError: false,
      currentMetadataKeysRequest: null,
    });

    try {
      console.log(`Fetching data for eval ${id} with options:`, options);

      const url = new URL(
        `/eval/${id}/table`,
        // URL constructor expects a valid url
        window.location.origin,
      );

      url.searchParams.set('offset', (pageIndex * pageSize).toString());
      url.searchParams.set('limit', pageSize.toString());
      url.searchParams.set('filterMode', filterMode);

      comparisonEvalIds.forEach((evalId) => {
        url.searchParams.append('comparisonEvalIds', evalId);
      });

      if (searchText) {
        url.searchParams.set('search', searchText);
      }

      filters.forEach((filter) => {
        url.searchParams.append(
          'filter',
          JSON.stringify({
            logicOperator: filter.logicOperator,
            type: filter.type,
            operator: filter.operator,
            value: filter.value,
            field: filter.field,
          }),
        );
      });

      const resp = await callApi(
        // Remove the origin as it was only added to satisfy the URL constructor.
        url
          .toString()
          .replace(window.location.origin, ''),
      );

      if (resp.ok) {
        const data = (await resp.json()) as EvalTableDTO;

        set((prevState) => ({
          table: data.table,
          filteredResultsCount: data.filteredCount,
          totalResultsCount: data.totalCount,
          highlightedResultsCount: computeHighlightCount(data.table),
          config: data.config,
          version: data.version,
          author: data.author,
          evalId: skipSettingEvalId ? get().evalId : id,
          isFetching: skipLoadingState ? prevState.isFetching : false,
          shouldHighlightSearchText: searchText !== '',
          filters: {
            ...prevState.filters,
            options: {
              metric: computeAvailableMetrics(data.table),
              metadata: [],
              ...buildRedteamFilterOptions(data.config, data.table),
            },
            policyIdToNameMap: extractPolicyIdToNameMap(data.config?.redteam?.plugins ?? []),
          },
        }));

        // Metadata keys will be fetched lazily when user opens metadata filter dropdown

        return data;
      }

      if (!skipLoadingState) {
        set({ isFetching: false });
      }
      return null;
    } catch (error) {
      console.error('Error fetching eval data:', error);
      set({
        isFetching: skipLoadingState ? get().isFetching : false,
        isStreaming: false,
        metadataKeysLoading: false,
        currentMetadataKeysRequest: null,
      });
      return null;
    }
  },

  filters: {
    values: {},
    appliedCount: 0,
    options: {
      metric: [],
      metadata: [],
    },
  },

  addFilter: (filter) => {
    const filterId = uuidv4();

    set((prevState) => {
      const isApplied = isFilterApplied(filter);
      const appliedCount = prevState.filters.appliedCount + (isApplied ? 1 : 0);

      // Calculate the next sortIndex
      const existingFilters = Object.values(prevState.filters.values);
      const maxSortIndex =
        existingFilters.length > 0 ? Math.max(...existingFilters.map((f) => f.sortIndex)) : -1;
      const nextSortIndex = maxSortIndex + 1;

      return {
        filters: {
          ...prevState.filters,
          values: {
            ...prevState.filters.values,
            [filterId]: {
              ...filter,
              id: filterId,
              // Default to 'and' logic operator if not provided.
              logicOperator: filter.logicOperator ?? 'and',
              // Include field for metadata filters
              field: filter.field,
              sortIndex: nextSortIndex,
            },
          },
          appliedCount,
        },
      };
    });
  },

  removeFilter: (id: ResultsFilter['id']) => {
    set((prevState) => {
      const target = prevState.filters.values[id];
      const wasApplied = isFilterApplied(target);
      const appliedCount = prevState.filters.appliedCount - (wasApplied ? 1 : 0);
      const values = { ...prevState.filters.values };
      delete values[id];

      // Always reassign sortIndex values to ensure consecutive ordering (0, 1, 2, ...)
      // This ensures that when any filter is removed, the remaining filters maintain proper ordering
      const remainingFilters = Object.values(values).sort((a, b) => a.sortIndex - b.sortIndex);
      remainingFilters.forEach((filter, index) => {
        values[filter.id] = {
          ...filter,
          sortIndex: index,
        };
      });

      return {
        filters: {
          ...prevState.filters,
          values,
          appliedCount,
        },
      };
    });
  },

  removeAllFilters: () => {
    set((prevState) => ({
      filters: {
        ...prevState.filters,
        values: {},
        appliedCount: 0,
      },
    }));
  },

  resetFilters: () => {
    set((prevState) => ({
      filters: {
        ...prevState.filters,
        values: {},
        appliedCount: 0,
      },
    }));
  },

  updateFilter: (filter: ResultsFilter) => {
    set((prevState) => {
      const target = prevState.filters.values[filter.id];
      const targetWasApplied = isFilterApplied(target);
      const filterIsApplied = isFilterApplied(filter);
      const appliedCount =
        prevState.filters.appliedCount - (targetWasApplied ? 1 : 0) + (filterIsApplied ? 1 : 0);

      return {
        filters: {
          ...prevState.filters,
          values: {
            ...prevState.filters.values,
            [filter.id]: filter,
          },
          appliedCount,
        },
      };
    });
  },

  updateAllFilterLogicOperators: (logicOperator: ResultsFilter['logicOperator']) => {
    set((prevState) => {
      const updatedValues: Record<string, ResultsFilter> = {};
      Object.entries(prevState.filters.values).forEach(([id, filter]) => {
        updatedValues[id] = { ...filter, logicOperator };
      });
      return {
        filters: {
          ...prevState.filters,
          values: updatedValues,
        },
      };
    });
  },

  // Metadata keys implementation
  metadataKeys: [],
  metadataKeysLoading: false,
  metadataKeysError: false,
  currentMetadataKeysRequest: null,

  fetchMetadataKeys: async (id: string) => {
    // Cancel any existing request to prevent race conditions
    const currentState = get();
    if (currentState.currentMetadataKeysRequest) {
      currentState.currentMetadataKeysRequest.abort();
    }

    const abortController = new AbortController();

    // Add timeout to prevent hanging requests
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, 30000); // 30 second timeout

    set({
      currentMetadataKeysRequest: abortController,
      metadataKeysLoading: true,
      metadataKeysError: false,
    });

    try {
      // Get comparison eval IDs from settings store
      const { comparisonEvalIds } = useResultsViewSettingsStore.getState();

      // Build URL with comparison eval IDs as query params
      const url = new URL(`/eval/${id}/metadata-keys`, window.location.origin);
      comparisonEvalIds.forEach((compId) => {
        url.searchParams.append('comparisonEvalIds', compId);
      });

      const resp = await callApi(url.toString().replace(window.location.origin, ''), {
        signal: abortController.signal,
      });

      // Clear timeout on successful response
      clearTimeout(timeoutId);

      if (resp.ok) {
        const data = await resp.json();

        // Check if this request is still current before updating state
        const latestState = get();
        if (latestState.currentMetadataKeysRequest === abortController) {
          set({
            metadataKeys: data.keys,
            metadataKeysLoading: false,
            currentMetadataKeysRequest: null,
          });
        }
        return data.keys;
      } else {
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      }
    } catch (error) {
      // Always clear timeout
      clearTimeout(timeoutId);

      if ((error as Error).name === 'AbortError') {
        // Request was aborted - clean up state but don't show error
        const latestState = get();
        if (latestState.currentMetadataKeysRequest === abortController) {
          set({
            metadataKeysLoading: false,
            currentMetadataKeysRequest: null,
          });
        }
      } else {
        // Actual error occurred - only update if this is still the current request
        console.error('Error fetching metadata keys:', error);
        const latestState = get();
        if (latestState.currentMetadataKeysRequest === abortController) {
          set({
            metadataKeysError: true,
            metadataKeysLoading: false,
            currentMetadataKeysRequest: null,
          });
        }
      }
    }
    return [];
  },

  filterMode: 'all',
  setFilterMode: (filterMode: EvalResultsFilterMode) =>
    set((prevState) => ({ ...prevState, filterMode })),
  resetFilterMode: () => set((prevState) => ({ ...prevState, filterMode: 'all' })),
}));
