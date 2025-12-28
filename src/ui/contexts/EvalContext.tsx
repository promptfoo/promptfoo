/**
 * EvalContext - State management for evaluation progress using XState.
 *
 * This context provides a central store for evaluation state that can be
 * accessed by all components in the eval UI tree. It uses XState for
 * predictable state transitions and explicit state modeling.
 */

import React, { createContext, useCallback, useContext, useMemo } from 'react';

import { useMachine } from '@xstate/react';
import {
  type EvalError,
  type EvalMachineContext,
  type EvalMachineEvent,
  evalMachine,
  type GradingTokens,
  getEvalPhase,
  getProgressPercent,
  getSessionPhase,
  isComplete as machineIsComplete,
  isRunning as machineIsRunning,
  type ProviderMetrics,
  type TokenMetricsPayload,
} from '../machines/evalMachine';

import type { EvaluateTable } from '../../types';
import type { LogEntry } from '../utils/InkUITransport';

// Re-export types for consumers
export type { LogEntry } from '../utils/InkUITransport';
export type { EvalError, GradingTokens, ProviderMetrics, TokenMetricsPayload };

// Backwards compatibility alias
export type ProviderStatus = ProviderMetrics;

// Sharing status type
export type SharingStatus = 'idle' | 'sharing' | 'completed' | 'failed';

// Session phase - which view is currently shown
export type SessionPhase = 'eval' | 'results';

// Main state interface (backwards compatible with old reducer state)
export interface EvalState {
  // Session phase - eval progress view or results table view
  sessionPhase: SessionPhase;

  // Overall eval progress
  phase: 'initializing' | 'loading' | 'evaluating' | 'grading' | 'completed' | 'error';
  totalTests: number;
  completedTests: number;
  passedTests: number;
  failedTests: number;
  errorCount: number;

  // Sharing state
  sharingStatus: SharingStatus;
  shareUrl?: string;

  // Aggregate request metrics (distinct from test cases)
  totalRequests: number;
  cachedRequests: number;

  // Aggregate token metrics
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  reasoningTokens: number;

  // Grading/assertion tokens (model-graded assertions)
  gradingTokens: GradingTokens;

  // Aggregate cost
  totalCost: number;

  // Concurrency (for display)
  concurrency: number;

  // Provider metrics
  providers: Record<string, ProviderMetrics>;
  providerOrder: string[];

  // Current activity
  currentProvider?: string;
  currentPrompt?: string;
  currentVars?: string;

  // Timing
  startTime?: number;
  endTime?: number;
  elapsedMs: number;
  estimatedRemainingMs: number;

  // Errors
  errors: EvalError[];
  maxErrorsToShow: number;

  // Configuration
  showProviderDetails: boolean;
  showErrorDetails: boolean;

  // Verbose mode / log capture
  showVerbose: boolean;
  logs: LogEntry[];
  maxLogsToShow: number;

  // Results table data (set when transitioning to results view)
  tableData: EvaluateTable | null;
}

