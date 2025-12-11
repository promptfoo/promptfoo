/**
 * EvalContext - State management for evaluation progress.
 *
 * This context provides a central store for evaluation state that can be
 * accessed by all components in the eval UI tree.
 */

import React, { createContext, useCallback, useContext, useMemo, useReducer } from 'react';

import type { LogEntry } from '../utils/InkUITransport';

// Re-export LogEntry for consumers
export type { LogEntry } from '../utils/InkUITransport';

// Types for provider metrics tracking
export interface ProviderMetrics {
  id: string;
  label: string;

  // Test case metrics
  testCases: {
    total: number;
    completed: number;
    passed: number;
    failed: number;
    errors: number;
  };

  // Request metrics (from TokenUsageTracker)
  requests: {
    total: number;
    cached: number;
  };

  // Token metrics (from TokenUsageTracker)
  tokens: {
    prompt: number;
    completion: number;
    cached: number;
    total: number;
    reasoning: number;
  };

  // Cost tracking
  cost: number;

  // Latency metrics
  latency: {
    totalMs: number;
    count: number;
    minMs: number;
    maxMs: number;
  };

  // Status
  status: 'pending' | 'running' | 'completed' | 'error';
  currentTest?: string;
  lastError?: string;
}

// Backwards compatibility alias
export type ProviderStatus = ProviderMetrics;

// Types for error tracking
export interface EvalError {
  id: string;
  provider: string;
  prompt: string;
  message: string;
  timestamp: number;
  vars?: Record<string, unknown>;
}

// Sharing status type
export type SharingStatus = 'idle' | 'sharing' | 'completed' | 'failed';

// Main state interface
export interface EvalState {
  // Overall progress
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
  gradingTokens: {
    total: number;
    prompt: number;
    completion: number;
    cached: number;
    reasoning: number;
  };

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
}

// Token usage type for updates
export interface TokenMetricsPayload {
  prompt: number;
  completion: number;
  cached: number;
  total: number;
  numRequests: number;
  reasoning?: number;
}

// Action types for the reducer
export type EvalAction =
  | { type: 'INIT'; payload: { totalTests: number; providers: string[] } }
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
      payload: {
        total: number;
        prompt: number;
        completion: number;
        cached: number;
        reasoning: number;
      };
    }
  | { type: 'SET_SHARE_URL'; payload: string }
  | { type: 'SET_SHARING_STATUS'; payload: { status: SharingStatus; url?: string } }
  | { type: 'TOGGLE_VERBOSE' }
  | { type: 'ADD_LOG'; payload: LogEntry }
  | { type: 'CLEAR_LOGS' };

// Helper to create empty provider metrics
function createEmptyProviderMetrics(id: string, label?: string): ProviderMetrics {
  return {
    id,
    label: label || id,
    testCases: { total: 0, completed: 0, passed: 0, failed: 0, errors: 0 },
    requests: { total: 0, cached: 0 },
    tokens: { prompt: 0, completion: 0, cached: 0, total: 0, reasoning: 0 },
    cost: 0,
    latency: { totalMs: 0, count: 0, minMs: Infinity, maxMs: 0 },
    status: 'pending',
  };
}

// Initial state
const initialState: EvalState = {
  phase: 'initializing',
  totalTests: 0,
  completedTests: 0,
  passedTests: 0,
  failedTests: 0,
  errorCount: 0,
  // Sharing state
  sharingStatus: 'idle',
  // Aggregate request metrics
  totalRequests: 0,
  cachedRequests: 0,
  // Aggregate token metrics
  totalTokens: 0,
  promptTokens: 0,
  completionTokens: 0,
  cachedTokens: 0,
  reasoningTokens: 0,
  // Grading tokens
  gradingTokens: {
    total: 0,
    prompt: 0,
    completion: 0,
    cached: 0,
    reasoning: 0,
  },
  // Aggregate cost
  totalCost: 0,
  // Concurrency
  concurrency: 4,
  providers: {},
  providerOrder: [],
  elapsedMs: 0,
  estimatedRemainingMs: 0,
  errors: [],
  maxErrorsToShow: 5,
  showProviderDetails: true,
  showErrorDetails: false,
  // Verbose mode / log capture
  showVerbose: false,
  logs: [],
  maxLogsToShow: 100,
};

