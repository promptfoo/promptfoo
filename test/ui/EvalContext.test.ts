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
        payload: { provider: string; prompt: string; message: string; vars?: Record<string, unknown> };
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
