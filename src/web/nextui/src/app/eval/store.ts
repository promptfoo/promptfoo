import { create } from 'zustand';

import type { EvaluateTable, FilePath, UnifiedConfig } from './types';

interface TableState {
  filePath: FilePath | null,
  setFilePath: (filename: FilePath) => void;

  table: EvaluateTable | null;
  setTable: (table: EvaluateTable | null) => void;

  config: Partial<UnifiedConfig> | null;
  setConfig: (config: Partial<UnifiedConfig> | null) => void;

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
}

export const useStore = create<TableState>((set) => ({
  filePath: null,
  setFilePath: (filePath: FilePath) => set(() => ({ filePath })),

  table: null,
  setTable: (table: EvaluateTable | null) => set(() => ({ table })),
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
}));
