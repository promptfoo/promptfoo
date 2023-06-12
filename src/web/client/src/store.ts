import create from 'zustand';

import type { EvalTable, UnifiedConfig } from './types.js';

interface TableState {
  table: EvalTable | null;
  setTable: (table: EvalTable | null) => void;

  config: Partial<UnifiedConfig> | null;
  setConfig: (config: Partial<UnifiedConfig> | null) => void;
}

export const useStore = create<TableState>((set) => ({
  table: null,
  setTable: (table: EvalTable | null) => set(() => ({ table })),
  config: null,
  setConfig: (config: Partial<UnifiedConfig> | null) => set(() => ({ config })),
}));
