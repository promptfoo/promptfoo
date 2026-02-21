/**
 * XState machine for evaluation state management.
 *
 * This replaces the complex reducer in EvalContext with a proper state machine
 * that has explicit states, transitions, and guards.
 *
 * @see https://stately.ai/docs
 */

import { assign, setup } from 'xstate';
import { LIMITS } from '../constants';
import { RingBuffer } from '../utils/RingBuffer';

import type { EvaluateTable } from '../../types';
import type { LogEntry } from '../utils/InkUITransport';

// ============================================================================
// Types
// ============================================================================

export interface ProviderMetrics {
  id: string;
  label: string;
  testCases: {
    total: number;
    completed: number;
    passed: number;
    failed: number;
    errors: number;
  };
  requests: {
    total: number;
    cached: number;
  };
  tokens: {
    prompt: number;
    completion: number;
    cached: number;
    total: number;
    reasoning: number;
  };
  gradingTokens: {
    prompt: number;
    completion: number;
    cached: number;
    total: number;
    reasoning: number;
  };
  cost: number;
  latency: {
    totalMs: number;
    count: number;
    minMs: number;
    maxMs: number;
  };
  /** Timestamp (ms) of last activity for this provider - used for multi-provider activity highlighting */
  lastActivityMs: number;
  status: 'pending' | 'running' | 'completed' | 'error';
  currentTest?: string;
  lastError?: string;
}

export interface EvalError {
  id: string;
  provider: string;
  prompt: string;
  message: string;
  timestamp: number;
  vars?: Record<string, unknown>;
}

export interface TokenMetricsPayload {
  prompt: number;
  completion: number;
  cached: number;
  total: number;
  numRequests: number;
  reasoning?: number;
}

export interface GradingTokens {
  total: number;
  prompt: number;
  completion: number;
  cached: number;
  reasoning: number;
}

// ============================================================================
// Context (Extended State)
// ============================================================================

export interface EvalMachineContext {
  // Test metrics
  totalTests: number;
  completedTests: number;
  passedTests: number;
  failedTests: number;
  errorCount: number;

  // Token metrics
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  reasoningTokens: number;

  // Grading tokens
  gradingTokens: GradingTokens;

  // Request metrics
  totalRequests: number;
  cachedRequests: number;

  // Cost
  totalCost: number;

  // Concurrency
  concurrency: number;

  // Providers
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

  // Errors (ring buffer for O(1) operations)
  errors: RingBuffer<EvalError>;
  maxErrorsToShow: number;

  // Logs (ring buffer for O(1) operations)
  logs: RingBuffer<LogEntry>;
  maxLogsToShow: number;

  // UI state
  showVerbose: boolean;
  showErrorDetails: boolean;

  // Sharing
  shareUrl?: string;
  sharingStatus: 'idle' | 'sharing' | 'completed' | 'failed';

  // Results
  tableData: EvaluateTable | null;

  // Fatal error
  fatalError?: string;
}

// ============================================================================
// Events
// ============================================================================

