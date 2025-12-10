/**
 * Main evaluation screen component.
 *
 * This is the primary UI component for displaying evaluation progress.
 * It combines the header, progress, provider status, and error summary.
 */

import { Box, Static, Text, useApp } from 'ink';
import React, { useEffect, useRef } from 'react';
import { useEval, useEvalState } from '../../contexts/EvalContext';
import { useCompactMode } from '../../contexts/UIContext';
import { useNavigationKeys } from '../../hooks/useKeypress';
import { Badge, CountBadge } from '../shared/Badge';
import { EvalHeader, EvalHeaderCompact } from './EvalHeader';
import { ErrorSummary } from './ErrorSummary';
import { ProviderStatusList, ProviderStatusSummary } from './ProviderStatusList';

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

/**
 * Results summary displayed at completion.
 */
function ResultsSummary() {
  const { passedTests, failedTests, errorCount, elapsedMs, phase } = useEvalState();

  if (phase !== 'completed') {
    return null;
  }

  const totalTests = passedTests + failedTests;
  const passRate = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;

  const formatDuration = (ms: number): string => {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    }
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  return (
    <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="green" padding={1}>
      <Text bold color="green">
        Evaluation Complete
      </Text>
      <Box marginTop={1}>
        <Text>Results: </Text>
        <Text color="green">{passedTests} passed</Text>
        {failedTests > 0 && (
          <>
            <Text>, </Text>
            <Text color="red">{failedTests} failed</Text>
          </>
        )}
        {errorCount > 0 && (
          <>
            <Text>, </Text>
            <Text color="red">{errorCount} errors</Text>
          </>
        )}
      </Box>
      <Box>
        <Text>Pass rate: </Text>
        <Text color={passRate >= 70 ? 'green' : passRate >= 40 ? 'yellow' : 'red'}>{passRate}%</Text>
      </Box>
      <Box>
        <Text dimColor>Duration: {formatDuration(elapsedMs)}</Text>
      </Box>
    </Box>
  );
}

/**
 * Current activity indicator.
 */
function CurrentActivity() {
  const { currentProvider, currentPrompt, currentVars, phase } = useEvalState();

  if (phase !== 'evaluating' && phase !== 'grading') {
    return null;
  }

  const truncate = (str: string | undefined, max: number): string => {
    if (!str) {
      return '';
    }
    return str.length > max ? str.slice(0, max - 3) + '...' : str;
  };

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text dimColor>Current:</Text>
      <Box marginLeft={2}>
        {currentProvider && <Text>Provider: {truncate(currentProvider, 30)}</Text>}
        {currentPrompt && (
          <Text dimColor> | Prompt: "{truncate(currentPrompt.replace(/\n/g, ' '), 20)}"</Text>
        )}
      </Box>
      {currentVars && (
        <Box marginLeft={2}>
          <Text dimColor>Vars: {truncate(currentVars, 50)}</Text>
        </Box>
      )}
    </Box>
  );
}

/**
 * Keyboard shortcuts help.
 */
function KeyboardHelp() {
  return (
    <Box marginTop={1}>
      <Text dimColor>Press </Text>
      <Text color="cyan">q</Text>
      <Text dimColor> to quit, </Text>
      <Text color="cyan">p</Text>
      <Text dimColor> to toggle provider details, </Text>
      <Text color="cyan">e</Text>
      <Text dimColor> to toggle error details</Text>
    </Box>
  );
}

export function EvalScreen({ title, onComplete, onExit, showHelp = true }: EvalScreenProps) {
  const { exit } = useApp();
  const { state, dispatch, isComplete } = useEval();
  const { isCompact } = useCompactMode();
  const completeCalled = useRef(false);
  const isRawModeSupported = process.stdin.isTTY && typeof process.stdin.setRawMode === 'function';

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
        case 'p':
          dispatch({ type: 'TOGGLE_PROVIDER_DETAILS' });
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

  // Compact layout for narrow terminals
  if (isCompact) {
    return (
      <Box flexDirection="column">
        <EvalHeaderCompact title={title} />
        <ProviderStatusSummary />
        {state.errorCount > 0 && (
          <Text color="red">
            {state.errorCount} error{state.errorCount > 1 ? 's' : ''}
          </Text>
        )}
        {isComplete && <ResultsSummary />}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {/* Header with progress bar */}
      <EvalHeader title={title} showTiming />

      {/* Provider status */}
      {state.providerOrder.length > 0 && (
        <Box marginTop={1}>
          <ProviderStatusList maxItems={5} showDetails />
        </Box>
      )}

      {/* Current activity */}
      <CurrentActivity />

      {/* Error summary */}
      <ErrorSummary maxErrors={3} />

      {/* Results summary (when complete) */}
      <ResultsSummary />

      {/* Keyboard help - only show if raw mode is supported */}
      {showHelp && !isComplete && isRawModeSupported && <KeyboardHelp />}
    </Box>
  );
}

export default EvalScreen;
