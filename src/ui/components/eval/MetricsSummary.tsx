/**
 * MetricsSummary - Displays aggregate metrics for the evaluation.
 *
 * Shows total test results, request counts, token usage, cost, and timing.
 */

import { Box, Text } from 'ink';
import { useEvalState } from '../../contexts/EvalContext';
import { formatCost, formatDuration, formatPercent, formatTokens } from '../../utils/format';

/**
 * MetricsSummary component.
 *
 * Displays aggregate metrics across all providers including:
 * - Test pass/fail/error counts
 * - Request counts and cache rate
 * - Token usage
 * - Total cost
 * - Elapsed time and ETA
 */
export function MetricsSummary() {
  const state = useEvalState();
  const {
    completedTests,
    totalTests,
    passedTests,
    failedTests,
    errorCount,
    totalRequests,
    cachedRequests,
    totalTokens,
    promptTokens,
    completionTokens,
    totalCost,
    elapsedMs,
    estimatedRemainingMs,
    phase,
  } = state;

  // Calculate rates
  const passRate = completedTests > 0 ? formatPercent(passedTests, completedTests) : '0%';
  const progressPercent = totalTests > 0 ? formatPercent(completedTests, totalTests) : '0%';
  const cacheHitRate = totalRequests > 0 ? Math.round((cachedRequests / totalRequests) * 100) : 0;

  // Estimate remaining time based on average time per test
  let estimatedRemaining = estimatedRemainingMs;
  if (estimatedRemaining === 0 && completedTests > 0 && completedTests < totalTests) {
    const avgTimePerTest = elapsedMs / completedTests;
    const remainingTests = totalTests - completedTests;
    estimatedRemaining = avgTimePerTest * remainingTests;
  }

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
      {/* Test results row */}
      <Box gap={2}>
        <Text>
          Tests: {completedTests}/{totalTests} ({progressPercent})
        </Text>
        <Text>
          <Text color="green">Pass: {passedTests}</Text> ({passRate})
        </Text>
        <Text color="red">Fail: {failedTests}</Text>
        {errorCount > 0 && <Text color="yellow">Error: {errorCount}</Text>}
      </Box>

      {/* Request/Token row */}
      <Box gap={2}>
        <Text>
          Requests: {totalRequests}
          {cachedRequests > 0 && (
            <Text dimColor>
              {' '}
              ({cachedRequests} cached, {cacheHitRate}%)
            </Text>
          )}
        </Text>
        <Text>
          Tokens: {formatTokens(totalTokens)}
          {(promptTokens > 0 || completionTokens > 0) && (
            <Text dimColor>
              {' '}
              ({formatTokens(promptTokens)}p/{formatTokens(completionTokens)}c)
            </Text>
          )}
        </Text>
        <Text>Cost: {formatCost(totalCost)}</Text>
      </Box>

      {/* Timing row */}
      <Box gap={2}>
        <Text>Elapsed: {formatDuration(elapsedMs)}</Text>
        {phase === 'evaluating' && estimatedRemaining > 0 && (
          <Text dimColor>~{formatDuration(estimatedRemaining)} remaining</Text>
        )}
        {phase === 'completed' && <Text color="green">Complete</Text>}
        {phase === 'error' && <Text color="red">Error</Text>}
      </Box>
    </Box>
  );
}

/**
 * Compact metrics summary for inline display.
 */
export function MetricsSummaryCompact() {
  const state = useEvalState();
  const {
    completedTests,
    totalTests,
    passedTests,
    failedTests,
    errorCount,
    totalRequests,
    totalTokens,
    totalCost,
    elapsedMs,
  } = state;

  const passRate = completedTests > 0 ? formatPercent(passedTests, completedTests) : '0%';

  return (
    <Box gap={2}>
      <Text>
        {completedTests}/{totalTests}
      </Text>
      <Text color="green">{passedTests}</Text>
      <Text>/</Text>
      <Text color="red">{failedTests}</Text>
      {errorCount > 0 && (
        <>
          <Text>/</Text>
          <Text color="yellow">{errorCount}</Text>
        </>
      )}
      <Text dimColor>({passRate})</Text>
      {totalRequests > 0 && <Text dimColor>{totalRequests} reqs</Text>}
      {totalTokens > 0 && <Text dimColor>{formatTokens(totalTokens)}</Text>}
      {totalCost > 0 && <Text dimColor>{formatCost(totalCost)}</Text>}
      <Text dimColor>{formatDuration(elapsedMs)}</Text>
    </Box>
  );
}

/**
 * Detailed metrics breakdown with provider comparison.
 */
export function MetricsDetail() {
  const state = useEvalState();
  const { providers, providerOrder, totalCost, totalTokens, totalRequests } = state;

  // Calculate per-provider percentages of total
  const providerStats = providerOrder
    .map((id) => {
      const p = providers[id];
      if (!p) {
        return null;
      }
      return {
        id,
        label: p.label,
        costPercent: totalCost > 0 ? (p.cost / totalCost) * 100 : 0,
        tokenPercent: totalTokens > 0 ? (p.tokens.total / totalTokens) * 100 : 0,
        requestPercent: totalRequests > 0 ? (p.requests.total / totalRequests) * 100 : 0,
        passRate:
          p.testCases.completed > 0 ? (p.testCases.passed / p.testCases.completed) * 100 : 0,
      };
    })
    .filter(Boolean);

  // Find best and worst performing providers
  const sortedByPassRate = [...providerStats].sort(
    (a, b) => (b?.passRate ?? 0) - (a?.passRate ?? 0),
  );
  const best = sortedByPassRate[0];
  const worst = sortedByPassRate[sortedByPassRate.length - 1];

  return (
    <Box flexDirection="column">
      <Text bold>Metrics Detail</Text>

      {/* Cost breakdown */}
      <Box marginTop={1}>
        <Text dimColor>Cost breakdown:</Text>
      </Box>
      {providerStats.map((p) =>
        p ? (
          <Box key={p.id}>
            <Text>
              {' '}
              {p.label}: {formatCost(providers[p.id]?.cost ?? 0)} ({Math.round(p.costPercent)}%)
            </Text>
          </Box>
        ) : null,
      )}

      {/* Performance comparison */}
      {best && worst && best.id !== worst.id && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Performance:</Text>
          <Text color="green">
            {' '}
            Best: {best.label} ({Math.round(best.passRate)}% pass)
          </Text>
          <Text color="red">
            {' '}
            Worst: {worst.label} ({Math.round(worst.passRate)}% pass)
          </Text>
        </Box>
      )}
    </Box>
  );
}
