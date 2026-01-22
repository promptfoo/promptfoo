import { useCallback, useEffect, useState } from 'react';

import { callApi } from '@app/utils/api';

import type { TestCaseStats } from './useTestCaseStats';

/**
 * Test case data as returned from the API.
 */
export interface TestCase {
  id: string;
  fingerprint: string;
  description?: string;
  vars?: Record<string, unknown>;
  asserts?: unknown[];
  metadata?: Record<string, unknown>;
  sourceType?: string;
  sourceRef?: string;
  sourceRow?: number;
  createdAt: number;
  updatedAt: number;
  stats?: TestCaseStats;
}

interface UseTestCasesOptions {
  limit?: number;
  offset?: number;
  includeStats?: boolean;
}

interface UseTestCasesResult {
  testCases: TestCase[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  hasMore: boolean;
  loadMore: () => void;
}

/**
 * Hook for fetching a paginated list of test cases.
 * Separates data fetching from presentation per UI Guidelines Rule 4.
 *
 * @param options - Pagination and filtering options
 * @returns Object containing test cases, loading state, error, and pagination controls
 */
export function useTestCases(options: UseTestCasesOptions = {}): UseTestCasesResult {
  const { limit = 50, includeStats = true } = options;

  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const fetchTestCases = useCallback(
    async (currentOffset: number, append = false) => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          limit: String(limit),
          offset: String(currentOffset),
          ...(includeStats && { includeStats: 'true' }),
        });

        const response = await callApi(`/test-cases?${params.toString()}`);

        if (!response.ok) {
          throw new Error('Failed to fetch test cases');
        }

        const data = await response.json();
        const newTestCases = data.testCases as TestCase[];

        if (append) {
          setTestCases((prev) => [...prev, ...newTestCases]);
        } else {
          setTestCases(newTestCases);
        }

        // If we received fewer items than the limit, there are no more
        setHasMore(newTestCases.length === limit);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    },
    [limit, includeStats],
  );

  // Initial fetch
  useEffect(() => {
    fetchTestCases(0);
  }, [fetchTestCases]);

  const refetch = useCallback(() => {
    setOffset(0);
    fetchTestCases(0);
  }, [fetchTestCases]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      const newOffset = offset + limit;
      setOffset(newOffset);
      fetchTestCases(newOffset, true);
    }
  }, [loading, hasMore, offset, limit, fetchTestCases]);

  return {
    testCases,
    loading,
    error,
    refetch,
    hasMore,
    loadMore,
  };
}

/**
 * History entry for a test case result.
 */
export interface TestCaseHistoryEntry {
  evalId: string;
  evalCreatedAt: number;
  success: boolean;
  score: number;
  latencyMs: number | null;
  cost: number | null;
  provider: { id: string; label?: string };
  promptIdx: number;
}

interface UseTestCaseHistoryResult {
  history: TestCaseHistoryEntry[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
}

/**
 * Hook for fetching the result history of a specific test case.
 *
 * @param testCaseId - The test case ID
 * @param options - Pagination options
 * @returns Object containing history entries, loading state, and pagination controls
 */
export function useTestCaseHistory(
  testCaseId: string | undefined,
  options: { limit?: number } = {},
): UseTestCaseHistoryResult {
  const { limit = 100 } = options;

  const [history, setHistory] = useState<TestCaseHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const fetchHistory = useCallback(
    async (currentOffset: number, append = false) => {
      if (!testCaseId || !testCaseId.startsWith('tc-')) {
        setLoading(false);
        setHistory([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          limit: String(limit),
          offset: String(currentOffset),
        });

        const response = await callApi(`/test-cases/${testCaseId}/history?${params.toString()}`);

        if (!response.ok) {
          if (response.status === 404) {
            setHistory([]);
            setHasMore(false);
            return;
          }
          throw new Error('Failed to fetch test case history');
        }

        const data = await response.json();
        const newHistory = data.history as TestCaseHistoryEntry[];

        if (append) {
          setHistory((prev) => [...prev, ...newHistory]);
        } else {
          setHistory(newHistory);
        }

        setHasMore(newHistory.length === limit);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    },
    [testCaseId, limit],
  );

  useEffect(() => {
    setOffset(0);
    fetchHistory(0);
  }, [fetchHistory]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      const newOffset = offset + limit;
      setOffset(newOffset);
      fetchHistory(newOffset, true);
    }
  }, [loading, hasMore, offset, limit, fetchHistory]);

  return {
    history,
    loading,
    error,
    hasMore,
    loadMore,
  };
}

interface UseTestCaseResult {
  testCase: TestCase | null;
  loading: boolean;
  error: string | null;
}

/**
 * Hook for fetching a single test case by ID.
 *
 * @param testCaseId - The test case ID
 * @returns Object containing test case, loading state, and error
 */
export function useTestCase(testCaseId: string | undefined): UseTestCaseResult {
  const [testCase, setTestCase] = useState<TestCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const fetchTestCase = async () => {
      if (!testCaseId || !testCaseId.startsWith('tc-')) {
        setLoading(false);
        setTestCase(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await callApi(`/test-cases/${testCaseId}`);

        if (!response.ok) {
          if (response.status === 404) {
            if (isActive) {
              setTestCase(null);
            }
            return;
          }
          throw new Error('Failed to fetch test case');
        }

        const data = await response.json();
        if (isActive) {
          setTestCase(data.testCase);
        }
      } catch (err) {
        if (isActive) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    fetchTestCase();

    return () => {
      isActive = false;
    };
  }, [testCaseId]);

  return { testCase, loading, error };
}
