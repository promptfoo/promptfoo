/**
 * Main evaluation screen component - Consolidated single-box UI.
 *
 * This is the primary UI component for displaying evaluation progress.
 * It shows all information in a clean, consolidated view without duplication.
 */

import { Box, Text, useApp } from 'ink';
import { useEffect, useRef } from 'react';
import { useEval, useEvalState } from '../../contexts/EvalContext';
import { useCompactMode } from '../../contexts/UIContext';
import { useNavigationKeys } from '../../hooks/useKeypress';
import { useTokenMetrics } from '../../hooks/useTokenMetrics';
import {
  formatCost,
  formatDuration,
  formatTokens,
  formatAvgLatency,
  truncate,
} from '../../utils/format';
import { ProgressBar } from '../shared/ProgressBar';
import { Spinner } from '../shared/Spinner';

export interface EvalScreenProps {
  /** Title for the evaluation */
  title?: string;
  /** Callback when evaluation completes */
  onComplete?: () => void;
  /** Callback when user requests exit (Escape/q) */
  onExit?: () => void;
  /** Whether to show keyboard shortcuts help */
  showHelp?: boolean;
}

// Column widths for consistent alignment
const COL_WIDTH = {
  status: 2,
  provider: 24,
  progress: 14,
  results: 12,
  tokens: 10,
  cost: 9,
  latency: 7,
};

/**
 * Table header row.
 */
function TableHeader() {
  return (
    <Box>
      <Box width={COL_WIDTH.status} />
      <Box width={COL_WIDTH.provider}>
        <Text dimColor>Provider</Text>
      </Box>
      <Box width={COL_WIDTH.progress}>
        <Text dimColor>Progress</Text>
      </Box>
      <Box width={COL_WIDTH.results} marginLeft={2}>
        <Text dimColor>Pass/Fail</Text>
      </Box>
      <Box width={COL_WIDTH.tokens}>
        <Text dimColor>Tokens</Text>
      </Box>
      <Box width={COL_WIDTH.cost}>
        <Text dimColor>Cost</Text>
      </Box>
      <Box width={COL_WIDTH.latency}>
        <Text dimColor>Avg</Text>
      </Box>
    </Box>
  );
}

/**
 * Single provider row with all metrics.
 */
function ProviderRow({
  label,
  testCases,
  tokens,
  cost,
  latency,
  status,
  isActive,
}: {
  label: string;
  testCases: { total: number; completed: number; passed: number; failed: number; errors: number };
  tokens: { total: number };
  cost: number;
  latency: { totalMs: number; count: number };
  status: string;
  isActive: boolean;
}) {
  const progressPercent =
    testCases.total > 0
      ? Math.min(100, Math.round((testCases.completed / testCases.total) * 100))
      : 0;

  // Status indicator
  const statusIcon =
    status === 'completed' ? (
      <Text color="green">✓</Text>
    ) : status === 'error' ? (
      <Text color="red">✗</Text>
    ) : isActive ? (
      <Text color="cyan">●</Text>
    ) : (
      <Text dimColor>○</Text>
    );

  // Pass/fail display - show passed ✓ and failed ✗ counts clearly
  const hasFailures = testCases.failed > 0 || testCases.errors > 0;
  const failCount = testCases.failed + testCases.errors;

  return (
    <Box>
      {/* Status icon */}
      <Box width={COL_WIDTH.status}>{statusIcon}</Box>

      {/* Provider name */}
      <Box width={COL_WIDTH.provider}>
        <Text color={isActive ? 'cyan' : undefined}>{truncate(label, COL_WIDTH.provider - 2)}</Text>
      </Box>

      {/* Progress bar with percentage */}
      <Box width={COL_WIDTH.progress}>
        <ProgressBar
          value={progressPercent}
          max={100}
          width={8}
          showPercentage={false}
          color={status === 'completed' ? 'green' : 'cyan'}
        />
        <Text dimColor> {testCases.completed}/{testCases.total}</Text>
      </Box>

      {/* Pass/fail counts - marginLeft adds gap after progress column */}
      <Box width={COL_WIDTH.results} marginLeft={2}>
        <Text color="green">{testCases.passed}✓</Text>
        {hasFailures && <Text color="red"> {failCount}✗</Text>}
        {!hasFailures && testCases.completed > 0 && <Text dimColor> {failCount}✗</Text>}
      </Box>

      {/* Tokens */}
      <Box width={COL_WIDTH.tokens}>
        <Text dimColor>{tokens.total > 0 ? formatTokens(tokens.total) : '-'}</Text>
      </Box>

      {/* Cost */}
      <Box width={COL_WIDTH.cost}>
        <Text dimColor>{cost > 0 ? formatCost(cost) : '-'}</Text>
      </Box>

      {/* Average latency */}
      <Box width={COL_WIDTH.latency}>
        <Text dimColor>{formatAvgLatency(latency.totalMs, latency.count)}</Text>
      </Box>
    </Box>
  );
}

/**
 * Compact summary line showing aggregate stats.
 */
function SummaryLine() {
  const {
    passedTests,
    failedTests,
    errorCount,
    totalTokens,
    promptTokens,
    completionTokens,
    totalCost,
    elapsedMs,
  } = useEvalState();

  const total = passedTests + failedTests + errorCount;
  const tokenDisplay = totalTokens || promptTokens + completionTokens;

  return (
    <Box marginTop={1}>
      {/* Pass count with color */}
      <Text color={passedTests === total ? 'green' : failedTests > 0 ? 'yellow' : 'white'}>
        {passedTests}/{total} passed
      </Text>

      {failedTests > 0 && <Text color="red"> · {failedTests} failed</Text>}

      {errorCount > 0 && <Text color="red"> · {errorCount} errors</Text>}

      {/* Tokens */}
      {tokenDisplay > 0 && <Text dimColor> · {formatTokens(tokenDisplay)} tokens</Text>}

      {/* Cost */}
      {totalCost > 0 && <Text dimColor> · {formatCost(totalCost)}</Text>}

      {/* Duration */}
      <Text dimColor> · {formatDuration(elapsedMs)}</Text>
    </Box>
  );
}