// Action types for backwards compatibility with old reducer pattern
// These get converted to XState events internally
export type EvalAction =
  | { type: 'INIT'; payload: { totalTests: number; providers: string[]; concurrency?: number } }
  | { type: 'START' }
  | { type: 'SET_PHASE'; payload: EvalState['phase'] }
  | {
      type: 'PROGRESS';
      payload: {
        completed: number;
        total: number;
        provider?: string;
        prompt?: string;
        vars?: string;
        passed?: boolean;
        error?: string;
        // Merged from TEST_RESULT for efficiency
        latencyMs?: number;
        cost?: number;
      };
    }
  | {
      // Batched progress updates for high-concurrency performance
      // Multiple test completions are queued and flushed together
      type: 'BATCH_PROGRESS';
      payload: {
        items: Array<{
          provider: string;
          passed: boolean;
          error: boolean;
          latencyMs: number;
          cost: number;
          completed: number;
          total: number;
        }>;
      };
    }
  | {
      type: 'PROVIDER_UPDATE';
      payload: {
        providerId: string;
        completed?: number;
        total?: number;
        error?: string;
        status?: ProviderMetrics['status'];
        currentTest?: string;
      };
    }
  | {
      type: 'TEST_RESULT';
      payload: {
        providerId: string;
        passed: boolean;
        failed: boolean;
        error: boolean;
        latencyMs: number;
        cost: number;
      };
    }
  | {
      type: 'UPDATE_TOKEN_METRICS';
      payload: {
        providerId: string;
        tokenUsage: TokenMetricsPayload;
      };
    }
  | {
      type: 'ADD_ERROR';
      payload: {
        provider: string;
        prompt: string;
        message: string;
        vars?: Record<string, unknown>;
      };
    }
  | { type: 'COMPLETE'; payload?: { passed: number; failed: number; errors: number } }
  | { type: 'ERROR'; payload: { message: string } }
  | { type: 'TOGGLE_PROVIDER_DETAILS' }
  | { type: 'TOGGLE_ERROR_DETAILS' }
  | { type: 'TICK' } // Update elapsed time
  | { type: 'SET_CONCURRENCY'; payload: number }
  | {
      type: 'SET_GRADING_TOKENS';
      payload: { providerId: string; tokens: GradingTokens };
    }
  | { type: 'SET_SHARE_URL'; payload: string }
  | { type: 'SET_SHARING_STATUS'; payload: { status: SharingStatus; url?: string } }
  | { type: 'SET_SESSION_PHASE'; payload: SessionPhase }
  | { type: 'SET_TABLE_DATA'; payload: EvaluateTable }
  | { type: 'TOGGLE_VERBOSE' }
  | { type: 'ADD_LOG'; payload: LogEntry }
  | { type: 'CLEAR_LOGS' };

// ============================================================================
// State Conversion
// ============================================================================

/**
 * Convert XState machine context to backwards-compatible EvalState.
 */
function machineContextToEvalState(
  context: EvalMachineContext,
  stateValue: string | object,
  sharingStatus: SharingStatus,
): EvalState {
  return {
    sessionPhase: getSessionPhase(stateValue),
    phase: getEvalPhase(stateValue as string | { evaluating: string }),
    totalTests: context.totalTests,
    completedTests: context.completedTests,
    passedTests: context.passedTests,
    failedTests: context.failedTests,
    errorCount: context.errorCount,
    sharingStatus,
    shareUrl: context.shareUrl,
    totalRequests: context.totalRequests,
    cachedRequests: context.cachedRequests,
    totalTokens: context.totalTokens,
    promptTokens: context.promptTokens,
    completionTokens: context.completionTokens,
    cachedTokens: context.cachedTokens,
    reasoningTokens: context.reasoningTokens,
    gradingTokens: context.gradingTokens,
    totalCost: context.totalCost,
    concurrency: context.concurrency,
    providers: context.providers,
    providerOrder: context.providerOrder,
    currentProvider: context.currentProvider,
    currentPrompt: context.currentPrompt,
    currentVars: context.currentVars,
    startTime: context.startTime,
    endTime: context.endTime,
    elapsedMs: context.elapsedMs,
    estimatedRemainingMs: 0, // Calculate if needed
    errors: context.errors.toArray(),
    maxErrorsToShow: context.maxErrorsToShow,
    showProviderDetails: true, // Not in machine, default to true
    showErrorDetails: context.showErrorDetails,
    showVerbose: context.showVerbose,
    logs: context.logs.toArray(),
    maxLogsToShow: context.maxLogsToShow,
    tableData: context.tableData,
  };
}

/**
 * Convert old EvalAction to XState event.
 */
