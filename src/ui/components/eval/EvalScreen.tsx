/**
 * Main evaluation screen component - Consolidated single-box UI.
 *
 * This is the primary UI component for displaying evaluation progress.
 * It shows all information in a clean, consolidated view without duplication.
 */

import React, { memo, useEffect, useRef, useState } from 'react';

import { Box, Text, useApp } from 'ink';
import { EVAL_COL_WIDTH, TIMING } from '../../constants';
import { useEval, useEvalState } from '../../contexts/EvalContext';
import { useKeypress } from '../../hooks/useKeypress';
import { useTerminalTitle } from '../../hooks/useTerminalTitle';
import { useTokenMetrics } from '../../hooks/useTokenMetrics';
import {
  calculateETA,
  formatAvgLatency,
  formatCost,
  formatDuration,
  formatETA,
  formatTokens,
  truncate,
} from '../../utils/format';
import { setInkUITransportLevel } from '../../utils/InkUITransport';
import { ProgressBar } from '../shared/ProgressBar';
import { Spinner } from '../shared/Spinner';
import { EvalHelpOverlay } from './EvalHelpOverlay';
import { HelpBar } from './HelpBar';
import { LogPanel } from './LogPanel';

export interface ShareContext {
  /** Organization name (from cloud config) */
  organizationName: string;
  /** Team name if applicable */
  teamName?: string;
}

/**
 * Props for the main evaluation screen component.
 *
 * The EvalScreen displays real-time evaluation progress with:
 * - Per-provider status (progress bars, pass/fail counts)
 * - Token usage and cost tracking
 * - Keyboard shortcuts for navigation and control
 * - Results table when evaluation completes
 *
 * @example
 * ```tsx
 * <EvalScreen
 *   title="My Evaluation"
 *   onComplete={() => console.log('Done!')}
 *   onExit={() => process.exit(0)}
 *   showHelp={true}
 * />
 * ```
 */
export interface EvalScreenProps {
  /** Title for the evaluation */
  title?: string;
  /** Callback when evaluation completes */
  onComplete?: () => void;
  /** Callback when user requests exit (Escape/q) */
  onExit?: () => void;
  /** Whether to show keyboard shortcuts help */
  showHelp?: boolean;
  /** Share context (org/team) if sharing is enabled */
  shareContext?: ShareContext | null;
}

// Use centralized column widths from constants
const COL_WIDTH = EVAL_COL_WIDTH;

/**
 * Table header row (memoized - never changes).
 */
const TableHeader = memo(function TableHeader() {
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
        <Text dimColor>Results</Text>
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
});

/**
 * Props for ProviderRow component.
 */
interface ProviderRowProps {
  label: string;
  testCases: { total: number; completed: number; passed: number; failed: number; errors: number };
  tokens: { total: number };
  cost: number;
  latency: { totalMs: number; count: number };
  status: string;
  isActive: boolean;
}

/**
 * Single provider row with all metrics.
 * Memoized to prevent unnecessary re-renders when props haven't changed.
 */
