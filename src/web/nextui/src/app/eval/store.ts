import { create } from 'zustand';

import type { EvaluateTable, UnifiedConfig } from './types';

interface TableState {
  table: EvaluateTable | null;
  setTable: (table: EvaluateTable | null) => void;

  config: Partial<UnifiedConfig> | null;
  setConfig: (config: Partial<UnifiedConfig> | null) => void;
}

export const useStore = create<TableState>((set) => ({
  table: null,
  setTable: (table: EvaluateTable | null) => set(() => ({ table })),
  config: null,
  setConfig: (config: Partial<UnifiedConfig> | null) => set(() => ({ config })),
}));