export type EvalMachineEvent =
  | { type: 'INIT'; providers: string[]; totalTests: number; concurrency?: number }
  | { type: 'START' }
  | {
      type: 'PROGRESS';
      completed: number;
      total: number;
      provider?: string;
      prompt?: string;
      vars?: string;
      passedDelta?: number;
      failedDelta?: number;
      errorDelta?: number;
      // Merged from TEST_RESULT for efficiency (reduces dispatches per test)
      latencyMs?: number;
      cost?: number;
    }
  // TEST_RESULT kept for backwards compatibility but PROGRESS should be preferred
  | {
      type: 'TEST_RESULT';
      providerId: string;
      passed: boolean;
      failed: boolean;
      error: boolean;
      latencyMs?: number;
      cost?: number;
    }
  // Batched progress updates for high-concurrency performance
  | {
      type: 'BATCH_PROGRESS';
      items: Array<{
        provider: string;
        passedDelta: number;
        failedDelta: number;
        errorDelta: number;
        latencyMs: number;
        cost: number;
        completed: number;
        total: number;
      }>;
    }
  | {
      type: 'UPDATE_TOKENS';
      providerId: string;
      tokens: TokenMetricsPayload;
    }
  | {
      type: 'SET_GRADING_TOKENS';
      providerId: string;
      tokens: GradingTokens;
    }
  | {
      type: 'ADD_ERROR';
      error: EvalError;
    }
  | {
      type: 'ADD_LOG';
      entry: LogEntry;
    }
  | { type: 'COMPLETE'; passed: number; failed: number; errors: number }
  | { type: 'FATAL_ERROR'; message: string }
  | { type: 'SHOW_RESULTS'; tableData: EvaluateTable }
  | { type: 'TOGGLE_VERBOSE' }
  | { type: 'TOGGLE_ERROR_DETAILS' }
  | { type: 'SET_SHARE_URL'; url: string }
  | { type: 'SHARING_STARTED' }
  | { type: 'SHARING_COMPLETED'; url: string }
  | { type: 'SHARING_FAILED' }
  | { type: 'TICK' }; // For elapsed time updates

// ============================================================================
// Helper Functions
// ============================================================================

function createEmptyProviderMetrics(id: string): ProviderMetrics {
  return {
    id,
    label: id,
    testCases: { total: 0, completed: 0, passed: 0, failed: 0, errors: 0 },
    requests: { total: 0, cached: 0 },
    tokens: { prompt: 0, completion: 0, cached: 0, total: 0, reasoning: 0 },
    gradingTokens: { prompt: 0, completion: 0, cached: 0, total: 0, reasoning: 0 },
    cost: 0,
    latency: { totalMs: 0, count: 0, minMs: Infinity, maxMs: 0 },
    lastActivityMs: 0,
    status: 'pending',
  };
}

function generateErrorId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Apply a single progress item to a providers record.
 * Shared between updateProgress and processBatchProgress to avoid duplication.
 */
function applyProviderProgress(
  providers: Record<string, ProviderMetrics>,
  providerId: string,
  delta: {
    passedDelta: number;
    failedDelta: number;
    errorDelta: number;
    latencyMs: number;
    cost: number;
  },
  now: number,
): Record<string, ProviderMetrics> {
  const current = providers[providerId];
  if (!current) {
    return providers;
  }

  const currentLatency = current.latency;
  const newLatency =
    delta.latencyMs > 0
      ? {
          totalMs: currentLatency.totalMs + delta.latencyMs,
          count: currentLatency.count + 1,
          minMs: Math.min(currentLatency.minMs, delta.latencyMs),
          maxMs: Math.max(currentLatency.maxMs, delta.latencyMs),
        }
      : currentLatency;

  const updated: ProviderMetrics = {
    ...current,
    status: 'running' as const,
    lastActivityMs: now,
    cost: current.cost + delta.cost,
    latency: newLatency,
    testCases: {
      ...current.testCases,
      completed: current.testCases.completed + 1,
      passed: current.testCases.passed + (delta.passedDelta > 0 ? 1 : 0),
      failed: current.testCases.failed + (delta.failedDelta > 0 ? 1 : 0),
      errors: current.testCases.errors + (delta.errorDelta > 0 ? 1 : 0),
    },
  };

  // Mark provider complete if all test cases are done
  if (updated.testCases.completed >= updated.testCases.total) {
    updated.status = 'completed';
  }

  return { ...providers, [providerId]: updated };
}

// ============================================================================
// Initial Context
// ============================================================================