const ProviderRow = memo(
  function ProviderRow({
    label,
    testCases,
    tokens,
    cost,
    latency,
    status,
    isActive,
  }: ProviderRowProps) {
    const progressPercent =
      testCases.total > 0
        ? Math.min(100, Math.round((testCases.completed / testCases.total) * 100))
        : 0;

    // Status indicator - differentiate between failures and errors
    // ✓ green = completed with all passes
    // ✗ red = has failures (assertion failures)
    // ⚠ yellow = has only errors (API/infrastructure errors), no failures
    // ● cyan = currently running
    // ○ dim = pending
    const hasFailures = testCases.failed > 0;
    const hasErrors = testCases.errors > 0;

    let statusIcon: React.ReactNode;
    if (status === 'completed' || status === 'error') {
      if (hasFailures) {
        statusIcon = <Text color="red">✗</Text>;
      } else if (hasErrors) {
        statusIcon = <Text color="yellow">⚠</Text>;
      } else {
        statusIcon = <Text color="green">✓</Text>;
      }
    } else if (isActive) {
      statusIcon = <Text color="cyan">●</Text>;
    } else {
      statusIcon = <Text dimColor>○</Text>;
    }

    return (
      <Box>
        {/* Status icon */}
        <Box width={COL_WIDTH.status}>{statusIcon}</Box>

        {/* Provider name */}
        <Box width={COL_WIDTH.provider}>
          <Text color={isActive ? 'cyan' : undefined}>
            {truncate(label, COL_WIDTH.provider - 2)}
          </Text>
        </Box>

        {/* Progress bar with count */}
        <Box width={COL_WIDTH.progress}>
          <ProgressBar
            value={progressPercent}
            max={100}
            width={6}
            showPercentage={false}
            color={status === 'completed' ? 'green' : 'cyan'}
          />
          <Text dimColor>
            {' '}
            {testCases.completed}/{testCases.total}
          </Text>
        </Box>

        {/* Pass/fail/error counts - marginLeft adds gap after progress column */}
        <Box width={COL_WIDTH.results} marginLeft={2}>
          {/* Passes - always show */}
          <Text color="green">{testCases.passed}✓</Text>
          {/* Failures - red if any, dim otherwise */}
          {hasFailures ? (
            <Text color="red"> {testCases.failed}✗</Text>
          ) : (
            testCases.completed > 0 && <Text dimColor> 0✗</Text>
          )}
          {/* Errors - yellow/orange if any, hide if zero */}
          {hasErrors && <Text color="yellow"> {testCases.errors}⚠</Text>}
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
  },
  // Custom comparison: only re-render if meaningful props changed
  (prevProps, nextProps) => {
    // Quick reference checks first
    if (prevProps.label !== nextProps.label) {
      return false;
    }
    if (prevProps.status !== nextProps.status) {
      return false;
    }
    if (prevProps.isActive !== nextProps.isActive) {
      return false;
    }
    if (prevProps.cost !== nextProps.cost) {
      return false;
    }

    // Check testCases (most frequently changing)
    const prevTC = prevProps.testCases;
    const nextTC = nextProps.testCases;
    if (
      prevTC.total !== nextTC.total ||
      prevTC.completed !== nextTC.completed ||
      prevTC.passed !== nextTC.passed ||
      prevTC.failed !== nextTC.failed ||
      prevTC.errors !== nextTC.errors
    ) {
      return false;
    }

    // Check tokens
    if (prevProps.tokens.total !== nextProps.tokens.total) {
      return false;
    }

    // Check latency
    if (
      prevProps.latency.totalMs !== nextProps.latency.totalMs ||
      prevProps.latency.count !== nextProps.latency.count
    ) {
      return false;
    }

    return true; // Props are equal, skip re-render
  },
);

/**
 * Compact summary line showing aggregate stats.
 */
function SummaryLine() {
  const {
    passedTests,
    failedTests,
    errorCount,
    totalTests,
    totalTokens,
    promptTokens,
    completionTokens,
    gradingTokens,
    totalCost,
    elapsedMs,
    logs,
    showVerbose,
  } = useEvalState();

  const tokenDisplay = totalTokens || promptTokens + completionTokens;
  const hasGradingTokens = gradingTokens.total > 0;

  // Count log warnings (warn level only, not errors since those are shown separately)
  const logWarningCount = logs.filter((log) => log.level === 'warn').length;

  return (
    <Box marginTop={1}>
      {/* Pass count with color */}
      <Text color={passedTests === totalTests ? 'green' : failedTests > 0 ? 'yellow' : 'white'}>
        {passedTests}/{totalTests} passed
      </Text>

      {failedTests > 0 && <Text color="red"> · {failedTests} failed</Text>}

      {errorCount > 0 && <Text color="yellow"> · {errorCount} errors</Text>}

      {/* Log warnings indicator - only show if not in verbose mode (verbose shows the panel) */}
      {logWarningCount > 0 && !showVerbose && (
        <Text color="yellow">
          {' '}
          · ⚠ {logWarningCount} warning{logWarningCount > 1 ? 's' : ''}
        </Text>
      )}

      {/* Tokens - show eval tokens and grading tokens if present */}
      {tokenDisplay > 0 && (
        <Text dimColor>
          {' '}
          · {formatTokens(tokenDisplay)} tokens
          {hasGradingTokens && (
            <Text color="magenta"> (+{formatTokens(gradingTokens.total)} grading)</Text>
          )}
        </Text>
      )}

      {/* Cost */}
      {totalCost > 0 && <Text dimColor> · {formatCost(totalCost)}</Text>}

      {/* Duration */}
      <Text dimColor> · {formatDuration(elapsedMs)}</Text>
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

export function EvalScreen({
  title,
  onComplete,
  onExit,
  showHelp = true,
  shareContext,
}: EvalScreenProps) {
  const { exit } = useApp();
  const { state, dispatch, isComplete, isRunning } = useEval();
  const completeCalled = useRef(false);
  const isRawModeSupported = process.stdin.isTTY && typeof process.stdin.setRawMode === 'function';

  // Stabilized timestamp for activity detection - only updates on TICK
  // This prevents spurious re-renders from other state changes (like spinner updates)
  const [activityNow, setActivityNow] = useState(() => Date.now());

  // Help overlay state
  const [showHelpOverlay, setShowHelpOverlay] = useState(false);

  // Check if we're in results phase - if so, ResultsTable handles keyboard input
  const inResultsPhase = state.sessionPhase === 'results';

  // Poll TokenUsageTracker for real-time token metrics
  useTokenMetrics(dispatch, state.providerOrder, isRunning, 500);

  // Consolidated keyboard input handler using Ink's useInput internally
  // Disabled when in results phase - ResultsTable handles keyboard input
  useKeypress(
    (key) => {
      // Handle help overlay separately - if it's open, close it on any key
      if (showHelpOverlay) {
        setShowHelpOverlay(false);
        return;
      }

      // Handle escape and 'q' for exit
      if (key.name === 'escape' || key.key.toLowerCase() === 'q') {
        onExit?.();
        exit();
        return;
      }

      // Handle '?' for help overlay
      if (key.key === '?') {
        setShowHelpOverlay(true);
        return;
      }

      // Handle 'e' for toggling error details
      if (key.key.toLowerCase() === 'e') {
        dispatch({ type: 'TOGGLE_ERROR_DETAILS' });
        return;
      }

      // Handle 'v' for toggling verbose mode
      if (key.key.toLowerCase() === 'v') {
        dispatch({ type: 'TOGGLE_VERBOSE' });
        // Update the log capture level based on current state
        // If currently NOT verbose, we're toggling TO verbose (debug level)
        // If currently verbose, we're toggling OFF verbose (warn level)
        setInkUITransportLevel(state.showVerbose ? 'warn' : 'debug');
        return;
      }
    },
    { isActive: isRawModeSupported && !inResultsPhase },
  );

  // Update elapsed time while running (also triggers activity indicator refresh)
  useEffect(() => {
    if (state.phase !== 'evaluating' && state.phase !== 'grading') {
      return;
    }

    const timer = setInterval(() => {
      dispatch({ type: 'TICK' });
      // Update activity timestamp on each TICK for stable activity detection
      setActivityNow(Date.now());
    }, TIMING.TICK_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [state.phase, dispatch]);

  // Calculate completed tests and ETA for display
  const completedTests = state.passedTests + state.failedTests + state.errorCount;
  const etaMs = calculateETA(completedTests, state.totalTests, state.elapsedMs);
  const etaDisplay = formatETA(etaMs);

  // Compute terminal title - null when not actively evaluating
  const terminalTitle = (() => {
    if (state.phase !== 'evaluating' && state.phase !== 'grading') {
      return null;
    }
    const percent =
      state.totalTests > 0 ? Math.round((completedTests / state.totalTests) * 100) : 0;
    const titleParts = [`promptfoo: ${completedTests}/${state.totalTests} (${percent}%)`];
    if (etaDisplay) {
      titleParts.push(etaDisplay);
    }
    return titleParts.join(' - ');
  })();

  // Update terminal title via Ink's stdout (handles cleanup automatically)
  useTerminalTitle(terminalTitle);

  // Call onComplete when done
  useEffect(() => {
    if (isComplete && !completeCalled.current) {
      completeCalled.current = true;
      onComplete?.();
    }
  }, [isComplete, onComplete]);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={isComplete ? 'green' : 'gray'}
      paddingX={1}
      paddingY={0}
    >
      {/* Header: Title + Status + Concurrency + ETA */}
      <Box>
        <Text bold>{title || 'Evaluation'}</Text>
        <Box flexGrow={1} />
        {isRunning && <Spinner type="dots" color="cyan" />}
        <Text color={isComplete ? 'green' : 'cyan'}>
          {' '}
          {PHASE_LABELS[state.phase] || state.phase}
        </Text>
        {state.elapsedMs > 0 && <Text dimColor> ({formatDuration(state.elapsedMs)})</Text>}
        {state.concurrency > 1 && <Text dimColor> ×{state.concurrency}</Text>}
        {isRunning && etaDisplay && <Text color="yellow"> · {etaDisplay}</Text>}
      </Box>

      {/* Share context - show org/team and sharing status */}
      {shareContext && (
        <Box flexDirection="column">
          {state.sharingStatus === 'completed' && state.shareUrl ? (
            <>
              <Box>
                <Text color="green">✔ </Text>
                <Text dimColor>Shared to </Text>
                <Text color="cyan">{shareContext.organizationName}</Text>
                {shareContext.teamName && (
                  <>
                    <Text dimColor> › </Text>
                    <Text color="cyan">{shareContext.teamName}</Text>
                  </>
                )}
              </Box>
              <Box marginLeft={2}>
                <Text color="cyan">{state.shareUrl}</Text>
              </Box>
            </>
          ) : state.sharingStatus === 'failed' ? (
            <Text color="red">✗ Share failed</Text>
          ) : (
            <Box>
              <Text dimColor>Sharing to </Text>
              <Text color="cyan">{shareContext.organizationName}</Text>
              {shareContext.teamName && (
                <>
                  <Text dimColor> › </Text>
                  <Text color="cyan">{shareContext.teamName}</Text>
                </>
              )}
              {state.sharingStatus === 'sharing' && (
                <>
                  <Text dimColor> </Text>
                  <Spinner type="dots" color="cyan" />
                </>
              )}
            </Box>
          )}
        </Box>
      )}

      {/* Provider table */}
      {state.providerOrder.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <TableHeader />
          {state.providerOrder.map((id) => {
            const provider = state.providers[id];
            if (!provider) {
              return null;
            }
            // Compute isActive based on timestamp - providers with recent activity are highlighted
            // This enables multi-provider highlighting when running with high concurrency
            // Uses activityNow (updated on TICK) to prevent spurious re-renders
            const isActive =
              provider.status === 'running' &&
              provider.lastActivityMs > 0 &&
              activityNow - provider.lastActivityMs < TIMING.ACTIVITY_THRESHOLD_MS;
            return (
              <ProviderRow
                key={id}
                label={provider.label}
                testCases={provider.testCases}
                tokens={provider.tokens}
                cost={provider.cost}
                latency={provider.latency}
                status={provider.status}
                isActive={isActive}
              />
            );
          })}
        </Box>
      )}

      {/* Summary line */}
      <SummaryLine />

      {/* Errors */}
      <ErrorDisplay />

      {/* Log Panel - shown in verbose mode */}
      {state.showVerbose && state.logs.length > 0 && (
        <LogPanel logs={state.logs} maxLines={10} verbose={state.showVerbose} />
      )}

      {/* Help bar - only during active evaluation, hidden on completion to avoid
          confusion during transition to results table which has different shortcuts */}
      {showHelp && isRawModeSupported && !isComplete && !showHelpOverlay && (
        <HelpBar
          isComplete={isComplete}
          showVerbose={state.showVerbose}
          hasErrors={state.errorCount > 0}
          showErrorDetails={state.showErrorDetails}
          logWarningCount={state.logs.filter((log) => log.level === 'warn').length}
        />
      )}

      {/* Help overlay - shown when user presses '?' */}
      {showHelpOverlay && (
        <EvalHelpOverlay
          onClose={() => setShowHelpOverlay(false)}
          hasErrors={state.errorCount > 0}
        />
      )}
    </Box>
  );
}