function actionToEvent(action: EvalAction): EvalMachineEvent | null {
  switch (action.type) {
    case 'INIT':
      return {
        type: 'INIT',
        providers: action.payload.providers,
        totalTests: action.payload.totalTests,
        concurrency: action.payload.concurrency,
      };

    case 'START':
      return { type: 'START' };

    case 'PROGRESS': {
      const { completed, total, provider, prompt, vars, passed, error, latencyMs, cost } =
        action.payload;
      return {
        type: 'PROGRESS',
        completed,
        total,
        provider,
        prompt,
        vars,
        passedDelta: passed === true ? 1 : 0,
        // Fix: Only count as failure if not a pass AND not an error
        // Previously errors were double-counted as both failures AND errors
        failedDelta: passed === false && !error ? 1 : 0,
        errorDelta: error ? 1 : 0,
        // Merged from TEST_RESULT for efficiency
        latencyMs,
        cost,
      };
    }

    case 'BATCH_PROGRESS': {
      // Convert batch items to XState format with delta calculations
      const items = action.payload.items.map((item) => ({
        provider: item.provider,
        passedDelta: item.passed ? 1 : 0,
        failedDelta: !item.passed && !item.error ? 1 : 0,
        errorDelta: item.error ? 1 : 0,
        latencyMs: item.latencyMs,
        cost: item.cost,
        completed: item.completed,
        total: item.total,
      }));
      return {
        type: 'BATCH_PROGRESS',
        items,
      };
    }

    case 'TEST_RESULT':
      return {
        type: 'TEST_RESULT',
        providerId: action.payload.providerId,
        passed: action.payload.passed,
        failed: action.payload.failed,
        error: action.payload.error,
        latencyMs: action.payload.latencyMs,
        cost: action.payload.cost,
      };

    case 'UPDATE_TOKEN_METRICS':
      return {
        type: 'UPDATE_TOKENS',
        providerId: action.payload.providerId,
        tokens: action.payload.tokenUsage,
      };

    case 'SET_GRADING_TOKENS':
      return {
        type: 'SET_GRADING_TOKENS',
        providerId: action.payload.providerId,
        tokens: action.payload.tokens,
      };

    case 'ADD_ERROR':
      return {
        type: 'ADD_ERROR',
        error: {
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
          provider: action.payload.provider,
          prompt: action.payload.prompt,
          message: action.payload.message,
          timestamp: Date.now(),
          vars: action.payload.vars,
        },
      };

    case 'ADD_LOG':
      return {
        type: 'ADD_LOG',
        entry: action.payload,
      };

    case 'COMPLETE':
      return {
        type: 'COMPLETE',
        passed: action.payload?.passed ?? 0,
        failed: action.payload?.failed ?? 0,
        errors: action.payload?.errors ?? 0,
      };

    case 'ERROR':
      return {
        type: 'FATAL_ERROR',
        message: action.payload.message,
      };

    case 'TOGGLE_VERBOSE':
      return { type: 'TOGGLE_VERBOSE' };

    case 'TOGGLE_ERROR_DETAILS':
      return { type: 'TOGGLE_ERROR_DETAILS' };

    case 'TICK':
      return { type: 'TICK' };

    case 'SET_SHARE_URL':
      return {
        type: 'SET_SHARE_URL',
        url: action.payload,
      };

    case 'SET_SHARING_STATUS':
      if (action.payload.status === 'sharing') {
        return { type: 'SHARING_STARTED' };
      } else if (action.payload.status === 'completed') {
        return { type: 'SHARING_COMPLETED', url: action.payload.url ?? '' };
      } else if (action.payload.status === 'failed') {
        return { type: 'SHARING_FAILED' };
      }
      return null;

    case 'SET_TABLE_DATA':
      return {
        type: 'SHOW_RESULTS',
        tableData: action.payload,
      };

    case 'SET_SESSION_PHASE':
      // Session phase is controlled by SHOW_RESULTS transition
      // If setting to 'results', we need table data to be set first
      return null;

    // These actions are not directly supported in the machine
    case 'SET_PHASE':
    case 'PROVIDER_UPDATE':
    case 'SET_CONCURRENCY':
    case 'TOGGLE_PROVIDER_DETAILS':
    case 'CLEAR_LOGS':
      return null;

    default:
      return null;
  }
}

// ============================================================================
// Context Types
// ============================================================================

interface EvalContextValue {
  state: EvalState;
  dispatch: React.Dispatch<EvalAction>;

  // Helper actions
  init: (totalTests: number, providers: string[]) => void;
  start: () => void;
  updateProgress: (
    completed: number,
    total: number,
    options?: {
      provider?: string;
      prompt?: string;
      vars?: string;
      passed?: boolean;
      error?: string;
    },
  ) => void;
  addError: (
    provider: string,
    prompt: string,
    message: string,
    vars?: Record<string, unknown>,
  ) => void;
  complete: (summary?: { passed: number; failed: number; errors: number }) => void;

