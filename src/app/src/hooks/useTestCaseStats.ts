import { useEffect, useState } from 'react';

import { callApi } from '@app/utils/api';

/**
 * Statistics for a test case across all evaluations.
 */
export interface TestCaseStats {
  totalResults: number;
  passCount: number;
  failCount: number;
  errorCount: number;
  passRate: number;
  avgScore: number;
  avgLatencyMs: number | null;
  avgCost: number | null;
  evalCount: number;
  firstSeenAt: number | null;
  lastSeenAt: number | null;
}

interface UseTestCaseStatsResult {
  stats: TestCaseStats | null;
  loading: boolean;
  error: string | null;
}

/**
 * Hook for fetching test case statistics.
 * Separates data fetching from presentation per UI Guidelines Rule 4.
 *
 * @param testCaseId - The stable test case ID (must start with 'tc-')
 * @returns Object containing stats, loading state, and error
 */
export function useTestCaseStats(testCaseId: string | undefined): UseTestCaseStatsResult {
  const [stats, setStats] = useState<TestCaseStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const fetchStats = async () => {
      // Skip if testCaseId is invalid
      // Valid test case IDs are prefixed with 'tc-'
      if (!testCaseId || !testCaseId.startsWith('tc-')) {
        setLoading(false);
        setStats(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await callApi(`/test-cases/${testCaseId}/stats`);
        if (!response.ok) {
          if (response.status === 404) {
            // Test case not found - this is expected for new test cases
            if (isActive) {
              setStats(null);
            }
          } else {
            throw new Error('Failed to fetch test case stats');
          }
          return;
        }
        const data = await response.json();
        if (isActive) {
          setStats(data.stats);
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

    fetchStats();

    return () => {
      isActive = false;
    };
  }, [testCaseId]);

  return { stats, loading, error };
}
