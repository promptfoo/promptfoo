import { callApi } from '@app/utils/api';
import { create } from 'zustand';

import type { HistoricalScan } from '../ModelAudit.types';

// Re-export types for convenience
export type { HistoricalScan };

interface SortModel {
  field: string;
  sort: 'asc' | 'desc';
}

interface ModelAuditHistoryState {
  // History data
  historicalScans: HistoricalScan[];
  isLoadingHistory: boolean;
  historyError: string | null;
  totalCount: number;

  // DataGrid pagination/filtering state
  pageSize: number;
  currentPage: number;
  sortModel: SortModel[];
  searchQuery: string;

  // Actions
  fetchHistoricalScans: (signal?: AbortSignal) => Promise<void>;
  fetchScanById: (id: string, signal?: AbortSignal) => Promise<HistoricalScan | null>;
  deleteHistoricalScan: (id: string) => Promise<void>;
  setPageSize: (size: number) => void;
  setCurrentPage: (page: number) => void;
  setSortModel: (model: SortModel[]) => void;
  setSearchQuery: (query: string) => void;
  resetFilters: () => void;
}

const DEFAULT_PAGE_SIZE = 25;

export const useModelAuditHistoryStore = create<ModelAuditHistoryState>()((set, get) => ({
  // Initial state
  historicalScans: [],
  isLoadingHistory: false,
  historyError: null,
  totalCount: 0,
  pageSize: DEFAULT_PAGE_SIZE,
  currentPage: 0,
  sortModel: [{ field: 'createdAt', sort: 'desc' }],
  searchQuery: '',

  // Actions
  fetchHistoricalScans: async (signal?: AbortSignal) => {
    set({ isLoadingHistory: true, historyError: null });

    try {
      const { pageSize, currentPage, sortModel, searchQuery } = get();
      const offset = currentPage * pageSize;
      const sort = sortModel[0]?.field || 'createdAt';
      const order = sortModel[0]?.sort || 'desc';

      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: offset.toString(),
        sort,
        order,
      });

      if (searchQuery) {
        params.append('search', searchQuery);
      }

      const response = await callApi(`/model-audit/scans?${params.toString()}`, { signal });
      if (!response.ok) {
        throw new Error('Failed to fetch historical scans');
      }

      const data = await response.json();
      set({
        historicalScans: data.scans || [],
        totalCount: data.total || data.scans?.length || 0,
        isLoadingHistory: false,
      });
    } catch (error) {
      // Don't set error state if request was aborted
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch history';
      set({
        isLoadingHistory: false,
        historyError: errorMessage,
      });
    }
  },

  fetchScanById: async (id: string, signal?: AbortSignal) => {
    try {
      const response = await callApi(`/model-audit/scans/${id}`, { signal });
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error('Failed to fetch scan');
      }
      return await response.json();
    } catch (error) {
      // Re-throw AbortError so caller can handle it appropriately
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }
      throw error;
    }
  },

  deleteHistoricalScan: async (id: string) => {
    // Optimistic delete: remove from UI immediately
    const previousScans = get().historicalScans;
    const previousCount = get().totalCount;
    const scanToDelete = previousScans.find((scan) => scan.id === id);

    // Optimistically update UI
    set((state) => ({
      historicalScans: state.historicalScans.filter((scan) => scan.id !== id),
      totalCount: Math.max(0, state.totalCount - 1),
      historyError: null,
    }));

    try {
      const response = await callApi(`/model-audit/scans/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete scan');
      }
    } catch (error) {
      // Revert optimistic update on failure
      if (scanToDelete) {
        set({
          historicalScans: previousScans,
          totalCount: previousCount,
        });
      }
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete scan';
      set({ historyError: errorMessage });
      throw error;
    }
  },

  setPageSize: (pageSize) => {
    set({ pageSize, currentPage: 0 });
  },

  setCurrentPage: (currentPage) => {
    set({ currentPage });
  },

  setSortModel: (sortModel) => {
    set({ sortModel, currentPage: 0 });
  },

  setSearchQuery: (searchQuery) => {
    set({ searchQuery, currentPage: 0 });
  },

  resetFilters: () => {
    set({
      pageSize: DEFAULT_PAGE_SIZE,
      currentPage: 0,
      sortModel: [{ field: 'createdAt', sort: 'desc' }],
      searchQuery: '',
    });
  },
}));
