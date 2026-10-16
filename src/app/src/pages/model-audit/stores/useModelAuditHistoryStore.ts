import { callApi } from '@app/utils/api';
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

  pageSize: number;
  sortModel: SortModel[];

  // Actions
  fetchHistoricalScans: (signal?: AbortSignal) => Promise<void>;
  fetchHistoricalScanRange: (
    range: { startIndex: number; endIndex: number },
    signal?: AbortSignal,
  ) => Promise<{ scans: HistoricalScan[]; offset: number; total: number }>;
  fetchScanById: (id: string, signal?: AbortSignal) => Promise<HistoricalScan | null>;
  deleteHistoricalScan: (id: string) => Promise<void>;
  setSortModel: (model: SortModel[]) => void;
}

const DEFAULT_PAGE_SIZE = 25;
let historyRequestId = 0;
let historyCountRevision = 0;
let pendingDeletions = 0;
let deletionOrder: string[] = [];

export const useModelAuditHistoryStore = create<ModelAuditHistoryState>()((set, get) => ({
  // Initial state
  historicalScans: [],
  isLoadingHistory: false,
  historyError: null,
  totalCount: 0,
  pageSize: DEFAULT_PAGE_SIZE,
  sortModel: [{ field: 'createdAt', sort: 'desc' }],

  // Actions
  fetchHistoricalScans: async (signal?: AbortSignal) => {
    const requestId = ++historyRequestId;
    set({ isLoadingHistory: true, historyError: null });

    try {
      const { pageSize, sortModel } = get();
      const sort = sortModel[0]?.field || 'createdAt';
      const order = sortModel[0]?.sort || 'desc';

      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: '0',
        sort,
        order,
      });

      const response = await callApi(`/model-audit/scans?${params.toString()}`, { signal });
      if (!response.ok) {
        throw new Error('Failed to fetch historical scans');
      }

      const data = await response.json();
      if (requestId !== historyRequestId) {
        return;
      }
      historyCountRevision++;
      set({
        historicalScans: data.scans || [],
        totalCount: data.total || data.scans?.length || 0,
      });
    } catch (error) {
      // Don't set error state if request was aborted
      if (
        requestId !== historyRequestId ||
        (error instanceof Error && error.name === 'AbortError')
      ) {
        return;
      }
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch history';
      set({
        historyError: errorMessage,
      });
    } finally {
      if (requestId === historyRequestId) {
        set({ isLoadingHistory: false });
      }
    }
  },

  fetchHistoricalScanRange: async ({ startIndex, endIndex }, signal?: AbortSignal) => {
    try {
      const { sortModel } = get();
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

      const response = await callApi(`/model-audit/scans?${params.toString()}`, { signal });
      if (!response.ok) {
        throw new Error('Failed to fetch historical scans');
      }

      const data = await response.json();
      const scans = data.scans || [];
      const total = data.total || scans.length || 0;
      historyCountRevision++;
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
    if (pendingDeletions === 0) {
      // Concurrent deletions share the server's row order, including temporarily hidden rows.
      deletionOrder = previousScans.map((scan) => scan.id);
    }
    pendingDeletions++;
    const rollbackOrder = deletionOrder.includes(id)
      ? deletionOrder
      : previousScans.map((scan) => scan.id);
    const deletedScan = previousScans.find((scan) => scan.id === id);
    const countAdjustment = get().totalCount > 0 ? 1 : 0;
    const countRevision = historyCountRevision;

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
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete scan';
      // Roll back only this deletion, preserving other in-flight deletions and updates.
      set((state) => {
        const historicalScans = [...state.historicalScans];
        const scanAlreadyPresent = historicalScans.some((scan) => scan.id === id);
        if (deletedScan && !scanAlreadyPresent) {
          const nextScanId = rollbackOrder
            .slice(rollbackOrder.indexOf(id) + 1)
            .find((scanId) => historicalScans.some((current) => current.id === scanId));
          const insertIndex = nextScanId
            ? historicalScans.findIndex((scan) => scan.id === nextScanId)
            : historicalScans.length;
          historicalScans.splice(insertIndex, 0, deletedScan);
        }
        return {
          historicalScans,
          totalCount:
            state.totalCount +
            (scanAlreadyPresent || countRevision !== historyCountRevision ? 0 : countAdjustment),
          historyError: errorMessage,
        };
      });
      throw error;
    } finally {
      pendingDeletions--;
      if (pendingDeletions === 0) {
        deletionOrder = [];
      }
    }
  },

  setSortModel: (sortModel) => set({ sortModel }),
}));
