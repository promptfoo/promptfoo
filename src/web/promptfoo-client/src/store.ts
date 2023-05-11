import create from 'zustand';

import type { EvalTable } from './types.js';

interface TableState {
  table: EvalTable | null;
  setTable: (table: EvalTable | null) => void;
}

export const useStore = create<TableState>((set) => ({
  table: null,
  setTable: (table: EvalTable | null) => set(() => ({ table })),
}));