const initialContext: EvalMachineContext = {
  totalTests: 0,
  completedTests: 0,
  passedTests: 0,
  failedTests: 0,
  errorCount: 0,
  totalTokens: 0,
  promptTokens: 0,
  completionTokens: 0,
  cachedTokens: 0,
  reasoningTokens: 0,
  gradingTokens: { total: 0, prompt: 0, completion: 0, cached: 0, reasoning: 0 },
  totalRequests: 0,
  cachedRequests: 0,
  totalCost: 0,
  concurrency: 4,
  providers: {},
  providerOrder: [],
  elapsedMs: 0,
  errors: new RingBuffer<EvalError>(LIMITS.MAX_ERRORS_SHOWN),
  maxErrorsToShow: LIMITS.MAX_ERRORS_SHOWN,
  logs: new RingBuffer<LogEntry>(LIMITS.MAX_LOG_ENTRIES),
  maxLogsToShow: LIMITS.MAX_LOG_ENTRIES,
  showVerbose: false,
  showErrorDetails: false,
  sharingStatus: 'idle',
  tableData: null,
  fatalError: undefined,
};

// ============================================================================
// Machine Definition
// ============================================================================

export const evalMachine = setup({
  types: {
    context: {} as EvalMachineContext,
    events: {} as EvalMachineEvent,
  },
  actions: {
    // Initialize providers and test counts
    initializeEval: assign(({ context, event }) => {
      if (event.type !== 'INIT') {
        return context;
      }

      const providers: Record<string, ProviderMetrics> = {};
      // event.totalTests is already per-provider (tests × prompts), not total across all providers
      for (const id of event.providers) {
        const metrics = createEmptyProviderMetrics(id);
        metrics.testCases.total = event.totalTests;
        providers[id] = metrics;
      }

      return {
        ...context,
        totalTests: event.totalTests,
        completedTests: 0,
        passedTests: 0,
        failedTests: 0,
        errorCount: 0,
        providers,
        providerOrder: event.providers,
        concurrency: event.concurrency ?? context.concurrency,
        // Reset sharing state from any previous run
        sharingStatus: 'idle' as const,
        shareUrl: undefined,
        // Reset errors and logs with fresh buffers
        errors: new RingBuffer<EvalError>(context.maxErrorsToShow),
        logs: new RingBuffer<LogEntry>(context.maxLogsToShow),
      };
    }),

    // Record start time
    recordStartTime: assign({
      startTime: () => Date.now(),
    }),

    // Update progress (merged with TEST_RESULT for efficiency - single dispatch per test)
    updateProgress: assign(({ context, event }) => {
      if (event.type !== 'PROGRESS') {
        return context;
      }

      const {
        completed,
        total,
        provider,
        prompt,
        vars,
        passedDelta = 0,
        failedDelta = 0,
        errorDelta = 0,
        latencyMs = 0,
        cost = 0,
      } = event;

      const providers =
        provider && context.providers[provider]
          ? applyProviderProgress(
              context.providers,
              provider,
              { passedDelta, failedDelta, errorDelta, latencyMs, cost },
              Date.now(),
            )
          : context.providers;

      // Update per-provider totals if the real total is larger than INIT estimate
      // (evaluator expands var combinations and repeats which aren't known at INIT time)
      let updatedProviders = providers;
      if (total > context.totalTests && context.providerOrder.length > 0) {
        const perProviderTotal = Math.round(total / context.providerOrder.length);
        updatedProviders = { ...updatedProviders };
        for (const id of context.providerOrder) {
          if (updatedProviders[id] && updatedProviders[id].testCases.total < perProviderTotal) {
            updatedProviders[id] = {
              ...updatedProviders[id],
              testCases: { ...updatedProviders[id].testCases, total: perProviderTotal },
            };
          }
        }
      }

      return {
        ...context,
        completedTests: completed,
        totalTests: Math.max(context.totalTests, total),
        passedTests: context.passedTests + passedDelta,
        failedTests: context.failedTests + failedDelta,
        errorCount: context.errorCount + errorDelta,
        totalCost: context.totalCost + cost,
        currentProvider: provider ?? context.currentProvider,
        currentPrompt: prompt ?? context.currentPrompt,
        currentVars: vars ?? context.currentVars,
        providers: updatedProviders,
      };
    }),

    // Process batched progress updates efficiently
    // All items in the batch are processed in a single state update
    processBatchProgress: assign(({ context, event }) => {
      if (event.type !== 'BATCH_PROGRESS') {
        return context;
      }

      const { items } = event;
      if (items.length === 0) {
        return context;
      }

      // Accumulate changes across all items
      let providers = context.providers;
      let totalCost = context.totalCost;
      let passedTests = context.passedTests;
      let failedTests = context.failedTests;
      let errorCount = context.errorCount;
      let completedTests = context.completedTests;
      let totalTests = context.totalTests;
      const now = Date.now();

      for (const item of items) {
        passedTests += item.passedDelta;
        failedTests += item.failedDelta;
        errorCount += item.errorDelta;
        completedTests = Math.max(completedTests, item.completed);
        totalTests = Math.max(totalTests, item.total);
        totalCost += item.cost;

        if (item.provider && providers[item.provider]) {
          providers = applyProviderProgress(providers, item.provider, item, now);
        }
      }

      // Update per-provider totals if the real total is larger than INIT estimate
      if (totalTests > context.totalTests && context.providerOrder.length > 0) {
        const perProviderTotal = Math.round(totalTests / context.providerOrder.length);
        for (const id of context.providerOrder) {
          if (providers[id] && providers[id].testCases.total < perProviderTotal) {
            providers = {
              ...providers,
              [id]: {
                ...providers[id],
                testCases: { ...providers[id].testCases, total: perProviderTotal },
              },
            };
          }
        }
      }

      return {
        ...context,
        completedTests,
        totalTests,
        passedTests,
        failedTests,
        errorCount,
        totalCost,
        providers,
      };
    }),

    // Update test result metrics (cost and latency only - pass/fail/error counts are handled by updateProgress)
    updateTestResult: assign(({ context, event }) => {
      if (event.type !== 'TEST_RESULT') {
        return context;
      }

      const { providerId, latencyMs, cost } = event;
      const provider = context.providers[providerId];

      if (!provider) {
        return context;
      }

      // Update latency
      let latency = provider.latency;
      if (latencyMs !== undefined) {
        latency = {
          totalMs: latency.totalMs + latencyMs,
          count: latency.count + 1,
          minMs: Math.min(latency.minMs, latencyMs),
          maxMs: Math.max(latency.maxMs, latencyMs),
        };
      }

      return {
        ...context,
        totalCost: context.totalCost + (cost ?? 0),
        providers: {
          ...context.providers,
          [providerId]: {
            ...provider,
            cost: provider.cost + (cost ?? 0),
            latency,
          },
        },
      };
    }),

    // Update token metrics for a provider
    updateTokens: assign(({ context, event }) => {
      if (event.type !== 'UPDATE_TOKENS') {
        return context;
      }

      const { providerId, tokens } = event;
      const provider = context.providers[providerId];

      if (!provider) {
        return context;
      }

      return {
        ...context,
        totalTokens: context.totalTokens + tokens.total - provider.tokens.total,
        promptTokens: context.promptTokens + tokens.prompt - provider.tokens.prompt,
        completionTokens: context.completionTokens + tokens.completion - provider.tokens.completion,
        cachedTokens: context.cachedTokens + tokens.cached - provider.tokens.cached,
        reasoningTokens:
          context.reasoningTokens + (tokens.reasoning ?? 0) - provider.tokens.reasoning,
        totalRequests: context.totalRequests + tokens.numRequests - provider.requests.total,
        providers: {
          ...context.providers,
          [providerId]: {
            ...provider,
            tokens: {
              prompt: tokens.prompt,
              completion: tokens.completion,
              cached: tokens.cached,
              total: tokens.total,
              reasoning: tokens.reasoning ?? 0,
            },
            requests: {
              total: tokens.numRequests,
              cached:
                tokens.cached > provider.tokens.cached
                  ? provider.requests.cached + 1
                  : provider.requests.cached,
            },
          },
        },
      };
    }),

    // Update grading tokens with delta calculation (similar to updateTokens)
    setGradingTokens: assign(({ context, event }) => {
      if (event.type !== 'SET_GRADING_TOKENS') {
        return context;
      }

      const { providerId, tokens } = event;
      const provider = context.providers[providerId];

      if (!provider) {
        return context;
      }

      // Delta calculation: new_total = current_total + (new_provider_value - old_provider_value)
      const prevGrading = provider.gradingTokens;

      return {
        ...context,
        gradingTokens: {
          total: context.gradingTokens.total + tokens.total - prevGrading.total,
          prompt: context.gradingTokens.prompt + tokens.prompt - prevGrading.prompt,
          completion: context.gradingTokens.completion + tokens.completion - prevGrading.completion,
          cached: context.gradingTokens.cached + tokens.cached - prevGrading.cached,
          reasoning: context.gradingTokens.reasoning + tokens.reasoning - prevGrading.reasoning,
        },
        providers: {
          ...context.providers,
          [providerId]: {
            ...provider,
            gradingTokens: {
              prompt: tokens.prompt,
              completion: tokens.completion,
              cached: tokens.cached,
              total: tokens.total,
              reasoning: tokens.reasoning,
            },
          },
        },
      };
    }),

    addError: assign(({ context, event }) => {
      if (event.type !== 'ADD_ERROR') {
        return {};
      }
      const errors = context.errors.clone();
      errors.push({
        ...event.error,
        id: event.error.id || generateErrorId(),
      });
      return { errors };
    }),

    addLog: assign(({ context, event }) => {
      if (event.type !== 'ADD_LOG') {
        return {};
      }
      const logs = context.logs.clone();
      logs.push(event.entry);
      return { logs };
    }),

    recordCompletion: assign(({ context, event }) => {
      if (event.type !== 'COMPLETE') {
        return {};
      }

      // Mark all providers as complete
      const providers = { ...context.providers };
      for (const id of context.providerOrder) {
        if (providers[id]) {
          providers[id] = {
            ...providers[id],
            status: 'completed' as const,
          };
        }
      }

      return {
        passedTests: event.passed,
        failedTests: event.failed,
        errorCount: event.errors,
        endTime: Date.now(),
        providers,
      };
    }),

    setTableData: assign(({ event }) => {
      if (event.type !== 'SHOW_RESULTS') {
        return {};
      }
      return { tableData: event.tableData };
    }),

    toggleVerbose: assign(({ context }) => ({
      showVerbose: !context.showVerbose,
    })),

    toggleErrorDetails: assign(({ context }) => ({
      showErrorDetails: !context.showErrorDetails,
    })),

    updateElapsed: assign(({ context }) => ({
      elapsedMs: context.startTime ? Date.now() - context.startTime : 0,
    })),

    setShareUrl: assign(({ event }) => {
      if (event.type === 'SET_SHARE_URL' || event.type === 'SHARING_COMPLETED') {
        return { shareUrl: event.url };
      }
      return {};
    }),

    storeFatalError: assign(({ event }) => {
      if (event.type !== 'FATAL_ERROR') {
        return {};
      }
      return { fatalError: event.message };
    }),
  },
  guards: {
    hasProviders: ({ context }) => context.providerOrder.length > 0,
    allTestsComplete: ({ context }) => context.completedTests >= context.totalTests,
  },
}).createMachine({
  id: 'evalMachine',
  initial: 'idle',
  context: initialContext,
  states: {
    idle: {
      on: {
        INIT: {
          target: 'initialized',
          actions: 'initializeEval',
        },
      },
    },

    initialized: {
      on: {
        START: {
          target: 'evaluating',
          actions: 'recordStartTime',
        },
        INIT: {
          actions: 'initializeEval',
        },
      },
    },

    evaluating: {
      on: {
        PROGRESS: {
          actions: 'updateProgress',
        },
        BATCH_PROGRESS: {
          actions: 'processBatchProgress',
        },
        TEST_RESULT: {
          actions: 'updateTestResult',
        },
        UPDATE_TOKENS: {
          actions: 'updateTokens',
        },
        SET_GRADING_TOKENS: {
          actions: 'setGradingTokens',
        },
        ADD_ERROR: {
          actions: 'addError',
        },
        ADD_LOG: {
          actions: 'addLog',
        },
        TOGGLE_VERBOSE: {
          actions: 'toggleVerbose',
        },
        TOGGLE_ERROR_DETAILS: {
          actions: 'toggleErrorDetails',
        },
        TICK: {
          actions: 'updateElapsed',
        },
        SHARING_STARTED: {
          target: 'evaluating.sharing',
          actions: assign({ sharingStatus: 'sharing' as const }),
        },
        COMPLETE: {
          target: 'completed',
          actions: 'recordCompletion',
        },
        FATAL_ERROR: {
          target: 'error',
          actions: 'storeFatalError',
        },
      },
      initial: 'running',
      states: {
        running: {},
        sharing: {
          on: {
            SHARING_COMPLETED: {
              target: 'running',
              actions: [assign({ sharingStatus: 'completed' as const }), 'setShareUrl'],
            },
            SHARING_FAILED: {
              target: 'running',
              actions: assign({ sharingStatus: 'failed' as const }),
            },
          },
        },
      },
    },

    completed: {
      on: {
        SHOW_RESULTS: {
          target: 'results',
          actions: 'setTableData',
        },
        TOGGLE_VERBOSE: {
          actions: 'toggleVerbose',
        },
        TOGGLE_ERROR_DETAILS: {
          actions: 'toggleErrorDetails',
        },
        ADD_LOG: {
          actions: 'addLog',
        },
        SHARING_STARTED: {
          actions: assign({ sharingStatus: 'sharing' as const }),
        },
        SHARING_COMPLETED: {
          actions: [assign({ sharingStatus: 'completed' as const }), 'setShareUrl'],
        },
        SHARING_FAILED: {
          actions: assign({ sharingStatus: 'failed' as const }),
        },
      },
    },

    results: {
      type: 'final',
    },

    error: {
      on: {
        TOGGLE_VERBOSE: {
          actions: 'toggleVerbose',
        },
        TOGGLE_ERROR_DETAILS: {
          actions: 'toggleErrorDetails',
        },
      },
    },
  },
});

