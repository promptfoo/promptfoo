/**
 * ProviderDashboard - Displays per-provider metrics in a table format.
 *
 * Shows pass/fail/error rates, request counts, token usage, cost, and latency
 * for each provider in the evaluation.
 */

import { Box, Text } from 'ink';
import { useEvalState, type ProviderMetrics } from '../../contexts/EvalContext';
import {
  formatAvgLatency,
  formatCost,
  formatPercent,
  formatTokens,
  truncate,
} from '../../utils/format';
import { ProgressBar } from '../shared/ProgressBar';

/**
 * Props for ProviderRow component.
 */
interface ProviderRowProps {
  provider: ProviderMetrics;
  isActive: boolean;
}

/**
 * Single row in the provider dashboard.
 */
function ProviderRow({ provider, isActive }: ProviderRowProps) {
  const { testCases, requests, tokens, cost, latency, status } = provider;

  // Calculate pass rate
  const passRate =
    testCases.completed > 0 ? Math.round((testCases.passed / testCases.completed) * 100) : 0;

  // Progress percentage
  const progressPercent =
    testCases.total > 0 ? Math.round((testCases.completed / testCases.total) * 100) : 0;

  // Status indicator
  const statusIndicator =
    status === 'completed' ? (
      <Text color="green">✓</Text>
    ) : status === 'error' ? (
      <Text color="red">✗</Text>
    ) : isActive ? (
      <Text color="cyan">●</Text>
    ) : null;

  return (
    <Box>
      {/* Provider name (truncated) */}
      <Box width={18}>
        <Text color={isActive ? 'cyan' : undefined}>{truncate(provider.label, 16)}</Text>
        {statusIndicator && <Text> </Text>}
        {statusIndicator}
      </Box>

      {/* Progress */}
      <Box width={12}>
        <ProgressBar value={progressPercent} max={100} width={8} showPercentage={false} />
        <Text dimColor> {progressPercent}%</Text>
      </Box>

      {/* Test counts: Pass/Fail/Error */}
      <Box width={14}>
        <Text color="green">{testCases.passed}</Text>
        <Text>/</Text>
        <Text color="red">{testCases.failed}</Text>
        {testCases.errors > 0 && (
          <>
            <Text>/</Text>
            <Text color="yellow">{testCases.errors}</Text>
          </>
        )}
        <Text dimColor> ({passRate}%)</Text>
      </Box>

      {/* Request count */}
      <Box width={10}>
        <Text>{requests.total}</Text>
        <Text dimColor> reqs</Text>
      </Box>

      {/* Token count */}
      <Box width={10}>
        <Text>{formatTokens(tokens.total)}</Text>
      </Box>

      {/* Cost */}
      <Box width={8}>
        <Text>{formatCost(cost)}</Text>
      </Box>

      {/* Average latency */}
      <Box width={8}>
        <Text dimColor>{formatAvgLatency(latency.totalMs, latency.count)}</Text>
      </Box>
    </Box>
  );
}

/**
 * ProviderDashboard component.
 *
 * Displays a table of provider metrics with pass/fail/error rates,
 * request counts, token usage, cost, and latency.
 */
export function ProviderDashboard() {
  const { providers, providerOrder, currentProvider } = useEvalState();

  // Only show if we have providers
  if (providerOrder.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold>Providers</Text>
        <Text dimColor> ({providerOrder.length})</Text>
      </Box>

      {/* Column headers */}
      <Box>
        <Box width={18}>
          <Text dimColor>Provider</Text>
        </Box>
        <Box width={12}>
          <Text dimColor>Progress</Text>
        </Box>
        <Box width={14}>
          <Text dimColor>Pass/Fail</Text>
        </Box>
        <Box width={10}>
          <Text dimColor>Requests</Text>
        </Box>
        <Box width={10}>
          <Text dimColor>Tokens</Text>
        </Box>
        <Box width={8}>
          <Text dimColor>Cost</Text>
        </Box>
        <Box width={8}>
          <Text dimColor>Latency</Text>
        </Box>
      </Box>

      {/* Provider rows */}
      {providerOrder.map((id) => {
        const provider = providers[id];
        if (!provider) {
          return null;
        }
        return <ProviderRow key={id} provider={provider} isActive={currentProvider === id} />;
      })}
    </Box>
  );
}

/**
 * Compact provider summary for when space is limited.
 *
 * Shows just the key metrics in a single line per provider.
 */
export function ProviderSummaryCompact() {
  const { providers, providerOrder, currentProvider } = useEvalState();

  if (providerOrder.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column">
      {providerOrder.map((id) => {
        const p = providers[id];
        if (!p) {
          return null;
        }
        const isActive = currentProvider === id;
        const passRate =
          p.testCases.completed > 0
            ? formatPercent(p.testCases.passed, p.testCases.completed)
            : '0%';

        return (
          <Box key={id}>
            <Text color={isActive ? 'cyan' : 'gray'}>{isActive ? '▶ ' : '  '}</Text>
            <Text color={isActive ? 'cyan' : undefined}>{truncate(p.label, 20)}</Text>
            <Text>: </Text>
            <Text color="green">{p.testCases.passed}</Text>
            <Text>/</Text>
            <Text color="red">{p.testCases.failed}</Text>
            <Text> ({passRate})</Text>
            {p.requests.total > 0 && <Text dimColor> · {p.requests.total} reqs</Text>}
            {p.tokens.total > 0 && <Text dimColor> · {formatTokens(p.tokens.total)}</Text>}
            {p.cost > 0 && <Text dimColor> · {formatCost(p.cost)}</Text>}
          </Box>
        );
      })}
    </Box>
  );
}