// Reducer function
function evalReducer(state: EvalState, action: EvalAction): EvalState {
  switch (action.type) {
    case 'INIT': {
      const providers: Record<string, ProviderMetrics> = {};
      const numProviders = action.payload.providers.length;
      // totalTests from eval.ts is the number of test CASES (testSuite.tests.length)
      // Each provider runs ALL test cases, so per-provider total = totalTests
      // (NOT divided by numProviders - that would be if we split tests across providers)
      const testsPerProvider = action.payload.totalTests;

      for (const id of action.payload.providers) {
        const metrics = createEmptyProviderMetrics(id);
        metrics.testCases.total = testsPerProvider;
        providers[id] = metrics;
      }

      // Total results = test cases * providers
      const totalResults = action.payload.totalTests * numProviders;

      return {
        ...initialState,
        totalTests: totalResults,
        providers,
        providerOrder: action.payload.providers,
        phase: 'loading',
      };
    }

    case 'START':
      return {
        ...state,
        phase: 'evaluating',
        startTime: Date.now(),
      };

    case 'SET_PHASE':
      return {
        ...state,
        phase: action.payload,
      };

    case 'PROGRESS': {
      const { completed, total, provider, prompt, vars, passed, error } = action.payload;

      let passedTests = state.passedTests;
      let failedTests = state.failedTests;
      let errorCount = state.errorCount;

      if (passed === true) {
        passedTests++;
      } else if (passed === false) {
        failedTests++;
      }
      if (error) {
        errorCount++;
      }

      // Update provider status if provider specified
      let providers = state.providers;

      // Fix per-provider totals if they don't match the actual total from evaluator
      // The evaluator passes total = tests × varCombinations × prompts × providers
      // Per-provider total = total / numProviders
      const numProviders = state.providerOrder.length;
      if (numProviders > 0 && total > 0) {
        const correctPerProviderTotal = Math.floor(total / numProviders);
        // Check if any provider has a different total and needs updating
        const firstProvider = state.providers[state.providerOrder[0]];
        if (firstProvider && firstProvider.testCases.total !== correctPerProviderTotal) {
          // Update all providers with the correct total AND fix completion status
          const updatedProviders = { ...providers };
          for (const id of state.providerOrder) {
            if (updatedProviders[id]) {
              const prov = updatedProviders[id];
              const isComplete =
                prov.testCases.completed >= correctPerProviderTotal && correctPerProviderTotal > 0;
              const hasErrors = prov.testCases.errors > 0;
              updatedProviders[id] = {
                ...prov,
                testCases: {
                  ...prov.testCases,
                  total: correctPerProviderTotal,
                },
                // Fix status if provider is actually complete now that we have correct total
                status: isComplete ? (hasErrors ? 'error' : 'completed') : prov.status,
              };
            }
          }
          providers = updatedProviders;
        }
      }

      // Also check if any provider just became complete (even without total correction)
      // This handles the case where total was already correct but status wasn't updated
      for (const id of state.providerOrder) {
        if (providers[id] && providers[id].status === 'running') {
          const prov = providers[id];
          const isComplete =
            prov.testCases.completed >= prov.testCases.total && prov.testCases.total > 0;
          if (isComplete) {
            const hasErrors = prov.testCases.errors > 0;
            providers = {
              ...providers,
              [id]: {
                ...prov,
                status: hasErrors ? 'error' : 'completed',
              },
            };
          }
        }
      }

      if (provider && providers[provider]) {
        // Only set to 'running' if not already completed
        if (providers[provider].status !== 'completed' && providers[provider].status !== 'error') {
          providers = {
            ...providers,
            [provider]: {
              ...providers[provider],
              status: 'running',
              currentTest: vars,
            },
          };
        }
      }

      return {
        ...state,
        completedTests: completed,
        totalTests: total,
        passedTests,
        failedTests,
        errorCount,
        currentProvider: provider,
        currentPrompt: prompt,
        currentVars: vars,
        providers,
      };
    }

    case 'PROVIDER_UPDATE': {
      const { providerId, ...updates } = action.payload;
      const provider = state.providers[providerId];
      if (!provider) {
        return state;
      }

      const updatedProvider = { ...provider };
      if (updates.completed !== undefined) {
        updatedProvider.testCases = { ...provider.testCases, completed: updates.completed };
      }
      if (updates.total !== undefined) {
        updatedProvider.testCases = { ...provider.testCases, total: updates.total };
      }
      if (updates.status) {
        updatedProvider.status = updates.status;
      }
      if (updates.currentTest) {
        updatedProvider.currentTest = updates.currentTest;
      }
      if (updates.error) {
        updatedProvider.lastError = updates.error;
        updatedProvider.testCases = {
          ...updatedProvider.testCases,
          errors: provider.testCases.errors + 1,
        };
      }

      return {
        ...state,
        providers: {
          ...state.providers,
          [providerId]: updatedProvider,
        },
      };
    }

    case 'TEST_RESULT': {
      const { providerId, passed, failed, error, latencyMs, cost } = action.payload;
      let provider = state.providers[providerId];

      // Create provider if it doesn't exist (can happen with dynamic providers)
      if (!provider) {
        provider = createEmptyProviderMetrics(providerId);
      }

      // Update provider metrics
      const updatedTestCases = {
        ...provider.testCases,
        completed: provider.testCases.completed + 1,
        passed: provider.testCases.passed + (passed ? 1 : 0),
        failed: provider.testCases.failed + (failed ? 1 : 0),
        errors: provider.testCases.errors + (error ? 1 : 0),
      };

      const updatedLatency = {
        totalMs: provider.latency.totalMs + latencyMs,
        count: provider.latency.count + 1,
        minMs: Math.min(provider.latency.minMs, latencyMs),
        maxMs: Math.max(provider.latency.maxMs, latencyMs),
      };

      // Determine provider status - mark as completed when all tests are done
      const isProviderComplete =
        updatedTestCases.completed >= updatedTestCases.total && updatedTestCases.total > 0;
      const hasErrors = updatedTestCases.errors > 0;

      const updatedProvider: ProviderMetrics = {
        ...provider,
        testCases: updatedTestCases,
        cost: provider.cost + cost,
        latency: updatedLatency,
        status: isProviderComplete ? (hasErrors ? 'error' : 'completed') : 'running',
      };

      // Update provider metrics only - aggregate counts are handled by PROGRESS action
      return {
        ...state,
        totalCost: state.totalCost + cost,
        providers: {
          ...state.providers,
          [providerId]: updatedProvider,
        },
      };
    }

    case 'UPDATE_TOKEN_METRICS': {
      const { providerId, tokenUsage } = action.payload;
      const provider = state.providers[providerId];

      if (!provider) {
        return state;
      }

      // Update provider token metrics
      const updatedProvider: ProviderMetrics = {
        ...provider,
        tokens: {
          prompt: tokenUsage.prompt,
          completion: tokenUsage.completion,
          cached: tokenUsage.cached,
          total: tokenUsage.total,
          reasoning: tokenUsage.reasoning ?? 0,
        },
        requests: {
          total: tokenUsage.numRequests,
          cached: provider.requests.cached, // Cached requests tracked separately if available
        },
      };

      // Recalculate aggregate token metrics from all providers
      let totalTokens = 0;
      let promptTokens = 0;
      let completionTokens = 0;
      let cachedTokens = 0;
      let reasoningTokens = 0;
      let totalRequests = 0;

      const updatedProviders = { ...state.providers, [providerId]: updatedProvider };
      for (const p of Object.values(updatedProviders)) {
        totalTokens += p.tokens.total;
        promptTokens += p.tokens.prompt;
        completionTokens += p.tokens.completion;
        cachedTokens += p.tokens.cached;
        reasoningTokens += p.tokens.reasoning;
        totalRequests += p.requests.total;
      }

      return {
        ...state,
        providers: updatedProviders,
        totalTokens,
        promptTokens,
        completionTokens,
        cachedTokens,
        reasoningTokens,
        totalRequests,
      };
    }

    case 'ADD_ERROR': {
      const error: EvalError = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        provider: action.payload.provider,
        prompt: action.payload.prompt,
        message: action.payload.message,
        timestamp: Date.now(),
        vars: action.payload.vars,
      };

      return {
        ...state,
        errors: [...state.errors.slice(-state.maxErrorsToShow + 1), error],
        errorCount: state.errorCount + 1,
      };
    }

    case 'COMPLETE': {
      return {
        ...state,
        phase: 'completed',
        endTime: Date.now(),
        passedTests: action.payload?.passed ?? state.passedTests,
        failedTests: action.payload?.failed ?? state.failedTests,
        errorCount: action.payload?.errors ?? state.errorCount,
      };
    }

    case 'ERROR':
      return {
        ...state,
        phase: 'error',
        endTime: Date.now(),
      };

    case 'TOGGLE_PROVIDER_DETAILS':
      return {
        ...state,
        showProviderDetails: !state.showProviderDetails,
      };

    case 'TOGGLE_ERROR_DETAILS':
      return {
        ...state,
        showErrorDetails: !state.showErrorDetails,
      };

    case 'TICK': {
      if (!state.startTime) {
        return state;
      }
      return {
        ...state,
        elapsedMs: Date.now() - state.startTime,
      };
    }

    case 'SET_CONCURRENCY':
      return {
        ...state,
        concurrency: action.payload,
      };

    case 'SET_GRADING_TOKENS':
      return {
        ...state,
        gradingTokens: action.payload,
      };

    case 'SET_SHARE_URL':
      return {
        ...state,
        shareUrl: action.payload,
      };

    case 'SET_SHARING_STATUS':
      return {
        ...state,
        sharingStatus: action.payload.status,
        shareUrl: action.payload.url ?? state.shareUrl,
      };

    case 'TOGGLE_VERBOSE':
      return {
        ...state,
        showVerbose: !state.showVerbose,
      };

    case 'ADD_LOG': {
      // Ring buffer - keep only the last maxLogsToShow entries
      const newLogs = [...state.logs, action.payload];
      if (newLogs.length > state.maxLogsToShow) {
        newLogs.shift();
      }
      return {
        ...state,
        logs: newLogs,
      };
    }

    case 'CLEAR_LOGS':
      return {
        ...state,
        logs: [],
      };

    default:
      return state;
  }
}

