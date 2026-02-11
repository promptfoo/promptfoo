import { HIDDEN_METADATA_KEYS } from '@app/constants';
import { callApi } from '@app/utils/api';
import { Severity } from '@promptfoo/redteam/constants';
import {
  isPolicyMetric,
  isValidPolicyObject,
  makeDefaultPolicyName,
  makeInlinePolicyId,
} from '@promptfoo/redteam/plugins/policy/utils';
import { getRiskCategorySeverityMap } from '@promptfoo/redteam/sharedFrontend';
import { convertResultsToTable } from '@promptfoo/util/convertEvalResultsToTable';
import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import { hasHumanRating } from './utils';
import type { Policy, PolicyObject } from '@promptfoo/redteam/types';
import type {
  EvalResultsFilterMode,
  EvalTableDTO,
  EvaluateStats,
  EvaluateSummaryV2,
  EvaluateTable,
  PromptMetrics,
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

/**
 * Counts the number of outputs that have been manually rated by users.
 * A result is considered user-rated if it has a componentResult with assertion.type === 'human'.
 */
function computeUserRatedCount(table: EvaluateTable | null): number {
  if (!table) {
    return 0;
  }
  return table.body.reduce((count, row) => {
    return count + row.outputs.filter(hasHumanRating).length;
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
async function buildPolicyOptions(plugins?: RedteamPluginObject[]): Promise<string[]> {
  const policyIds = new Set<string>();

  if (plugins) {
    for (const plugin of plugins) {
      if (typeof plugin !== 'string' && plugin.id === 'policy') {
        const policy = plugin?.config?.policy;
        if (policy) {
          if (isValidPolicyObject(policy)) {
            policyIds.add(policy.id);
          } else {
            policyIds.add(await makeInlinePolicyId(policy));
          }
        }
      }
    }
  }

  return Array.from(policyIds).sort();
}

type PolicyIdToNameMap = Record<PolicyObject['id'], PolicyObject['name']>;

/**
 * Creates a mapping of policy IDs to their names for display purposes.
 * Used by the filter form to show policy names in the dropdown.
 */
async function extractPolicyIdToNameMap(
  plugins: RedteamPluginObject[],
): Promise<PolicyIdToNameMap> {
  const map: PolicyIdToNameMap = {};
  const policyPlugins = plugins.filter(
    (plugin) => typeof plugin !== 'string' && plugin.id === 'policy',
  );

  for (let index = 0; index < policyPlugins.length; index++) {
    const plugin = policyPlugins[index];
    const policy = plugin?.config?.policy as Policy;
    if (isValidPolicyObject(policy)) {
      map[policy.id] = policy.name;
    }
    // Backwards compatibility w/ text-only inline policies.
    else if (policy) {
      const id = await makeInlinePolicyId(policy);
      map[id] = makeDefaultPolicyName(index);
    }
  }

  return map;
}

function extractUniqueStrategyIds(strategies?: Array<string | { id: string }> | null): string[] {
  const strategyIds =
    strategies?.map((strategy) => (typeof strategy === 'string' ? strategy : strategy.id)) ?? [];

  // Filter out 'retry' - it's in the config but not user-facing in the UI
  return Array.from(new Set([...strategyIds, 'basic'])).filter((id) => id !== 'retry');
}

/**
 * The `plugin`, `strategy`, `severity`, and `policy` filter options are only available for redteam evaluations.
 * This function conditionally constructs these based on whether the evaluation was a red team. If it was not,
 * it returns an empty object.
 *
 * @param config - The eval config
 * @param table - The eval table (needed to extract policy options from metrics)
 */
async function buildRedteamFilterOptions(
  config?: Partial<UnifiedConfig> | null,
  _table?: EvaluateTable | null,
): Promise<{ plugin: string[]; strategy: string[]; severity: string[]; policy: string[] } | {}> {
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
    policy: await buildPolicyOptions(config?.redteam?.plugins),
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
    plugins.map((plugin) =>
      typeof plugin === 'string' ? { id: plugin } : plugin,
    ) as RedteamPluginObject[],
  );

  // Extract unique severities from the map
  const severities = new Set<string>();
  Object.values(severityMap).forEach((severity) => {
    if (severity) {
      severities.add(severity);
    }
  });

  // Return sorted array of severity values (in order of criticality)
  const severityOrder = [
    Severity.Critical,
    Severity.High,
    Severity.Medium,
    Severity.Low,
    Severity.Informational,
  ];
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

export type ResultsFilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'exists'
  | 'is_defined'
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte';

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
   * For metadata filters, this is the field name in the metadata object.
   * For metric filters, this is the metric key name.
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
  setTableFromResultsFile: (resultsFile: ResultsFile) => Promise<void>;

  config: Partial<UnifiedConfig> | null;
  setConfig: (config: Partial<UnifiedConfig> | null) => void;

  version: number | null;
  setVersion: (version: number) => void;

  filteredResultsCount: number;
  setFilteredResultsCount: (count: number) => void;

  highlightedResultsCount: number;
  userRatedResultsCount: number;

  totalResultsCount: number;
  setTotalResultsCount: (count: number) => void;

  /**
   * Filtered metrics calculated on the backend for the currently filtered dataset.
   * null when no filters are active or when the feature is disabled.
   * When present, components should use these metrics instead of prompt.metrics.
   */
  filteredMetrics: PromptMetrics[] | null;
  setFilteredMetrics: (metrics: PromptMetrics[] | null) => void;

  /**
   * Evaluation-level statistics including durationMs (wall-clock time).
   * Set automatically by fetchEvalData from API response.
   */
  stats: EvaluateStats | null;

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

  metadataValues: Record<string, string[]>;
  metadataValuesLoading: Record<string, boolean>;
  metadataValuesError: Record<string, boolean>;
  fetchMetadataValues: (id: string, key: string) => Promise<string[]>;
  currentMetadataValuesRequests: Record<string, AbortController | null>;

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
  showPassReasons: boolean;
  setShowPassReasons: (showPassReasons: boolean) => void;

  inComparisonMode: boolean;
  setInComparisonMode: (inComparisonMode: boolean) => void;
  comparisonEvalIds: string[];
  setComparisonEvalIds: (comparisonEvalIds: string[]) => void;
  stickyHeader: boolean;
  setStickyHeader: (stickyHeader: boolean) => void;

  columnStates: Record<string, ColumnState>;
  setColumnState: (evalId: string, state: ColumnState) => void;

  /**
   * Maps a schema hash (sorted var names joined) to the list of hidden var names for that schema.
   * This allows different "shapes" of evals to have different column visibility preferences.
   * Evals with the same set of variables share visibility state.
   */
  hiddenVarNamesBySchema: Record<string, string[]>;
  setHiddenVarNamesForSchema: (schemaHash: string, hiddenVarNames: string[]) => void;

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
      showPassReasons: false,
      setShowPassReasons: (showPassReasons: boolean) => set(() => ({ showPassReasons })),

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

      hiddenVarNamesBySchema: {},
      setHiddenVarNamesForSchema: (schemaHash: string, hiddenVarNames: string[]) =>
        set((prevState) => ({
          hiddenVarNamesBySchema: {
            ...prevState.hiddenVarNamesBySchema,
            [schemaHash]: hiddenVarNames,
          },
        })),

      maxImageWidth: 256,
      setMaxImageWidth: (maxImageWidth: number) => set(() => ({ maxImageWidth })),
      maxImageHeight: 256,
      setMaxImageHeight: (maxImageHeight: number) => set(() => ({ maxImageHeight })),
    }),
    {
      name: 'eval-settings',
      version: 2,
      migrate: (persistedState, version) => {
        const state = persistedState as Record<string, unknown>;
        if (version < 2) {
          // Remove old global hiddenVarNames, initialize new schema-based storage
          delete state.hiddenVarNames;
          state.hiddenVarNamesBySchema = {};
        }
        return state as typeof persistedState;
      },
    },
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
  if (filter.type === 'metric') {
    // For metric filters with is_defined operator, only field is required
    if (filter.operator === 'is_defined') {
      return Boolean(filter.field);
    }
    // For metric filters with comparison operators, both field and value are required
    return Boolean(filter.value && filter.field);
  }
  // For non-metadata/non-metric filters, value is required
  return Boolean(filter.value);
};

export const useTableStore = create<TableState>()(
  subscribeWithSelector((set, get) => ({
    evalId: null,
    setEvalId: (evalId: string) => set(() => ({ evalId, filteredMetrics: null })),

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
        userRatedResultsCount: computeUserRatedCount(table),
        filters: prevState.filters,
      }));
    },

    setTableFromResultsFile: async (resultsFile: ResultsFile) => {
      if (resultsFile.version && resultsFile.version >= 4) {
        const table = convertResultsToTable(resultsFile);

        // Build async options
        const [redteamOptions, policyIdToNameMap] = await Promise.all([
          buildRedteamFilterOptions(resultsFile.config, table),
          extractPolicyIdToNameMap(resultsFile.config.redteam?.plugins ?? []),
        ]);

        set((prevState) => ({
          table,
          version: resultsFile.version,
          highlightedResultsCount: computeHighlightCount(table),
          userRatedResultsCount: computeUserRatedCount(table),
          filters: {
            ...prevState.filters,
            options: {
              metric: computeAvailableMetrics(table),
              metadata: [],
              ...redteamOptions,
            },
            policyIdToNameMap,
          },
        }));
      } else {
        const results = resultsFile.results as EvaluateSummaryV2;

        // Build async options
        const [redteamOptions, policyIdToNameMap] = await Promise.all([
          buildRedteamFilterOptions(resultsFile.config, results.table),
          extractPolicyIdToNameMap(resultsFile.config.redteam?.plugins ?? []),
        ]);

        set((prevState) => ({
          table: results.table,
          version: resultsFile.version,
          highlightedResultsCount: computeHighlightCount(results.table),
          userRatedResultsCount: computeUserRatedCount(results.table),
          filters: {
            ...prevState.filters,
            options: {
              metric: computeAvailableMetrics(results.table),
              metadata: [],
              ...redteamOptions,
            },
            policyIdToNameMap,
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

    filteredMetrics: null,
    setFilteredMetrics: (metrics: PromptMetrics[] | null) =>
      set(() => ({ filteredMetrics: metrics })),

    stats: null,

    highlightedResultsCount: 0,
    userRatedResultsCount: 0,

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
        metadataValues: {},
        metadataValuesLoading: {},
        metadataValuesError: {},
        currentMetadataValuesRequests: {},
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

          // Build async options
          const [redteamOptions, policyIdToNameMap] = await Promise.all([
            buildRedteamFilterOptions(data.config, data.table),
            extractPolicyIdToNameMap(data.config?.redteam?.plugins ?? []),
          ]);

          set((prevState) => ({
            table: data.table,
            filteredResultsCount: data.filteredCount,
            totalResultsCount: data.totalCount,
            highlightedResultsCount: computeHighlightCount(data.table),
            userRatedResultsCount: computeUserRatedCount(data.table),
            config: data.config,
            version: data.version,
            author: data.author,
            evalId: skipSettingEvalId ? get().evalId : id,
            isFetching: skipLoadingState ? prevState.isFetching : false,
            shouldHighlightSearchText: searchText !== '',
            // Store filtered metrics from backend (null when no filters or feature disabled)
            filteredMetrics: data.filteredMetrics || null,
            // Store evaluation-level stats including durationMs
            stats: data.stats || null,
            filters: {
              ...prevState.filters,
              options: {
                metric: computeAvailableMetrics(data.table),
                metadata: [],
                ...redteamOptions,
              },
              policyIdToNameMap,
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
      const filterId = crypto.randomUUID();

      set((prevState) => {
        const isApplied = isFilterApplied(filter);
        const appliedCount = prevState.filters.appliedCount + (isApplied ? 1 : 0);

        // Calculate the next sortIndex
        const existingFilters = Object.values(prevState.filters.values);
        const maxSortIndex =
          existingFilters.length > 0 ? Math.max(...existingFilters.map((f) => f.sortIndex)) : -1;
        const nextSortIndex = maxSortIndex + 1;

        // Inherit logic operator from existing filters (use the one from the filter with sortIndex 1)
        // If no existing filters, default to 'and'
        const inheritedLogicOperator =
          existingFilters.length > 0
            ? (existingFilters.find((f) => f.sortIndex === 1)?.logicOperator ??
              existingFilters[0].logicOperator ??
              'and')
            : 'and';

        return {
          filters: {
            ...prevState.filters,
            values: {
              ...prevState.filters.values,
              [filterId]: {
                ...filter,
                id: filterId,
                // Use provided logicOperator, or inherit from existing filters, or default to 'and'
                logicOperator: filter.logicOperator ?? inheritedLogicOperator,
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

    metadataValues: {},
    metadataValuesLoading: {},
    metadataValuesError: {},
    currentMetadataValuesRequests: {},

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
          const filteredKeys = data.keys.filter(
            (key: string) => !HIDDEN_METADATA_KEYS.includes(key),
          );

          // Check if this request is still current before updating state
          const latestState = get();
          if (latestState.currentMetadataKeysRequest === abortController) {
            set({
              metadataKeys: filteredKeys,
              metadataKeysLoading: false,
              currentMetadataKeysRequest: null,
            });
          }
          return filteredKeys;
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

    fetchMetadataValues: async (evalId: string, key: string) => {
      const trimmedKey = key.trim();
      if (!trimmedKey) {
        return [];
      }

      const currentState = get();
      const hasCachedValues = Object.prototype.hasOwnProperty.call(
        currentState.metadataValues,
        trimmedKey,
      );
      if (hasCachedValues) {
        return currentState.metadataValues[trimmedKey];
      }

      const existingController = currentState.currentMetadataValuesRequests[trimmedKey];
      if (existingController) {
        existingController.abort();
      }

      const abortController = new AbortController();
      set((prevState) => ({
        currentMetadataValuesRequests: {
          ...prevState.currentMetadataValuesRequests,
          [trimmedKey]: abortController,
        },
        metadataValuesLoading: {
          ...prevState.metadataValuesLoading,
          [trimmedKey]: true,
        },
        metadataValuesError: {
          ...prevState.metadataValuesError,
          [trimmedKey]: false,
        },
      }));

      try {
        const { comparisonEvalIds } = useResultsViewSettingsStore.getState();
        const url = new URL(`/eval/${evalId}/metadata-values`, window.location.origin);
        url.searchParams.set('key', trimmedKey);
        comparisonEvalIds.forEach((compId) => {
          url.searchParams.append('comparisonEvalIds', compId);
        });

        const resp = await callApi(url.toString().replace(window.location.origin, ''), {
          signal: abortController.signal,
        });

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
        }

        const data = await resp.json();
        const values: string[] = Array.isArray(data.values) ? data.values : [];

        set((prevState) => ({
          metadataValues: {
            ...prevState.metadataValues,
            [trimmedKey]: values,
          },
          metadataValuesLoading: {
            ...prevState.metadataValuesLoading,
            [trimmedKey]: false,
          },
          metadataValuesError: {
            ...prevState.metadataValuesError,
            [trimmedKey]: false,
          },
          currentMetadataValuesRequests: {
            ...prevState.currentMetadataValuesRequests,
            [trimmedKey]: null,
          },
        }));

        return values;
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return get().metadataValues[trimmedKey] ?? [];
        }

        set((prevState) => ({
          metadataValuesLoading: {
            ...prevState.metadataValuesLoading,
            [trimmedKey]: false,
          },
          metadataValuesError: {
            ...prevState.metadataValuesError,
            [trimmedKey]: true,
          },
          currentMetadataValuesRequests: {
            ...prevState.currentMetadataValuesRequests,
            [trimmedKey]: null,
          },
        }));
        return [];
      }
    },

    filterMode: 'all',
    setFilterMode: (filterMode: EvalResultsFilterMode) =>
      set((prevState) => ({ ...prevState, filterMode })),
    resetFilterMode: () => set((prevState) => ({ ...prevState, filterMode: 'all' })),
  })),
);
