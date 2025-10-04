import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useEvalUIStore } from '../store/uiStore';
import { useEvalTable } from './useEvalTable';
import { useMetadataKeys } from './useMetadataKeys';
import { useResultsViewSettingsStore } from '../components/store';
import type { EvalTableDTO, EvaluateTable, UnifiedConfig } from '@promptfoo/types';

/**
 * Compatibility hook that provides the old useTableStore API using new React Query hooks.
 *
 * This bridge allows existing components to continue working while we migrate to the new architecture.
 * Components should gradually migrate to using useEvalTable and useEvalUIStore directly.
 *
 * @deprecated Use useEvalTable and useEvalUIStore directly instead
 */
export function useTableStoreCompat() {
  // Client state from new UI store
  const uiStore = useEvalUIStore();
  const { comparisonEvalIds } = useResultsViewSettingsStore();

  // CRITICAL FIX: Memoize filters array to prevent infinite refetches
  // Creating a new array on every render causes useEvalTable to refetch constantly
  const filters = React.useMemo(
    () =>
      Object.values(uiStore.filters.values).filter((filter) =>
        filter.type === 'metadata' ? Boolean(filter.value && filter.field) : Boolean(filter.value),
      ),
    [uiStore.filters.values],
  );

  // Server state from React Query
  const { data: evalData, isLoading: isFetching } = useEvalTable(uiStore.evalId, {
    pageIndex: 0,
    pageSize: 50,
    filterMode: uiStore.filterMode,
    searchText: '',
    filters,
    comparisonEvalIds,
  });

  const {
    data: metadataKeys,
    isLoading: metadataKeysLoading,
    error: metadataKeysError,
  } = useMetadataKeys(uiStore.evalId, comparisonEvalIds);

  // PERFORMANCE FIX: Memoize expensive computations
  const highlightedResultsCount = React.useMemo(
    () => computeHighlightCount(evalData?.table ?? null),
    [evalData?.table],
  );

  const availableMetrics = React.useMemo(
    () => (evalData?.table ? computeAvailableMetrics(evalData.table) : []),
    [evalData?.table],
  );

  const redteamFilterOptions = React.useMemo(
    () => (evalData?.config ? buildRedteamFilterOptions(evalData.config, evalData.table) : {}),
    [evalData?.config, evalData?.table],
  );

  const policyIdToNameMap = React.useMemo(
    () =>
      evalData?.config ? extractPolicyIdToNameMap(evalData.config.redteam?.plugins ?? []) : {},
    [evalData?.config],
  );

  // Bridge the old API to new implementation
  return {
    // Server state (from React Query)
    table: evalData?.table ?? null,
    config: evalData?.config ?? null,
    author: evalData?.author ?? null,
    version: evalData?.version ?? null,
    filteredResultsCount: evalData?.filteredCount ?? 0,
    totalResultsCount: evalData?.totalCount ?? 0,
    highlightedResultsCount,
    isFetching,
    metadataKeys,
    metadataKeysLoading,
    metadataKeysError: !!metadataKeysError,
    currentMetadataKeysRequest: null, // No longer needed with React Query

    // Client state (from UI store)
    evalId: uiStore.evalId,
    filters: {
      values: uiStore.filters.values,
      appliedCount: uiStore.filters.appliedCount,
      // Filter options need to be computed from evalData
      options: {
        metric: availableMetrics,
        metadata: metadataKeys,
        ...redteamFilterOptions,
      },
      policyIdToNameMap,
    },
    filterMode: uiStore.filterMode,
    isStreaming: uiStore.isStreaming,
    shouldHighlightSearchText: uiStore.shouldHighlightSearchText,

    // Actions (from UI store)
    setEvalId: uiStore.setEvalId,
    addFilter: uiStore.addFilter,
    removeFilter: uiStore.removeFilter,
    removeAllFilters: uiStore.removeAllFilters,
    resetFilters: uiStore.resetFilters,
    updateFilter: uiStore.updateFilter,
    updateAllFilterLogicOperators: uiStore.updateAllFilterLogicOperators,
    setFilterMode: uiStore.setFilterMode,
    resetFilterMode: uiStore.resetFilterMode,
    setIsStreaming: uiStore.setIsStreaming,

    // Deprecated actions (mapped to new implementations)
    setAuthor: () => {
      if (process.env.NODE_ENV === 'development') {
        console.warn('setAuthor is deprecated - author comes from server data');
      }
    },
    setTable: () => {
      if (process.env.NODE_ENV === 'development') {
        console.warn('setTable is deprecated - table comes from React Query');
      }
    },
    setTableFromResultsFile: () => {
      if (process.env.NODE_ENV === 'development') {
        console.warn('setTableFromResultsFile is deprecated');
      }
    },
    setConfig: () => {
      if (process.env.NODE_ENV === 'development') {
        console.warn('setConfig is deprecated - config comes from server data');
      }
    },
    setVersion: () => {
      if (process.env.NODE_ENV === 'development') {
        console.warn('setVersion is deprecated - version comes from server data');
      }
    },
    setFilteredResultsCount: () => {
      if (process.env.NODE_ENV === 'development') {
        console.warn('setFilteredResultsCount is deprecated - count comes from server data');
      }
    },
    setTotalResultsCount: () => {
      if (process.env.NODE_ENV === 'development') {
        console.warn('setTotalResultsCount is deprecated - count comes from server data');
      }
    },

    // fetchEvalData is now handled by React Query automatically
    // But we provide a compatible API that triggers a refetch
    fetchEvalData: async (id: string, options?: any) => {
      if (process.env.NODE_ENV === 'development') {
        console.warn('fetchEvalData is deprecated - use React Query refetch instead');
      }

      // Update evalId which will trigger React Query to refetch
      if (id !== uiStore.evalId) {
        uiStore.setEvalId(id);
      } else {
        // Same ID, just refetch
        await refetch();
      }

      return evalData ?? null;
    },

    // fetchMetadataKeys is now handled by React Query automatically
    fetchMetadataKeys: async (id: string) => {
      if (process.env.NODE_ENV === 'development') {
        console.warn('fetchMetadataKeys is deprecated - React Query handles this automatically');
      }
      return metadataKeys;
    },
  };
}

