import { callApi } from '@app/utils/api';
import { create } from 'zustand';

import type { ScanResult } from '../ModelAudit.types';

export interface HistoricalScan {
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
  metadata?: Record<string, unknown> | null;
}

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
      if (error instanceof Error && error.name === 'AbortError') {
        return null;
      }
      throw error;
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
        totalCount: Math.max(0, state.totalCount - 1),
      }));
    } catch (error) {
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