// ============================================================================
// Derived State Helpers
// ============================================================================

/**
 * Get the current eval phase from machine state.
 */
export function getEvalPhase(
  stateValue: string | { evaluating: string },
): 'initializing' | 'loading' | 'evaluating' | 'grading' | 'completed' | 'error' {
  if (typeof stateValue === 'string') {
    switch (stateValue) {
      case 'idle':
      case 'initialized':
        return 'initializing';
      case 'evaluating':
        return 'evaluating';
      case 'completed':
      case 'results':
        return 'completed';
      case 'error':
        return 'error';
      default:
        return 'initializing';
    }
  }
  // Nested state (evaluating.running or evaluating.sharing)
  return 'evaluating';
}

/**
 * Get session phase from machine state.
 */
export function getSessionPhase(stateValue: string | object): 'eval' | 'results' {
  if (typeof stateValue === 'string' && stateValue === 'results') {
    return 'results';
  }
  return 'eval';
}

/**
 * Calculate progress percentage.
 */
export function getProgressPercent(context: EvalMachineContext): number {
  if (context.totalTests === 0) {
    return 0;
  }
  return Math.min(100, Math.round((context.completedTests / context.totalTests) * 100));
}

/**
 * Check if evaluation is running.
 */
export function isRunning(stateValue: string | object): boolean {
  if (typeof stateValue === 'string') {
    return stateValue === 'evaluating';
  }
  return 'evaluating' in stateValue;
}

/**
 * Check if evaluation is complete.
 */
export function isComplete(stateValue: string | object): boolean {
  if (typeof stateValue === 'string') {
    return stateValue === 'completed' || stateValue === 'results';
  }
  return false;
}

export type EvalMachine = typeof evalMachine;