// Helper functions (copied from store.ts)
interface RedteamFilterOptions {
  plugin: string[];
  strategy: string[];
  severity: string[];
  policy: string[];
}

function computeHighlightCount(table: EvaluateTable | null): number {
  if (!table) {
    return 0;
  }
  return table.body.reduce((count: number, row) => {
    return (
      count +
      row.outputs.filter((o) => o?.gradingResult?.comment?.trim().startsWith('!highlight')).length
    );
  }, 0);
}

function computeAvailableMetrics(table: EvaluateTable): string[] {
  if (!table.head?.prompts) {
    return [];
  }

  const metrics = new Set<string>();
  table.head.prompts.forEach((prompt) => {
    if (prompt.metrics?.namedScores) {
      Object.keys(prompt.metrics.namedScores).forEach((metric) => {
        metrics.add(metric);
      });
    }
  });

  return Array.from(metrics).sort();
}

function buildRedteamFilterOptions(
  config: UnifiedConfig,
  table: EvaluateTable | null,
): Partial<RedteamFilterOptions> {
  const isRedteam = Boolean(config?.redteam);
  if (!isRedteam) {
    return {};
  }

  return {
    plugin: Array.from(
      new Set(
        config?.redteam?.plugins?.map((plugin) =>
          typeof plugin === 'string' ? plugin : plugin.id,
        ) ?? [],
      ),
    ),
    strategy: [],
    severity: [],
    policy: [],
  };
}

type RedteamPlugin = string | { id: string; config?: { policy?: { id: string; name: string } } };

function extractPolicyIdToNameMap(plugins: RedteamPlugin[]): Record<string, string> {
  const policyMap: Record<string, string> = {};
  plugins.forEach((plugin) => {
    if (typeof plugin !== 'string' && plugin.id === 'policy') {
      const policy = plugin?.config?.policy;
      if (policy?.id && policy?.name) {
        policyMap[policy.id] = policy.name;
      }
    }
  });
  return policyMap;
}
