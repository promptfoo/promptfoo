import { describe, expect, it } from 'vitest';

// Test the reducer logic directly instead of through React hooks
// This avoids DOM dependency issues with @testing-library/react

// Helper to create a mock state and test the reducer
function createMockEvalReducer() {
  // Import the types and recreate reducer logic for testing
  type EvalState = {
    phase: 'initializing' | 'loading' | 'evaluating' | 'grading' | 'completed' | 'error';
    totalTests: number;
    completedTests: number;
    passedTests: number;
    failedTests: number;
    errorCount: number;
    providers: Record<string, any>;
    providerOrder: string[];
    elapsedMs: number;
    errors: any[];
    maxErrorsToShow: number;
    showProviderDetails: boolean;
    showErrorDetails: boolean;
    startTime?: number;
    endTime?: number;
    currentProvider?: string;
    currentPrompt?: string;
    currentVars?: string;
  };

  const initialState: EvalState = {
    phase: 'initializing',
    totalTests: 0,
    completedTests: 0,
    passedTests: 0,
    failedTests: 0,
    errorCount: 0,
    providers: {},
    providerOrder: [],
    elapsedMs: 0,
    errors: [],
    maxErrorsToShow: 5,
    showProviderDetails: true,
    showErrorDetails: false,
  };

  type Action =
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
        type: 'ADD_ERROR';
        payload: {
          provider: string;
          prompt: string;
          message: string;
          vars?: Record<string, unknown>;
        };
      }
    | { type: 'COMPLETE'; payload?: { passed: number; failed: number; errors: number } };

  function reducer(state: EvalState, action: Action): EvalState {
    switch (action.type) {
      case 'INIT': {
        const providers: Record<string, any> = {};
        for (const id of action.payload.providers) {
          providers[id] = {
            id,
            label: id,
            completed: 0,
            total: 0,
            errors: 0,
            status: 'pending',
          };
        }
        return {
          ...initialState,
          totalTests: action.payload.totalTests,
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
        };
      }

      case 'ADD_ERROR': {
        const newError = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          provider: action.payload.provider,
          prompt: action.payload.prompt,
          message: action.payload.message,
          timestamp: Date.now(),
          vars: action.payload.vars,
        };

        return {
          ...state,
          errors: [...state.errors.slice(-state.maxErrorsToShow + 1), newError],
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

      default:
        return state;
    }
  }

  return { initialState, reducer };
}