/**
 * Share URL display.
 */
function ShareUrlDisplay() {
  const { shareUrl } = useEvalState();

  if (!shareUrl) {
    return null;
  }

  return (
    <Box marginTop={1}>
      <Text color="green">✔ </Text>
      <Text color="cyan">{shareUrl}</Text>
    </Box>
  );
}

/**
 * Error summary (compact).
 */
function ErrorDisplay() {
  const { errors, showErrorDetails, errorCount } = useEvalState();

  if (errorCount === 0 || errors.length === 0) {
    return null;
  }

  if (!showErrorDetails) {
    return (
      <Box marginTop={1}>
        <Text color="red">
          {errorCount} error{errorCount > 1 ? 's' : ''} occurred
        </Text>
        <Text dimColor> (press 'e' to show details)</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="red" bold>
        Errors:
      </Text>
      {errors.slice(0, 3).map((error, i) => (
        <Box key={i} marginLeft={1}>
          <Text color="red">• </Text>
          <Text dimColor>{truncate(error.provider, 20)}: </Text>
          <Text>{truncate(error.message, 50)}</Text>
        </Box>
      ))}
      {errors.length > 3 && (
        <Box marginLeft={1}>
          <Text dimColor>... and {errors.length - 3} more</Text>
        </Box>
      )}
    </Box>
  );
}

const PHASE_LABELS: Record<string, string> = {
  initializing: 'Initializing',
  loading: 'Loading',
  evaluating: 'Running',
  grading: 'Grading',
  completed: 'Complete',
  error: 'Error',
};

export function EvalScreen({ title, onComplete, onExit, showHelp = true }: EvalScreenProps) {
  const { exit } = useApp();
  const { state, dispatch, isComplete, isRunning } = useEval();
  // Note: isCompact could be used for responsive layout in future
  const _compactMode = useCompactMode();
  const completeCalled = useRef(false);
  const isRawModeSupported = process.stdin.isTTY && typeof process.stdin.setRawMode === 'function';

  // Poll TokenUsageTracker for real-time token metrics
  useTokenMetrics(dispatch, state.providerOrder, isRunning, 500);

  // Handle keyboard input - only if raw mode is supported
  useNavigationKeys(
    isRawModeSupported
      ? {
          onEscape: () => {
            onExit?.();
            exit();
          },
        }
      : {},
  );

  // Handle additional key bindings - only if raw mode is supported
  useEffect(() => {
    if (!isRawModeSupported) {
      return;
    }

    const handleInput = (data: Buffer) => {
      const key = data.toString();
      switch (key.toLowerCase()) {
        case 'q':
          onExit?.();
          exit();
          break;
        case 'e':
          dispatch({ type: 'TOGGLE_ERROR_DETAILS' });
          break;
      }
    };

    process.stdin.on('data', handleInput);
    return () => {
      process.stdin.off('data', handleInput);
    };
  }, [dispatch, exit, onExit, isRawModeSupported]);

  // Update elapsed time while running
  useEffect(() => {
    if (state.phase !== 'evaluating' && state.phase !== 'grading') {
      return;
    }

    const timer = setInterval(() => {
      dispatch({ type: 'TICK' });
    }, 1000);

    return () => clearInterval(timer);
  }, [state.phase, dispatch]);

  // Call onComplete when done
  useEffect(() => {
    if (isComplete && !completeCalled.current) {
      completeCalled.current = true;
      onComplete?.();
    }
  }, [isComplete, onComplete]);

  // Get current provider for activity indicator
  const currentProvider = state.currentProvider;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={isComplete ? 'green' : 'gray'}
      paddingX={1}
      paddingY={0}
    >
      {/* Header: Title + Status */}
      <Box>
        <Text bold>{title || 'Evaluation'}</Text>
        <Box flexGrow={1} />
        {isRunning && <Spinner type="dots" color="cyan" />}
        <Text color={isComplete ? 'green' : 'cyan'}>
          {' '}
          {PHASE_LABELS[state.phase] || state.phase}
        </Text>
        {state.elapsedMs > 0 && <Text dimColor> ({formatDuration(state.elapsedMs)})</Text>}
      </Box>

      {/* Provider table */}
      {state.providerOrder.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <TableHeader />
          {state.providerOrder.map((id) => {
            const provider = state.providers[id];
            if (!provider) {
              return null;
            }
            return (
              <ProviderRow
                key={id}
                label={provider.label}
                testCases={provider.testCases}
                tokens={provider.tokens}
                cost={provider.cost}
                latency={provider.latency}
                status={provider.status}
                isActive={currentProvider === id}
              />
            );
          })}
        </Box>
      )}

      {/* Summary line */}
      <SummaryLine />

      {/* Share URL */}
      <ShareUrlDisplay />

      {/* Errors */}
      <ErrorDisplay />

      {/* Help text - only when running and raw mode supported */}
      {showHelp && !isComplete && isRawModeSupported && (
        <Box marginTop={1}>
          <Text dimColor>Press </Text>
          <Text color="cyan">q</Text>
          <Text dimColor> to quit</Text>
          {state.errorCount > 0 && (
            <>
              <Text dimColor>, </Text>
              <Text color="cyan">e</Text>
              <Text dimColor> for errors</Text>
            </>
          )}
        </Box>
      )}
    </Box>
  );
}

export default EvalScreen;
