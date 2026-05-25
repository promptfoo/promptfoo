import { callApiJson, callApiResult } from '@app/utils/api';
import { ModelAuditSchemas } from '@promptfoo/types/api/modelAudit';
import { ApiRoutes } from '@promptfoo/types/api/routes';
import { create } from 'zustand';

import type { ListScansQuery } from '../../../../../types/api/modelAudit';
import type { HistoricalScan } from '../ModelAudit.types';

// Re-export types for convenience
export type { HistoricalScan };

interface SortModel {
  field: NonNullable<ListScansQuery['sort']>;
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
  fetchHistoricalScanRange: (
    range: { startIndex: number; endIndex: number },
    signal?: AbortSignal,
  ) => Promise<{ scans: HistoricalScan[]; offset: number; total: number }>;
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

      const data = await callApiJson(
        ApiRoutes.ModelAudit.ListScans,
        ModelAuditSchemas.ListScans.Response,
        { query: params, signal },
      );
      set({
        historicalScans: data.scans as unknown as HistoricalScan[],
        totalCount: data.total,
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

  fetchHistoricalScanRange: async ({ startIndex, endIndex }, signal?: AbortSignal) => {
    try {
      const { sortModel, searchQuery } = get();
      const sort = sortModel[0]?.field || 'createdAt';
      const order = sortModel[0]?.sort || 'desc';
      const offset = Math.max(0, startIndex);
      const limit = Math.max(1, endIndex - offset + 1);

      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
        sort,
        order,
      });

      if (searchQuery) {
        params.append('search', searchQuery);
      }

      const data = await callApiJson(
        ApiRoutes.ModelAudit.ListScans,
        ModelAuditSchemas.ListScans.Response,
        { query: params, signal },
      );
      const scans = data.scans as unknown as HistoricalScan[];
      const { total } = data;
      set({
        totalCount: total,
        historyError: null,
      });

      return { scans, offset, total };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch history';
      set({ historyError: errorMessage });
      throw error;
    }
  },

  fetchScanById: async (id: string, signal?: AbortSignal) => {
    try {
      const response = await callApiResult(
        ApiRoutes.ModelAudit.GetScan,
        ModelAuditSchemas.GetScan.Response,
        { params: { id }, signal },
      );
      if (!response.ok) {
        if (response.error.status === 404) {
          return null;
        }
        throw new Error('Failed to fetch scan');
      }
      return response.data as unknown as HistoricalScan;
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

    // Optimistically update UI
    set((state) => ({
      historicalScans: state.historicalScans.filter((scan) => scan.id !== id),
      totalCount: Math.max(0, state.totalCount - 1),
      historyError: null,
    }));

    try {
      await callApiJson(ApiRoutes.ModelAudit.DeleteScan, ModelAuditSchemas.DeleteScan.Response, {
        params: { id },
        method: 'DELETE',
      });
    } catch (error) {
      // Revert optimistic update on failure
      set({
        historicalScans: previousScans,
        totalCount: previousCount,
      });
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