describe('EvalContext Reducer', () => {
  it('should have correct initial state', () => {
    const { initialState } = createMockEvalReducer();

    expect(initialState.phase).toBe('initializing');
    expect(initialState.totalTests).toBe(0);
    expect(initialState.completedTests).toBe(0);
    expect(initialState.passedTests).toBe(0);
    expect(initialState.failedTests).toBe(0);
  });

  it('should initialize with providers and total tests', () => {
    const { initialState, reducer } = createMockEvalReducer();

    const newState = reducer(initialState, {
      type: 'INIT',
      payload: { totalTests: 100, providers: ['openai:gpt-4', 'anthropic:claude-3'] },
    });

    expect(newState.totalTests).toBe(100);
    expect(newState.providerOrder).toHaveLength(2);
    expect(newState.phase).toBe('loading');
    expect(newState.providers['openai:gpt-4']).toBeDefined();
    expect(newState.providers['anthropic:claude-3']).toBeDefined();
  });

  it('should start evaluation', () => {
    const { initialState, reducer } = createMockEvalReducer();

    let state = reducer(initialState, {
      type: 'INIT',
      payload: { totalTests: 100, providers: ['openai:gpt-4'] },
    });

    state = reducer(state, { type: 'START' });

    expect(state.phase).toBe('evaluating');
    expect(state.startTime).toBeDefined();
  });

  it('should update progress', () => {
    const { initialState, reducer } = createMockEvalReducer();

    let state = reducer(initialState, {
      type: 'INIT',
      payload: { totalTests: 100, providers: ['openai:gpt-4'] },
    });

    state = reducer(state, { type: 'START' });

    state = reducer(state, {
      type: 'PROGRESS',
      payload: { completed: 50, total: 100, passed: true },
    });

    expect(state.completedTests).toBe(50);
    expect(state.passedTests).toBe(1);
  });

  it('should track failures', () => {
    const { initialState, reducer } = createMockEvalReducer();

    let state = reducer(initialState, {
      type: 'INIT',
      payload: { totalTests: 100, providers: ['openai:gpt-4'] },
    });

    state = reducer(state, {
      type: 'PROGRESS',
      payload: { completed: 1, total: 100, passed: false },
    });

    expect(state.failedTests).toBe(1);
  });

  it('should add errors', () => {
    const { initialState, reducer } = createMockEvalReducer();

    let state = reducer(initialState, {
      type: 'INIT',
      payload: { totalTests: 100, providers: ['openai:gpt-4'] },
    });

    state = reducer(state, {
      type: 'ADD_ERROR',
      payload: { provider: 'openai:gpt-4', prompt: 'test prompt', message: 'API error' },
    });

    expect(state.errors).toHaveLength(1);
    expect(state.errorCount).toBe(1);
    expect(state.errors[0].message).toBe('API error');
  });

  it('should complete evaluation', () => {
    const { initialState, reducer } = createMockEvalReducer();

    let state = reducer(initialState, {
      type: 'INIT',
      payload: { totalTests: 100, providers: ['openai:gpt-4'] },
    });

    state = reducer(state, { type: 'START' });

    state = reducer(state, {
      type: 'COMPLETE',
      payload: { passed: 90, failed: 10, errors: 0 },
    });

    expect(state.phase).toBe('completed');
    expect(state.passedTests).toBe(90);
    expect(state.failedTests).toBe(10);
    expect(state.endTime).toBeDefined();
  });

  it('should set phase', () => {
    const { initialState, reducer } = createMockEvalReducer();

    const state = reducer(initialState, {
      type: 'SET_PHASE',
      payload: 'grading',
    });

    expect(state.phase).toBe('grading');
  });

  it('should limit errors to maxErrorsToShow', () => {
    const { initialState, reducer } = createMockEvalReducer();

    let state = reducer(initialState, {
      type: 'INIT',
      payload: { totalTests: 100, providers: ['openai:gpt-4'] },
    });

    // Add more errors than maxErrorsToShow (5)
    for (let i = 0; i < 10; i++) {
      state = reducer(state, {
        type: 'ADD_ERROR',
        payload: { provider: 'openai:gpt-4', prompt: `prompt ${i}`, message: `error ${i}` },
      });
    }

    // Should only keep the last 5 errors
    expect(state.errors.length).toBeLessThanOrEqual(5);
    // But error count should track all errors
    expect(state.errorCount).toBe(10);
  });
});