// Context types
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

// Provider component
export interface EvalProviderProps {
  children: React.ReactNode;
  initialState?: Partial<EvalState>;
}

export function EvalProvider({ children, initialState: customInitialState }: EvalProviderProps) {
  const [state, dispatch] = useReducer(
    evalReducer,
    customInitialState ? { ...initialState, ...customInitialState } : initialState,
  );

  // Helper action creators
  const init = useCallback((totalTests: number, providers: string[]) => {
    dispatch({ type: 'INIT', payload: { totalTests, providers } });
  }, []);

  const start = useCallback(() => {
    dispatch({ type: 'START' });
  }, []);

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
      dispatch({
        type: 'PROGRESS',
        payload: { completed, total, ...options },
      });
    },
    [],
  );

  const addError = useCallback(
    (provider: string, prompt: string, message: string, vars?: Record<string, unknown>) => {
      dispatch({ type: 'ADD_ERROR', payload: { provider, prompt, message, vars } });
    },
    [],
  );

  const complete = useCallback((summary?: { passed: number; failed: number; errors: number }) => {
    dispatch({ type: 'COMPLETE', payload: summary });
  }, []);

  // Computed values
  const progressPercent = useMemo(() => {
    if (state.totalTests === 0) {
      return 0;
    }
    return Math.round((state.completedTests / state.totalTests) * 100);
  }, [state.completedTests, state.totalTests]);

  const isRunning = state.phase === 'evaluating' || state.phase === 'grading';
  const isComplete = state.phase === 'completed';
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

// Hook for consuming the context
export function useEval(): EvalContextValue {
  const context = useContext(EvalContext);
  if (!context) {
    throw new Error('useEval must be used within an EvalProvider');
  }
  return context;
}

// Hook for just the state (no actions)
export function useEvalState(): EvalState {
  const { state } = useEval();
  return state;
}

// Hook for just progress info
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
