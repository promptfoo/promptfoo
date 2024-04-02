import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import type { EvaluateTable, FilePath, UnifiedConfig } from './types';

interface TableState {
  evalId: string | null;
  setEvalId: (evalId: string) => void;

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
  showPrompts: boolean;
  setShowPrompts: (showPrompts: boolean) => void;
}

export const useStore = create<TableState>()(
  persist(
    (set, get) => ({
      evalId: null,
      setEvalId: (evalId: string) => set(() => ({ evalId })),

      table: null,
      setTable: (table: EvaluateTable | null) => set(() => ({ table })),
      config: null,
      setConfig: (config: Partial<UnifiedConfig> | null) => set(() => ({ config })),

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
    }),
    {
      name: 'ResultsViewStorage',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
