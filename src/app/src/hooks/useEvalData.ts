import { useCallback } from 'react';
import { useTableStore } from '@app/pages/eval/components/store';
import { callApi } from '@app/utils/api';
import type { EvalTableDTO } from '@promptfoo/types';

interface FetchEvalOptions {
  pageIndex?: number;
  pageSize?: number;
  filter?: string;
  comparisonEvalIds?: string[];
  searchText?: string;
  selectedMetric?: string | null;
  skipSetEvalId?: boolean;
}

export function useEvalData() {
  const {
    evalId: currentEvalId,
    setTable,
    setConfig,
    setVersion,
    setAuthor,
    setFilteredResultsCount,
    setTotalResultsCount,
    setEvalId,
  } = useTableStore();

  const fetchEvalById = useCallback(
    async (id: string, options: FetchEvalOptions = {}) => {
      const {
        pageIndex = 0,
        pageSize = 50,
        filter = 'all',
        comparisonEvalIds = [],
        searchText = '',
        selectedMetric = null,
        skipSetEvalId = false,
      } = options;

      const searchParams = new URLSearchParams();
      searchParams.append('offset', String(pageIndex * pageSize));
      searchParams.append('limit', String(pageSize));

      if (filter) {
        searchParams.append('filter', filter);
      }

      comparisonEvalIds.forEach((comparisonId) => {
        searchParams.append('comparisonEvalIds', comparisonId);
      });

      if (searchText) {
        searchParams.append('search', searchText);
      }
      if (selectedMetric) {
        searchParams.append('metric', selectedMetric);
      }

      const url = `/eval/${id}/table?${searchParams.toString()}`;

      try {
        const resp = await callApi(url);

        if (!resp.ok) {
          return { success: false, error: 'Failed to fetch evaluation' };
        }

        const body = (await resp.json()) as EvalTableDTO;

        setTable(body.table);
        setFilteredResultsCount(body.filteredCount);
        setTotalResultsCount(body.totalCount);
        setConfig(body.config);
        setVersion(body.version);
        setAuthor(body.author);

        // Only update evalId if needed to prevent loops
        if (!skipSetEvalId && id !== currentEvalId) {
          setEvalId(id);
        }

        return { success: true, data: body };
      } catch (error) {
        console.error('Error fetching eval data:', error);
        return { success: false, error };
      }
    },
    [
      currentEvalId,
      setTable,
      setConfig,
      setVersion,
      setAuthor,
      setFilteredResultsCount,
      setTotalResultsCount,
      setEvalId,
    ],
  );

  return { fetchEvalById };
}
