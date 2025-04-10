import { createContext, useContext, useState } from 'react';
import { convertResultsToTable } from '@promptfoo/util/convertEvalResultsToTable';
import type { VisibilityState } from '@tanstack/table-core';
import type { EvaluateSummaryV2, EvaluateTable, ResultsFile, UnifiedConfig } from './types';

interface ColumnState {
  selectedColumns: string[];
  columnVisibility: VisibilityState;
}

type WordBreak = 'break-word' | 'break-all';

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
  wordBreak: WordBreak;
  setWordBreak: (wordBreak: WordBreak) => void;
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

  columnStates: Record<string, ColumnState>;
  setColumnState: (evalId: string, state: ColumnState) => void;

  maxImageWidth: number;
  setMaxImageWidth: (maxImageWidth: number) => void;
  maxImageHeight: number;
  setMaxImageHeight: (maxImageHeight: number) => void;
}

//@ts-expect-error: No default value
const StoreContext = createContext<TableState>();

export const StoreProvider = ({ children }: { children: React.ReactNode }) => {
  // State values
  // TODO: Back settings up to localStorage
  const [evalId, setEvalId] = useState<string | null>(null);
  const [author, setAuthor] = useState<string | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [table, setTableInternal] = useState<EvaluateTable | null>(null);
  const [config, setConfig] = useState<Partial<UnifiedConfig> | null>(null);
  const [maxTextLength, setMaxTextLength] = useState<number>(250);
  const [wordBreak, setWordBreak] = useState<WordBreak>('break-word');
  const [showInferenceDetails, setShowInferenceDetails] = useState<boolean>(true);
  const [renderMarkdown, setRenderMarkdown] = useState<boolean>(false);
  const [prettifyJson, setPrettifyJson] = useState<boolean>(false);
  const [showPrompts, setShowPrompts] = useState<boolean>(false);
  const [showPassFail, setShowPassFail] = useState<boolean>(true);
  const [inComparisonMode, setInComparisonMode] = useState<boolean>(false);
  const [stickyHeader, setStickyHeader] = useState<boolean>(true);
  const [columnStates, setColumnStates] = useState<Record<string, ColumnState>>({});
  const [maxImageWidth, setMaxImageWidth] = useState<number>(256);
  const [maxImageHeight, setMaxImageHeight] = useState<number>(256);

  // TODO: Getters

  // ========================================================
  // Complex Setters
  // ========================================================

  // Complex setters that require additional logic
  const setTable = (newTable: EvaluateTable | null) => {
    setTableInternal(newTable);
  };

  const setTableFromResultsFile = (resultsFile: ResultsFile) => {
    if (resultsFile.version && resultsFile.version >= 4) {
      setTableInternal(convertResultsToTable(resultsFile));
      setVersion(resultsFile.version);
    } else {
      const results = resultsFile.results as EvaluateSummaryV2;
      setTableInternal(results.table);
      setVersion(resultsFile.version);
    }
  };

  const setColumnState = (evalId: string, state: ColumnState) => {
    setColumnStates((prevState) => ({
      ...prevState,
      [evalId]: state,
    }));
  };

  // ========================================================
  // Render
  // ========================================================

  return (
    <StoreContext.Provider
      value={{
        // Values
        evalId,
        author,
        version,
        table,
        config,
        maxTextLength,
        wordBreak,
        showInferenceDetails,
        renderMarkdown,
        prettifyJson,
        showPrompts,
        showPassFail,
        inComparisonMode,
        stickyHeader,
        columnStates,
        maxImageWidth,
        maxImageHeight,
        // Setters
        setEvalId,
        setAuthor,
        setVersion,
        setTable,
        setTableFromResultsFile,
        setConfig,
        setMaxTextLength,
        setWordBreak,
        setShowInferenceDetails,
        setRenderMarkdown,
        setPrettifyJson,
        setShowPrompts,
        setShowPassFail,
        setInComparisonMode,
        setStickyHeader,
        setColumnState,
        setMaxImageWidth,
        setMaxImageHeight,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export function useStore() {
  const store = useContext(StoreContext);
  if (!store) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return store;
}
