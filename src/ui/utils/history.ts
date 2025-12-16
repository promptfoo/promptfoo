/**
 * History utilities for the Ink UI.
 *
 * Provides functions to fetch evaluation history and load past evaluations.
 */

import Eval from '../../models/eval';
import type { CompletedPrompt, EvaluateTable } from '../../types/index';

/**
 * Represents a lightweight eval for listing in the history browser.
 */
export interface EvalListItem {
  id: string;
  createdAt: number;
  description?: string;
  author?: string;
  /** Number of test cases */
  testCount: number;
  /** Number of passed results */
  passCount: number;
  /** Number of failed results */
  failCount: number;
  /** Number of error results */
  errorCount: number;
  /** Pass rate as percentage (0-100) */
  passRate: number;
  /** Number of providers */
  providerCount: number;
  /** Total cost across all prompts (if available) */
  totalCost?: number;
  /** Provider labels for display */
  providerLabels: string[];
}

/**
 * Extract metrics from CompletedPrompt array.
 */
function extractMetrics(prompts: CompletedPrompt[]): {
  testCount: number;
  passCount: number;
  failCount: number;
  errorCount: number;
  passRate: number;
  totalCost: number | undefined;
} {
  let passCount = 0;
  let failCount = 0;
  let errorCount = 0;
  let totalCost = 0;
  let hasCost = false;

  for (const prompt of prompts) {
    const metrics = prompt.metrics;
    if (metrics) {
      passCount += metrics.testPassCount ?? 0;
      failCount += metrics.testFailCount ?? 0;
      errorCount += metrics.testErrorCount ?? 0;
      if (metrics.cost !== undefined) {
        totalCost += metrics.cost;
        hasCost = true;
      }
    }
  }

  // Test count is per prompt (same tests run against each)
  const testsPerPrompt = passCount + failCount + errorCount;
  const testCount = prompts.length > 0 ? testsPerPrompt / prompts.length : 0;
  const totalResults = passCount + failCount + errorCount;
  const passRate = totalResults > 0 ? (passCount / totalResults) * 100 : 0;

  return {
    testCount: Math.round(testCount),
    passCount,
    failCount,
    errorCount,
    passRate,
    totalCost: hasCost ? totalCost : undefined,
  };
}

/**
 * Fetch list of past evaluations for the history browser.
 *
 * @param limit - Maximum number of evals to fetch (default: 50)
 * @returns Array of lightweight eval items sorted by createdAt desc
 */
export async function fetchEvalList(limit: number = 50): Promise<EvalListItem[]> {
  const evals = await Eval.getMany(limit);

  return evals.map((eval_) => {
    const { testCount, passCount, failCount, errorCount, passRate, totalCost } = extractMetrics(
      eval_.prompts,
    );

    const providerLabels = eval_.prompts.map((p) => p.label || p.provider || 'unknown');

    return {
      id: eval_.id,
      createdAt: eval_.createdAt,
      description: eval_.config.description,
      author: eval_.author,
      testCount,
      passCount,
      failCount,
      errorCount,
      passRate,
      providerCount: eval_.prompts.length,
      totalCost,
      providerLabels,
    };
  });
}

/**
 * Fetch a specific evaluation and return its table data.
 *
 * @param evalId - The ID of the eval to fetch
 * @returns The EvaluateTable for the specified eval, or null if not found
 */
export async function fetchEvalTable(evalId: string): Promise<EvaluateTable | null> {
  const eval_ = await Eval.findById(evalId);
  if (!eval_) {
    return null;
  }

  return eval_.getTable();
}

/**
 * Format a timestamp as relative time (e.g., "2 hours ago", "Yesterday").
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 7) {
    // Show date for older items
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  if (days > 1) {
    return `${days} days ago`;
  }

  if (days === 1) {
    return 'Yesterday';
  }

  if (hours > 1) {
    return `${hours} hours ago`;
  }

  if (hours === 1) {
    return '1 hour ago';
  }

  if (minutes > 1) {
    return `${minutes} minutes ago`;
  }

  if (minutes === 1) {
    return '1 minute ago';
  }

  return 'Just now';
}

/**
 * Extract short ID from full eval ID.
 * Example: "eval-abc-2025-12-10T14-30-00" -> "abc-2025-12-10"
 */
export function formatShortId(evalId: string): string {
  // Remove "eval-" prefix if present
  const withoutPrefix = evalId.replace(/^eval-/, '');

  // Try to extract meaningful short form
  // Format is typically: xxx-YYYY-MM-DDTHH-MM-SS
  const match = withoutPrefix.match(/^([a-z0-9]+)-(\d{4}-\d{2}-\d{2})/i);
  if (match) {
    return `${match[1]}-${match[2]}`;
  }

  // Fallback: take first 20 chars
  return withoutPrefix.slice(0, 20);
}

/**
 * Get pass rate indicator based on percentage.
 */
export function getPassRateIndicator(passRate: number): { symbol: string; color: string } {
  if (passRate >= 90) {
    return { symbol: '✓', color: 'green' };
  }
  if (passRate >= 70) {
    return { symbol: '✓', color: 'yellow' };
  }
  return { symbol: '✗', color: 'red' };
}
