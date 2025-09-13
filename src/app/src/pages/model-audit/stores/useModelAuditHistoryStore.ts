import { callApi } from '@app/utils/api';
import { create } from 'zustand';

import type { ScanResult } from '../ModelAudit.types';

// History-related types
interface HistoricalScan {
  id: string;
  createdAt: number;
  updatedAt: number;
  name?: string | null;
  author?: string | null;
  modelPath: string;
  modelType?: string | null;
  results: ScanResult;
  hasErrors: boolean;
  totalChecks?: number | null;
  passedChecks?: number | null;
  failedChecks?: number | null;
  metadata?: Record<string, any> | null;
}

interface ModelAuditHistoryState {
  // History state
  historicalScans: HistoricalScan[];
  isLoadingHistory: boolean;
  historyError: string | null;

  // DataGrid state
  pageSize: number;
  currentPage: number;
  sortModel: Array<{ field: string; sort: 'asc' | 'desc' }>;
  filterModel: any;
  searchQuery: string;

  // Actions - History
  fetchHistoricalScans: () => Promise<void>;
  deleteHistoricalScan: (id: string) => Promise<void>;

  // Actions - DataGrid state
  setPageSize: (pageSize: number) => void;
  setCurrentPage: (page: number) => void;
  setSortModel: (sortModel: Array<{ field: string; sort: 'asc' | 'desc' }>) => void;
  setFilterModel: (filterModel: any) => void;
  setSearchQuery: (query: string) => void;

  // Reset state
  resetHistoryState: () => void;
}

export const useModelAuditHistoryStore = create<ModelAuditHistoryState>()((set, get) => ({
  // Initial state
  historicalScans: [],
  isLoadingHistory: false,
  historyError: null,
  pageSize: 50,
  currentPage: 0,
  sortModel: [{ field: 'createdAt', sort: 'desc' }],
  filterModel: {},
  searchQuery: '',

  // Actions - History
  fetchHistoricalScans: async () => {
    set({ isLoadingHistory: true, historyError: null });

    try {
      const response = await callApi('/model-audit/scans', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Failed to fetch historical scans');
      }

      const data = await response.json();
      set({
        historicalScans: data.scans || [],
        isLoadingHistory: false,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch history';
      set({
        isLoadingHistory: false,
        historyError: errorMessage,
      });
    }
  },

  deleteHistoricalScan: async (id: string) => {
    try {
      const response = await callApi(`/model-audit/scans/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete scan');
      }

      // Remove from local state
      set((state) => ({
        historicalScans: state.historicalScans.filter((scan) => scan.id !== id),
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete scan';
      set({ historyError: errorMessage });
      throw error;
    }
  },

  // Actions - DataGrid state
  setPageSize: (pageSize) => set({ pageSize }),
  setCurrentPage: (currentPage) => set({ currentPage }),
  setSortModel: (sortModel) => set({ sortModel }),
  setFilterModel: (filterModel) => set({ filterModel }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),

  // Reset state
  resetHistoryState: () => set({
    historicalScans: [],
    isLoadingHistory: false,
    historyError: null,
    currentPage: 0,
    searchQuery: '',
    filterModel: {},
  }),
}));