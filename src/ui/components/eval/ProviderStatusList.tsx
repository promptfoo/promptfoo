/**
 * Component for displaying provider-level status during evaluation.
 */

import React from 'react';

import { Box, Text } from 'ink';
import { LIMITS } from '../../constants';
import { type ProviderStatus, useEvalState } from '../../contexts/EvalContext';
import { Spinner } from '../shared/Spinner';

export interface ProviderStatusItemProps {
  provider: ProviderStatus;
  showDetails?: boolean;
}

function ProviderStatusItem({ provider, showDetails = true }: ProviderStatusItemProps) {
  const { label, testCases, status, currentTest } = provider;
  const { completed, total, errors } = testCases;

  // Status indicator
  let statusIcon: React.ReactNode;
  let statusColor: 'green' | 'yellow' | 'red' | 'cyan' | 'gray' = 'gray';

  switch (status) {
    case 'pending':
      statusIcon = <Text dimColor>○</Text>;
      statusColor = 'gray';
      break;
    case 'running':
      statusIcon = <Spinner type="dots" color="cyan" />;
      statusColor = 'cyan';
      break;
    case 'completed':
      statusIcon = <Text color="green">✓</Text>;
      statusColor = 'green';
      break;
    case 'error':
      statusIcon = <Text color="red">✗</Text>;
      statusColor = 'red';
      break;
  }

  // Progress text
  const progressText = total > 0 ? `${completed}/${total}` : '';
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Truncate label if too long
  const displayLabel =
    label.length > LIMITS.MAX_LABEL_LENGTH
      ? label.slice(0, LIMITS.MAX_LABEL_LENGTH - 3) + '...'
      : label;

  return (
    <Box>
      {/* Status icon */}
      <Box width={3}>{statusIcon}</Box>

      {/* Provider name */}
      <Box width={LIMITS.MAX_LABEL_LENGTH + 2}>
        <Text color={statusColor}>{displayLabel}</Text>
      </Box>

      {/* Progress */}
      {total > 0 && (
        <Box width={15}>
          <Text dimColor>
            {progressText} ({percent}%)
          </Text>
        </Box>
      )}

      {/* Error count */}
      {errors > 0 && (
        <Box marginLeft={1}>
          <Text color="red">
            {errors} error{errors > 1 ? 's' : ''}
          </Text>
        </Box>
      )}

      {/* Current test (if showing details) */}
      {showDetails && status === 'running' && currentTest && (
        <Box marginLeft={1}>
          <Text dimColor>
            → {currentTest.length > 30 ? currentTest.slice(0, 27) + '...' : currentTest}
          </Text>
        </Box>
      )}
    </Box>
  );
}

export interface ProviderStatusListProps {
  /** Maximum number of providers to show */
  maxItems?: number;
  /** Whether to show detailed status for each provider */
  showDetails?: boolean;
  /** Whether to show only active (running) providers */
  onlyActive?: boolean;
}

export function ProviderStatusList({
  maxItems = 10,
  showDetails = true,
  onlyActive = false,
}: ProviderStatusListProps) {
  const { providers, providerOrder, showProviderDetails } = useEvalState();

  // Filter and sort providers
  let displayProviders = providerOrder
    .map((id) => providers[id])
    .filter((p): p is ProviderStatus => !!p);

  if (onlyActive) {
    displayProviders = displayProviders.filter((p) => p.status === 'running');
  }

  // Limit number of items
  const hasMore = displayProviders.length > maxItems;
  const visibleProviders = displayProviders.slice(0, maxItems);

  if (visibleProviders.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column">
      <Text bold dimColor>
        Providers:
      </Text>
      {visibleProviders.map((provider) => (
        <ProviderStatusItem
          key={provider.id}
          provider={provider}
          showDetails={showDetails && showProviderDetails}
        />
      ))}
      {hasMore && <Text dimColor>... and {displayProviders.length - maxItems} more</Text>}
    </Box>
  );
}

/**
 * Compact provider summary (for narrow terminals).
 */
export function ProviderStatusSummary() {
  const { providers, providerOrder } = useEvalState();

  const providerList = providerOrder.map((id) => providers[id]).filter(Boolean);

  const running = providerList.filter((p) => p.status === 'running').length;
  const completed = providerList.filter((p) => p.status === 'completed').length;
  const errors = providerList.filter((p) => p.status === 'error').length;
  const total = providerList.length;

  return (
    <Box>
      <Text>Providers: </Text>
      {running > 0 && <Text color="cyan">{running} running</Text>}
      {running > 0 && completed > 0 && <Text>, </Text>}
      {completed > 0 && <Text color="green">{completed} done</Text>}
      {errors > 0 && (
        <>
          <Text>, </Text>
          <Text color="red">{errors} error</Text>
        </>
      )}
      <Text dimColor> ({total} total)</Text>
    </Box>
  );
}
