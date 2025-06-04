import { callApi } from '@app/utils/api';
import { convertResultsToTable } from '@promptfoo/util/convertEvalResultsToTable';
import type { VisibilityState } from '@tanstack/table-core';
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
      row.outputs.filter((o) => o.gradingResult?.comment?.trim().startsWith('!highlight')).length
    );
  }, 0);
}

interface FetchEvalOptions {
  pageIndex?: number;
  pageSize?: number;
  filterMode?: FilterMode;
  searchText?: string;
  selectedMetric?: string | null;
  skipSettingEvalId?: boolean;
}

interface ColumnState {
  selectedColumns: string[];
  columnVisibility: VisibilityState;
}

export interface PaginationState {
  pageIndex: number;
  pageSize: number;
}

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
    set(() => ({
      table,
      highlightedResultsCount: computeHighlightCount(table),
    })),
  setTableFromResultsFile: (resultsFile: ResultsFile) => {
    if (resultsFile.version && resultsFile.version >= 4) {
      const table = convertResultsToTable(resultsFile);
      set(() => ({
        table,
        version: resultsFile.version,
        highlightedResultsCount: computeHighlightCount(table),
      }));
    } else {
      const results = resultsFile.results as EvaluateSummaryV2;
      set(() => ({
        table: results.table,
        version: resultsFile.version,
        highlightedResultsCount: computeHighlightCount(results.table),
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
      selectedMetric = null,
      skipSettingEvalId = false,
    } = options;

    const { comparisonEvalIds } = useResultsViewSettingsStore.getState();

    set({ isFetching: true });

    try {
      console.log(`Fetching data for eval ${id} with options:`, options);

      const url = `/eval/${id}/table?offset=${pageIndex * pageSize}&limit=${pageSize}&filter=${filterMode}${
        comparisonEvalIds.length > 0
          ? `&comparisonEvalIds=${comparisonEvalIds.join('&comparisonEvalIds=')}`
          : ''
      }${searchText ? `&search=${encodeURIComponent(searchText)}` : ''}${
        selectedMetric ? `&metric=${encodeURIComponent(selectedMetric)}` : ''
      }`;

      const resp = await callApi(url);

      if (resp.ok) {
        const data = (await resp.json()) as EvalTableDTO;

        set({
          table: data.table,
          filteredResultsCount: data.filteredCount,
          totalResultsCount: data.totalCount,
          highlightedResultsCount: computeHighlightCount(data.table),
          config: data.config,
          version: data.version,
          author: data.author,
          evalId: skipSettingEvalId ? get().evalId : id,
          isFetching: false,
        });

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
}));