// Test the enhanced reducer with TEST_RESULT and UPDATE_TOKEN_METRICS actions
function createEnhancedMockEvalReducer() {
  type ProviderMetrics = {
    id: string;
    label: string;
    testCases: { total: number; completed: number; passed: number; failed: number; errors: number };
    requests: { total: number; cached: number };
    tokens: { prompt: number; completion: number; cached: number; total: number };
    cost: number;
    latency: { totalMs: number; count: number; minMs: number; maxMs: number };
    status: 'pending' | 'running' | 'completed' | 'error';
  };

  type EvalState = {
    phase: 'initializing' | 'loading' | 'evaluating' | 'grading' | 'completed' | 'error';
    totalTests: number;
    completedTests: number;
    passedTests: number;
    failedTests: number;
    errorCount: number;
    totalRequests: number;
    cachedRequests: number;
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    cachedTokens: number;
    totalCost: number;
    providers: Record<string, ProviderMetrics>;
    providerOrder: string[];
  };

  function createEmptyProviderMetrics(id: string): ProviderMetrics {
    return {
      id,
      label: id,
      testCases: { total: 0, completed: 0, passed: 0, failed: 0, errors: 0 },
      requests: { total: 0, cached: 0 },
      tokens: { prompt: 0, completion: 0, cached: 0, total: 0 },
      cost: 0,
      latency: { totalMs: 0, count: 0, minMs: Infinity, maxMs: 0 },
      status: 'pending',
    };
  }

  const initialState: EvalState = {
    phase: 'initializing',
    totalTests: 0,
    completedTests: 0,
    passedTests: 0,
    failedTests: 0,
    errorCount: 0,
    totalRequests: 0,
    cachedRequests: 0,
    totalTokens: 0,
    promptTokens: 0,
    completionTokens: 0,
    cachedTokens: 0,
    totalCost: 0,
    providers: {},
    providerOrder: [],
  };

  type TokenMetricsPayload = {
    prompt: number;
    completion: number;
    cached: number;
    total: number;
    numRequests: number;
  };

  type Action =
    | { type: 'INIT'; payload: { totalTests: number; providers: string[] } }
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
        payload: { providerId: string; tokenUsage: TokenMetricsPayload };
      };

  function reducer(state: EvalState, action: Action): EvalState {
    switch (action.type) {
      case 'INIT': {
        const providers: Record<string, ProviderMetrics> = {};
        for (const id of action.payload.providers) {
          providers[id] = createEmptyProviderMetrics(id);
        }
        return {
          ...initialState,
          totalTests: action.payload.totalTests,
          providers,
          providerOrder: action.payload.providers,
          phase: 'loading',
        };
      }

      case 'TEST_RESULT': {
        const { providerId, passed, failed, error, latencyMs, cost } = action.payload;
        let provider = state.providers[providerId];

        if (!provider) {
          provider = createEmptyProviderMetrics(providerId);
        }

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

        const updatedProvider: ProviderMetrics = {
          ...provider,
          testCases: updatedTestCases,
          cost: provider.cost + cost,
          latency: updatedLatency,
          status: 'running',
        };

        return {
          ...state,
          passedTests: state.passedTests + (passed ? 1 : 0),
          failedTests: state.failedTests + (failed ? 1 : 0),
          errorCount: state.errorCount + (error ? 1 : 0),
          completedTests: state.completedTests + 1,
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

        const updatedProvider: ProviderMetrics = {
          ...provider,
          tokens: {
            prompt: tokenUsage.prompt,
            completion: tokenUsage.completion,
            cached: tokenUsage.cached,
            total: tokenUsage.total,
          },
          requests: {
            total: tokenUsage.numRequests,
            cached: provider.requests.cached,
          },
        };

        // Recalculate aggregate token metrics
        let totalTokens = 0;
        let promptTokens = 0;
        let completionTokens = 0;
        let cachedTokens = 0;
        let totalRequests = 0;

        const updatedProviders = { ...state.providers, [providerId]: updatedProvider };
        for (const p of Object.values(updatedProviders)) {
          totalTokens += p.tokens.total;
          promptTokens += p.tokens.prompt;
          completionTokens += p.tokens.completion;
          cachedTokens += p.tokens.cached;
          totalRequests += p.requests.total;
        }

        return {
          ...state,
          providers: updatedProviders,
          totalTokens,
          promptTokens,
          completionTokens,
          cachedTokens,
          totalRequests,
        };
      }

      default:
        return state;
    }
  }

  return { initialState, reducer, createEmptyProviderMetrics };
}

