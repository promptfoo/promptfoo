import { useCallback, useState } from 'react';

import { callApi } from '@app/utils/api';
// Import shared types from the backend service to avoid type duplication.
// These types are the single source of truth for bulk rating API contracts.
import type {
  BulkRatingPreviewResponse,
  BulkRatingRequest,
  BulkRatingResponse,
} from '@promptfoo/services/bulkGrade/types';
import type { EvalResultsFilterMode } from '@promptfoo/types';

// Re-export types for convenience
export type { BulkRatingPreviewResponse, BulkRatingRequest, BulkRatingResponse };

// Re-export the constants so consumers don't need to import from two places
export { BULK_RATING_CONSTANTS } from '@promptfoo/services/bulkGrade/types';

/**
 * Custom hook for bulk rating operations on eval results.
 * Provides methods for bulk rating and preview count fetching with loading states.
 */
export function useBulkRating(evalId: string | null) {
  const [isLoading, setIsLoading] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  /**
   * Fetches the count of results matching the current filter (for preview).
   * Errors are now surfaced via the previewError state.
   */
  const fetchPreviewCount = useCallback(
    async (
      filterMode: EvalResultsFilterMode,
      filters?: string[],
      searchQuery?: string,
    ): Promise<number> => {
      if (!evalId) {
        return 0;
      }

      setIsLoadingPreview(true);
      setPreviewError(null);
      try {
        const params = new URLSearchParams({
          filterMode,
        });
        if (filters && filters.length > 0) {
          params.set('filters', JSON.stringify(filters));
        }
        if (searchQuery) {
          params.set('searchQuery', searchQuery);
        }

        const response = await callApi(
          `/eval/${evalId}/results/bulk-rating/preview?${params.toString()}`,
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || 'Failed to fetch preview count');
        }

        const data: BulkRatingPreviewResponse = await response.json();
        setPreviewCount(data.count);
        return data.count;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to fetch preview';
        setPreviewError(errorMessage);
        setPreviewCount(null);
        throw error;
      } finally {
        setIsLoadingPreview(false);
      }
    },
    [evalId],
  );

  /**
   * Clears the preview error state.
   */
  const clearPreviewError = useCallback(() => {
    setPreviewError(null);
  }, []);

  /**
   * Performs the bulk rating operation.
   */
  const bulkRate = useCallback(
    async (request: BulkRatingRequest): Promise<BulkRatingResponse> => {
      if (!evalId) {
        return {
          success: false,
          matched: 0,
          updated: 0,
          skipped: 0,
          error: 'No eval ID provided',
        };
      }

      setIsLoading(true);
      try {
        const response = await callApi(`/eval/${evalId}/results/bulk-rating`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
        });

        const data: BulkRatingResponse = await response.json();

        if (!response.ok) {
          return {
            success: false,
            matched: data.matched || 0,
            updated: 0,
            skipped: 0,
            error: data.error || `Request failed with status ${response.status}`,
          };
        }

        return data;
      } catch (error) {
        return {
          success: false,
          matched: 0,
          updated: 0,
          skipped: 0,
          error: error instanceof Error ? error.message : 'An error occurred',
        };
      } finally {
        setIsLoading(false);
      }
    },
    [evalId],
  );

  return {
    bulkRate,
    isLoading,
    fetchPreviewCount,
    previewCount,
    isLoadingPreview,
    previewError,
    clearPreviewError,
  };
}
