/**
 * EvalContext - State management for evaluation progress.
 *
 * This context provides a central store for evaluation state that can be
 * accessed by all components in the eval UI tree.
 */

import React, { createContext, useCallback, useContext, useMemo, useReducer } from 'react';

// Types for provider status tracking
export interface ProviderStatus {
  id: string;
  label: string;
  completed: number;
  total: number;
  errors: number;
  status: 'pending' | 'running' | 'completed' | 'error';
  currentTest?: string;
  lastError?: string;
}

// Types for error tracking
export interface EvalError {
  id: string;
  provider: string;
  prompt: string;
  message: string;
  timestamp: number;
  vars?: Record<string, unknown>;
}

// Main state interface
export interface EvalState {
  // Overall progress
  phase: 'initializing' | 'loading' | 'evaluating' | 'grading' | 'completed' | 'error';
  totalTests: number;
  completedTests: number;
  passedTests: number;
  failedTests: number;
  errorCount: number;

  // Provider status
  providers: Record<string, ProviderStatus>;
  providerOrder: string[];

  // Current activity
  currentProvider?: string;
  currentPrompt?: string;
  currentVars?: string;

  // Timing
  startTime?: number;
  endTime?: number;
  elapsedMs: number;

  // Errors
  errors: EvalError[];
  maxErrorsToShow: number;

  // Configuration
  showProviderDetails: boolean;
  showErrorDetails: boolean;
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
        status?: ProviderStatus['status'];
        currentTest?: string;
      };
    }
  | {
      type: 'ADD_ERROR';
      payload: { provider: string; prompt: string; message: string; vars?: Record<string, unknown> };
    }
  | { type: 'COMPLETE'; payload?: { passed: number; failed: number; errors: number } }
  | { type: 'ERROR'; payload: { message: string } }
  | { type: 'TOGGLE_PROVIDER_DETAILS' }
  | { type: 'TOGGLE_ERROR_DETAILS' }
  | { type: 'TICK' }; // Update elapsed time

// Initial state
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

// Reducer function
function evalReducer(state: EvalState, action: EvalAction): EvalState {
  switch (action.type) {
    case 'INIT': {
      const providers: Record<string, ProviderStatus> = {};
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

      // Update provider status if provider specified
      let providers = state.providers;
      if (provider && providers[provider]) {
        providers = {
          ...providers,
          [provider]: {
            ...providers[provider],
            status: 'running',
            currentTest: vars,
          },
        };
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

      return {
        ...state,
        providers: {
          ...state.providers,
          [providerId]: {
            ...provider,
            ...(updates.completed !== undefined && { completed: updates.completed }),
            ...(updates.total !== undefined && { total: updates.total }),
            ...(updates.status && { status: updates.status }),
            ...(updates.currentTest && { currentTest: updates.currentTest }),
            ...(updates.error && { lastError: updates.error, errors: provider.errors + 1 }),
          },
        },
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
    options?: { provider?: string; prompt?: string; vars?: string; passed?: boolean; error?: string },
  ) => void;
  addError: (provider: string, prompt: string, message: string, vars?: Record<string, unknown>) => void;
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
