import { useCallback, useEffect, useRef, useState } from 'react';

import { callApi } from '@app/utils/api';
import { MEDIA_PAGE_SIZE } from '@app/utils/media';

import type {
  EvalOption,
  MediaItem,
  MediaLibraryResponse,
  MediaSort,
  MediaTypeFilter,
} from '../types';

interface UseMediaItemsOptions {
  type?: MediaTypeFilter;
  evalId?: string;
  sort?: MediaSort;
}

interface UseMediaItemsResult {
  items: MediaItem[];
  total: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useMediaItems({
  type,
  evalId,
  sort = { field: 'createdAt', order: 'desc' },
}: UseMediaItemsOptions = {}): UseMediaItemsResult {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Track current offset in a ref to avoid stale closure issues
  const offsetRef = useRef(0);
  // AbortController to cancel in-flight requests when filters change
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchItems = useCallback(
    async (loadingMore = false, signal?: AbortSignal) => {
      if (loadingMore) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
        offsetRef.current = 0;
      }
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set('limit', MEDIA_PAGE_SIZE.toString());
        params.set('offset', loadingMore ? offsetRef.current.toString() : '0');

        if (type && type !== 'all') {
          params.set('type', type);
        }
        if (evalId) {
          params.set('evalId', evalId);
        }
        if (sort) {
          params.set('sortField', sort.field);
          params.set('sortOrder', sort.order);
        }

        const response = await callApi(`/blobs/library?${params.toString()}`, { signal });

        // Check if request was aborted
        if (signal?.aborted) {
          return;
        }

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || 'Failed to load media');
        }

        const result = data.data as MediaLibraryResponse;

        if (loadingMore) {
          setItems((prev) => [...prev, ...result.items]);
          offsetRef.current += result.items.length;
        } else {
          setItems(result.items);
          offsetRef.current = result.items.length;
        }

        setTotal(result.total);
        setHasMore(result.hasMore);
      } catch (err) {
        // Ignore abort errors
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setError(err instanceof Error ? err.message : 'Failed to load media');
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [type, evalId, sort],
  );

  const loadMore = useCallback(async () => {
    if (!isLoadingMore && hasMore) {
      // Create new abort controller for loadMore request
      const controller = new AbortController();
      abortControllerRef.current = controller;
      await fetchItems(true, controller.signal);
    }
  }, [fetchItems, isLoadingMore, hasMore]);

  const refresh = useCallback(async () => {
    // Cancel any in-flight request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    await fetchItems(false, abortControllerRef.current.signal);
  }, [fetchItems]);

  // Initial load and filter changes
  useEffect(() => {
    // Cancel any in-flight request when filters change
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    fetchItems(false, abortControllerRef.current.signal);

    // Cleanup on unmount or filter change
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [fetchItems]);

  return {
    items,
    total,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
  };
}

/**
 * Result of fetching a single media item
 */
export interface FetchMediaItemResult {
  item: MediaItem | null;
  error: 'not_found' | 'network_error' | 'server_error' | null;
}

/**
 * Fetch a single media item by hash (for deep linking).
 * Returns both the item and any error that occurred for proper user feedback.
 */
export async function fetchMediaItemByHash(hash: string): Promise<FetchMediaItemResult> {
  try {
    const response = await callApi(`/blobs/library?hash=${encodeURIComponent(hash)}&limit=1`);

    if (!response.ok) {
      return { item: null, error: 'server_error' };
    }

    const data = await response.json();

    if (!data.success) {
      return { item: null, error: 'server_error' };
    }

    if (!data.data.items.length) {
      return { item: null, error: 'not_found' };
    }

    return { item: data.data.items[0], error: null };
  } catch (err) {
    // Network errors (offline, CORS, etc.)
    console.error('[useMediaItems] Failed to fetch media item by hash:', err);
    return { item: null, error: 'network_error' };
  }
}

interface UseEvalsWithMediaResult {
  evals: EvalOption[];
  isLoading: boolean;
  error: string | null;
}

export function useEvalsWithMedia(): UseEvalsWithMediaResult {
  const [evals, setEvals] = useState<EvalOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await callApi('/blobs/library/evals');
        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || 'Failed to load evals');
        }

        setEvals(data.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load evals');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  return { evals, isLoading, error };
}