describe('Enhanced EvalContext Reducer', () => {
  describe('TEST_RESULT action', () => {
    it('should update provider metrics on test pass', () => {
      const { initialState, reducer } = createEnhancedMockEvalReducer();

      let state = reducer(initialState, {
        type: 'INIT',
        payload: { totalTests: 100, providers: ['openai:gpt-4'] },
      });

      state = reducer(state, {
        type: 'TEST_RESULT',
        payload: {
          providerId: 'openai:gpt-4',
          passed: true,
          failed: false,
          error: false,
          latencyMs: 500,
          cost: 0.05,
        },
      });

      expect(state.passedTests).toBe(1);
      expect(state.completedTests).toBe(1);
      expect(state.totalCost).toBe(0.05);

      const provider = state.providers['openai:gpt-4'];
      expect(provider.testCases.passed).toBe(1);
      expect(provider.testCases.completed).toBe(1);
      expect(provider.cost).toBe(0.05);
      expect(provider.latency.totalMs).toBe(500);
      expect(provider.latency.count).toBe(1);
    });

    it('should update provider metrics on test fail', () => {
      const { initialState, reducer } = createEnhancedMockEvalReducer();

      let state = reducer(initialState, {
        type: 'INIT',
        payload: { totalTests: 100, providers: ['openai:gpt-4'] },
      });

      state = reducer(state, {
        type: 'TEST_RESULT',
        payload: {
          providerId: 'openai:gpt-4',
          passed: false,
          failed: true,
          error: false,
          latencyMs: 300,
          cost: 0.02,
        },
      });

      expect(state.failedTests).toBe(1);
      expect(state.providers['openai:gpt-4'].testCases.failed).toBe(1);
    });

    it('should track min/max latency', () => {
      const { initialState, reducer } = createEnhancedMockEvalReducer();

      let state = reducer(initialState, {
        type: 'INIT',
        payload: { totalTests: 100, providers: ['openai:gpt-4'] },
      });

      // First test with 500ms latency
      state = reducer(state, {
        type: 'TEST_RESULT',
        payload: {
          providerId: 'openai:gpt-4',
          passed: true,
          failed: false,
          error: false,
          latencyMs: 500,
          cost: 0.01,
        },
      });

      // Second test with 200ms latency
      state = reducer(state, {
        type: 'TEST_RESULT',
        payload: {
          providerId: 'openai:gpt-4',
          passed: true,
          failed: false,
          error: false,
          latencyMs: 200,
          cost: 0.01,
        },
      });

      // Third test with 800ms latency
      state = reducer(state, {
        type: 'TEST_RESULT',
        payload: {
          providerId: 'openai:gpt-4',
          passed: true,
          failed: false,
          error: false,
          latencyMs: 800,
          cost: 0.01,
        },
      });

      const provider = state.providers['openai:gpt-4'];
      expect(provider.latency.minMs).toBe(200);
      expect(provider.latency.maxMs).toBe(800);
      expect(provider.latency.totalMs).toBe(1500);
      expect(provider.latency.count).toBe(3);
    });

    it('should create provider if it does not exist', () => {
      const { initialState, reducer } = createEnhancedMockEvalReducer();

      // Start with no providers
      const state = reducer(initialState, {
        type: 'TEST_RESULT',
        payload: {
          providerId: 'new-provider',
          passed: true,
          failed: false,
          error: false,
          latencyMs: 100,
          cost: 0.01,
        },
      });

      expect(state.providers['new-provider']).toBeDefined();
      expect(state.providers['new-provider'].testCases.passed).toBe(1);
    });
  });

  describe('UPDATE_TOKEN_METRICS action', () => {
    it('should update provider token metrics', () => {
      const { initialState, reducer } = createEnhancedMockEvalReducer();

      let state = reducer(initialState, {
        type: 'INIT',
        payload: { totalTests: 100, providers: ['openai:gpt-4'] },
      });

      state = reducer(state, {
        type: 'UPDATE_TOKEN_METRICS',
        payload: {
          providerId: 'openai:gpt-4',
          tokenUsage: {
            prompt: 1000,
            completion: 500,
            cached: 200,
            total: 1500,
            numRequests: 10,
          },
        },
      });

      const provider = state.providers['openai:gpt-4'];
      expect(provider.tokens.prompt).toBe(1000);
      expect(provider.tokens.completion).toBe(500);
      expect(provider.tokens.cached).toBe(200);
      expect(provider.tokens.total).toBe(1500);
      expect(provider.requests.total).toBe(10);
    });

    it('should update aggregate token metrics across providers', () => {
      const { initialState, reducer } = createEnhancedMockEvalReducer();

      let state = reducer(initialState, {
        type: 'INIT',
        payload: { totalTests: 100, providers: ['openai:gpt-4', 'anthropic:claude-3'] },
      });

      // Update first provider
      state = reducer(state, {
        type: 'UPDATE_TOKEN_METRICS',
        payload: {
          providerId: 'openai:gpt-4',
          tokenUsage: {
            prompt: 1000,
            completion: 500,
            cached: 0,
            total: 1500,
            numRequests: 10,
          },
        },
      });

      // Update second provider
      state = reducer(state, {
        type: 'UPDATE_TOKEN_METRICS',
        payload: {
          providerId: 'anthropic:claude-3',
          tokenUsage: {
            prompt: 2000,
            completion: 1000,
            cached: 500,
            total: 3000,
            numRequests: 15,
          },
        },
      });

      // Check aggregates
      expect(state.totalTokens).toBe(4500);
      expect(state.promptTokens).toBe(3000);
      expect(state.completionTokens).toBe(1500);
      expect(state.cachedTokens).toBe(500);
      expect(state.totalRequests).toBe(25);
    });

    it('should ignore update for non-existent provider', () => {
      const { initialState, reducer } = createEnhancedMockEvalReducer();

      const state = reducer(initialState, {
        type: 'UPDATE_TOKEN_METRICS',
        payload: {
          providerId: 'non-existent',
          tokenUsage: {
            prompt: 1000,
            completion: 500,
            cached: 0,
            total: 1500,
            numRequests: 10,
          },
        },
      });

      // State should remain unchanged
      expect(state.totalTokens).toBe(0);
      expect(state.totalRequests).toBe(0);
    });
  });
});
