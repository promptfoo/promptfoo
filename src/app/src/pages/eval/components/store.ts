import { convertResultsToTable } from '@promptfoo/util/convertEvalResultsToTable';
import { create } from 'zustand';
import type { EvaluateSummaryV2, EvaluateTable, ResultsFile, UnifiedConfig, EvalId } from './types';

type ColumnId = string;

interface ColumnState {
  selectedColumns: ColumnId[];
  // @tanstack/table-core#VisibilityState
  columnVisibility: {
    [x: ColumnId]: boolean;
  };
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
  stickyHeader: boolean;
  setStickyHeader: (stickyHeader: boolean) => void;

  columnStates: Record<EvalId, ColumnState>;
  setColumnState: (evalId: EvalId, state: ColumnState) => void;

  maxImageWidth: number;
  setMaxImageWidth: (maxImageWidth: number) => void;
  maxImageHeight: number;
  setMaxImageHeight: (maxImageHeight: number) => void;
}

export const useStore = create<TableState>()((set, get) => ({
  evalId: null,
  setEvalId: (evalId: string) => set(() => ({ evalId })),

  author: null,
  setAuthor: (author: string | null) => set(() => ({ author })),

  version: null,
  setVersion: (version: number) => set(() => ({ version })),

  table: null,
  setTable: (table: EvaluateTable | null) => set(() => ({ table })),
  setTableFromResultsFile: (resultsFile: ResultsFile) => {
    if (resultsFile.version && resultsFile.version >= 4) {
      set(() => ({ table: convertResultsToTable(resultsFile), version: resultsFile.version }));
    } else {
      const results = resultsFile.results as EvaluateSummaryV2;
      set(() => ({ table: results.table, version: resultsFile.version }));
    }
  },
  config: null,
  setConfig: (config: Partial<UnifiedConfig> | null) => set(() => ({ config })),

  maxTextLength: 250,
  setMaxTextLength: (maxTextLength: number) => set(() => ({ maxTextLength })),
  wordBreak: 'break-word',
  setWordBreak: (wordBreak: 'break-word' | 'break-all') => set(() => ({ wordBreak })),
  showInferenceDetails: true,
  setShowInferenceDetails: (showInferenceDetails: boolean) => set(() => ({ showInferenceDetails })),
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
  stickyHeader: true,
  setStickyHeader: (stickyHeader: boolean) => set(() => ({ stickyHeader })),

  // TODO(will): Why does this support >=1 evalId?
  columnStates: {},
  setColumnState: (evalId: string, state: ColumnState) => {
    return set((prevState) => ({
      columnStates: {
        ...prevState.columnStates,
        [evalId]: state,
      },
    }));
  },

  maxImageWidth: 256,
  setMaxImageWidth: (maxImageWidth: number) => set(() => ({ maxImageWidth })),
  maxImageHeight: 256,
  setMaxImageHeight: (maxImageHeight: number) => set(() => ({ maxImageHeight })),
}));