  // Computed values
  progressPercent: number;
  isRunning: boolean;
  isComplete: boolean;
  hasErrors: boolean;
}

// Create context
const EvalContext = createContext<EvalContextValue | null>(null);

// ============================================================================
// Provider Component
// ============================================================================

export interface EvalProviderProps {
  children: React.ReactNode;
  initialState?: Partial<EvalState>;
}

export function EvalProvider({ children }: EvalProviderProps) {
  const [machineState, send] = useMachine(evalMachine);

  // Track sharing status separately (machine has nested states for this)
  const sharingStatus = useMemo<SharingStatus>(() => {
    const stateValue = machineState.value;
    if (typeof stateValue === 'object' && 'evaluating' in stateValue) {
      if (stateValue.evaluating === 'sharing') {
        return 'sharing';
      }
    }
    if (machineState.context.shareUrl) {
      return 'completed';
    }
    return 'idle';
  }, [machineState.value, machineState.context.shareUrl]);

  // Convert machine state to backwards-compatible EvalState
  const state = useMemo(
    () => machineContextToEvalState(machineState.context, machineState.value, sharingStatus),
    [machineState.context, machineState.value, sharingStatus],
  );

  // Create dispatch adapter that converts old actions to XState events
  const dispatch = useCallback(
    (action: EvalAction) => {
      const event = actionToEvent(action);
      if (event) {
        send(event);
      }
    },
    [send],
  );

  // Helper action creators
  const init = useCallback(
    (totalTests: number, providers: string[]) => {
      send({ type: 'INIT', totalTests, providers });
    },
    [send],
  );

  const start = useCallback(() => {
    send({ type: 'START' });
  }, [send]);

  const updateProgress = useCallback(
    (
      completed: number,
      total: number,
      options?: {
        provider?: string;
        prompt?: string;
        vars?: string;
        passed?: boolean;
        error?: string;
      },
    ) => {
      send({
        type: 'PROGRESS',
        completed,
        total,
        provider: options?.provider,
        prompt: options?.prompt,
        vars: options?.vars,
        passedDelta: options?.passed === true ? 1 : 0,
        failedDelta: options?.passed === false ? 1 : 0,
        errorDelta: options?.error ? 1 : 0,
      });
    },
    [send],
  );

  const addError = useCallback(
    (provider: string, prompt: string, message: string, vars?: Record<string, unknown>) => {
      send({
        type: 'ADD_ERROR',
        error: {
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
          provider,
          prompt,
          message,
          timestamp: Date.now(),
          vars,
        },
      });
    },
    [send],
  );

  const complete = useCallback(
    (summary?: { passed: number; failed: number; errors: number }) => {
      send({
        type: 'COMPLETE',
        passed: summary?.passed ?? state.passedTests,
        failed: summary?.failed ?? state.failedTests,
        errors: summary?.errors ?? state.errorCount,
      });
    },
    [send, state.passedTests, state.failedTests, state.errorCount],
  );

  // Computed values
  const progressPercent = useMemo(
    () => getProgressPercent(machineState.context),
    [machineState.context],
  );

  const isRunning = machineIsRunning(machineState.value);
  const isComplete = machineIsComplete(machineState.value);
  const hasErrors = state.errorCount > 0;

  const value: EvalContextValue = {
    state,
    dispatch,
    init,
    start,
    updateProgress,
    addError,
    complete,
    progressPercent,
    isRunning,
    isComplete,
    hasErrors,
  };

  return <EvalContext.Provider value={value}>{children}</EvalContext.Provider>;
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook for consuming the context.
 */
export function useEval(): EvalContextValue {
  const context = useContext(EvalContext);
  if (!context) {
    throw new Error('useEval must be used within an EvalProvider');
  }
  return context;
}

/**
 * Hook for just the state (no actions).
 */
export function useEvalState(): EvalState {
  const { state } = useEval();
  return state;
}

/**
 * Hook for just progress info.
 */
export function useEvalProgress() {
  const { state, progressPercent, isRunning, isComplete } = useEval();
  return {
    completed: state.completedTests,
    total: state.totalTests,
    percent: progressPercent,
    isRunning,
    isComplete,
    phase: state.phase,
    elapsedMs: state.elapsedMs,
  };
}
