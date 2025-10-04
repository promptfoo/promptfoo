import { useQuery, useQueryClient } from '@tanstack/react-query';
import { callApi } from '@app/utils/api';
import type { EvalResultsFilterMode, EvalTableDTO } from '@promptfoo/types';
import type { ResultsFilter } from '../components/store';
import { evalKeys } from './queryKeys';

export interface UseEvalTableOptions {
  pageIndex?: number;
  pageSize?: number;
  filterMode?: EvalResultsFilterMode;
  searchText?: string;
  filters?: ResultsFilter[];
  comparisonEvalIds?: string[];
}

interface UseEvalTableResult {
  data: EvalTableDTO | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * DRY FIX: Normalize options with defaults in a single place.
 * This ensures consistency between useEvalTable and usePrefetchEvalTable.
 */
export function normalizeEvalTableOptions(
  options: UseEvalTableOptions,
): Required<UseEvalTableOptions> {
  return {
    pageIndex: options.pageIndex ?? 0,
    pageSize: options.pageSize ?? 50,
    filterMode: options.filterMode ?? ('all' as EvalResultsFilterMode),
    searchText: options.searchText ?? '',
    filters: options.filters ?? [],
    comparisonEvalIds: options.comparisonEvalIds ?? [],
  };
}

/**
 * Shared query function for fetching eval table data.
 * Extracted to avoid duplication between useEvalTable and prefetch.
 */
async function fetchEvalTable(
  evalId: string,
  options: Required<UseEvalTableOptions>,
): Promise<EvalTableDTO> {
  const { pageIndex, pageSize, filterMode, searchText, filters, comparisonEvalIds } = options;

  const url = new URL(`/eval/${evalId}/table`, window.location.origin);

  url.searchParams.set('offset', (pageIndex * pageSize).toString());
  url.searchParams.set('limit', pageSize.toString());
  url.searchParams.set('filterMode', filterMode);

  comparisonEvalIds.forEach((compId) => {
    url.searchParams.append('comparisonEvalIds', compId);
  });

  if (searchText) {
    url.searchParams.set('search', searchText);
  }

  filters.forEach((filter) => {
    url.searchParams.append(
      'filter',
      JSON.stringify({
        logicOperator: filter.logicOperator,
        type: filter.type,
        operator: filter.operator,
        value: filter.value,
        field: filter.field,
      }),
    );
  });

  const resp = await callApi(url.toString().replace(window.location.origin, ''));

  if (!resp.ok) {
    throw new Error(`Failed to fetch eval data: ${resp.status} ${resp.statusText}`);
  }

  return (await resp.json()) as EvalTableDTO;
}

/**
 * React Query hook to fetch evaluation table data.
 *
 * This hook automatically:
 * - Caches results based on evalId and query parameters
 * - Deduplicates simultaneous requests
 * - Provides loading and error states
 * - Supports pagination, filtering, and search
 */
export function useEvalTable(
  evalId: string | null,
  options: UseEvalTableOptions = {},
): UseEvalTableResult {
  const normalizedOptions = normalizeEvalTableOptions(options);

  const query = useQuery({
    queryKey: evalKeys.table(evalId, normalizedOptions),
    queryFn: async () => {
      if (!evalId) {
        return null;
      }
      return fetchEvalTable(evalId, normalizedOptions);
    },
    enabled: !!evalId,
    staleTime: 30 * 1000, // 30 seconds - eval data changes less frequently
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    retry: 1,
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to prefetch eval table data.
 * Useful for preloading data before navigation.
 */
export function usePrefetchEvalTable() {
  const queryClient = useQueryClient();

  return (evalId: string, options: UseEvalTableOptions = {}) => {
    const normalizedOptions = normalizeEvalTableOptions(options);

    queryClient.prefetchQuery({
      queryKey: evalKeys.table(evalId, normalizedOptions),
      queryFn: () => fetchEvalTable(evalId, normalizedOptions),
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000, // CONSISTENCY FIX: Match useEvalTable gcTime
    });
  };
}
