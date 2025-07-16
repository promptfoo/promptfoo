import { callApi } from '@app/utils/api';
import { convertResultsToTable } from '@promptfoo/util/convertEvalResultsToTable';
import type { VisibilityState } from '@tanstack/table-core';
import { v4 as uuidv4 } from 'uuid';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  EvaluateSummaryV2,
  EvaluateTable,
  ResultsFile,
  UnifiedConfig,
  FilterMode,
  EvalTableDTO,
} from './types';

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
      Object.keys(prompt.metrics.namedScores).forEach((metric) => metrics.add(metric));
    }
  });

  return Array.from(metrics).sort();
}

interface FetchEvalOptions {
  pageIndex?: number;
  pageSize?: number;
  filterMode?: FilterMode;
  searchText?: string;
  skipSettingEvalId?: boolean;
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

export type ResultsFilterType = 'metric';

export type ResultsFilter = {
  /**
   * A unique identifier for the filter.
   */
  id: string;
  type: ResultsFilterType;
  value: string;
  operator: 'equals';
  logicOperator: 'and' | 'or';
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

  /**
   * Adds a new filter to the filters array.
   * @param filter - The filter to add.
   */
  addFilter: (filter: {
    type: ResultsFilterType;
    operator: ResultsFilter['operator'];
    value: string;
    logicOperator?: ResultsFilter['logicOperator'];
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
      [key in ResultsFilterType]: string[];
    };
  };
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
    (set, get) => ({
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

export const useTableStore = create<TableState>()((set, get) => ({
  evalId: null,
  setEvalId: (evalId: string) => set(() => ({ evalId })),

  author: null,
  setAuthor: (author: string | null) => set(() => ({ author })),

  version: null,
  setVersion: (version: number) => set(() => ({ version })),

  table: null,
  setTable: (table: EvaluateTable | null) =>
    set((prevState) => ({
      table,
      highlightedResultsCount: computeHighlightCount(table),
      filters: {
        ...prevState.filters,
        options: {
          metric: computeAvailableMetrics(table),
        },
      },
    })),
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
          },
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
          },
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

  fetchEvalData: async (id: string, options: FetchEvalOptions = {}) => {
    const {
      pageIndex = 0,
      pageSize = 50,
      filterMode = 'all',
      searchText = '',
      skipSettingEvalId = false,
      filters = [],
    } = options;

    const { comparisonEvalIds } = useResultsViewSettingsStore.getState();

    set({ isFetching: true });

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
          isFetching: false,
          filters: {
            ...prevState.filters,
            options: {
              metric: computeAvailableMetrics(data.table),
            },
          },
        }));

        return data;
      }

      set({ isFetching: false });
      return null;
    } catch (error) {
      console.error('Error fetching eval data:', error);
      set({ isFetching: false });
      return null;
    }
  },

  filters: {
    values: {},
    appliedCount: 0,
    options: {
      metric: [],
    },
  },

  addFilter: (filter) => {
    const filterId = uuidv4();

    set((prevState) => {
      const appliedCount = prevState.filters.appliedCount + (filter.value ? 1 : 0);

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
      const appliedCount = prevState.filters.appliedCount - (target.value ? 1 : 0);
      const values = { ...prevState.filters.values };
      delete values[id];

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
      const appliedCount =
        prevState.filters.appliedCount - (target.value ? 1 : 0) + (filter.value ? 1 : 0);

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
}));
