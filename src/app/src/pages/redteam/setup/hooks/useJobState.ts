import { useCallback, useReducer, useRef } from 'react';
import type {
  Job,
  JobError,
  JobMetrics,
  JobCompletionSummary,
  VulnerabilityFoundEvent,
  VulnerabilitySeverityCounts,
} from '@promptfoo/types';

/**
 * Consolidated job state - replaces 15+ individual useState calls
 */
export interface JobState {
  // Core job tracking
  jobId: string | null;
  status: 'idle' | 'in-progress' | 'complete' | 'error';
  evalId: string | null;

  // Progress tracking
  progress: number;
  total: number;
  startedAt: number | null;

  // Phase information
  phase: Job['phase'];
  phaseDetail: string | undefined;

  // Metrics and results
  metrics: JobMetrics | undefined;
  errors: JobError[] | undefined;
  summary: JobCompletionSummary | undefined;

  // Logs
  logs: string[];
  logsExpanded: boolean;

  // Live vulnerability stream
  vulnerabilities: VulnerabilityFoundEvent[];
  severityCounts: VulnerabilitySeverityCounts;

  // Timestamp for conflict resolution between WebSocket and polling
  lastUpdateTimestamp: number;
}

type JobAction =
  | { type: 'START_JOB'; jobId: string }
  | { type: 'RESET' }
  | {
      type: 'UPDATE';
      payload: Partial<Omit<JobState, 'lastUpdateTimestamp'>>;
      timestamp: number;
      source: 'websocket' | 'polling';
    }
  | { type: 'COMPLETE'; payload: JobCompletePayload; timestamp: number }
  | { type: 'ERROR'; message: string; timestamp: number }
  | { type: 'TOGGLE_LOGS' }
  | { type: 'APPEND_LOGS'; logs: string[]; timestamp: number; source: 'websocket' | 'polling' }
  | { type: 'ADD_VULNERABILITY'; vulnerability: VulnerabilityFoundEvent };

interface JobCompletePayload {
  evalId?: string | null;
  phase?: Job['phase'];
  phaseDetail?: string;
  metrics?: JobMetrics;
  errors?: JobError[];
  summary?: JobCompletionSummary;
}

/**
 * Time window (ms) during which WebSocket updates take priority over polling.
 * If a WebSocket update occurred within this window, polling updates are ignored.
 */
const WEBSOCKET_PRIORITY_WINDOW_MS = 2000;

function createInitialSeverityCounts(): VulnerabilitySeverityCounts {
  return {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
}

const initialState: JobState = {
  jobId: null,
  status: 'idle',
  evalId: null,
  progress: 0,
  total: 0,
  startedAt: null,
  phase: undefined,
  phaseDetail: undefined,
  metrics: undefined,
  errors: undefined,
  summary: undefined,
  logs: [],
  logsExpanded: false,
  vulnerabilities: [],
  severityCounts: createInitialSeverityCounts(),
  lastUpdateTimestamp: 0,
};

function createInitialMetrics(): JobMetrics {
  return {
    testPassCount: 0,
    testFailCount: 0,
    testErrorCount: 0,
    tokenUsage: {
      total: 0,
      prompt: 0,
      completion: 0,
      numRequests: 0,
    },
    totalLatencyMs: 0,
  };
}

function jobReducer(state: JobState, action: JobAction): JobState {
  switch (action.type) {
    case 'START_JOB':
      return {
        ...initialState,
        jobId: action.jobId,
        status: 'in-progress',
        startedAt: Date.now(),
        phase: 'initializing',
        phaseDetail: 'Starting red team evaluation...',
        metrics: createInitialMetrics(),
        errors: [],
        vulnerabilities: [],
        severityCounts: createInitialSeverityCounts(),
        lastUpdateTimestamp: Date.now(),
      };

    case 'RESET':
      return initialState;

    case 'UPDATE': {
      // Timestamp-based conflict resolution:
      // - WebSocket always wins if timestamps are close (within priority window)
      // - Otherwise, newer timestamp wins
      const timeDiff = action.timestamp - state.lastUpdateTimestamp;
      const isWebSocket = action.source === 'websocket';

      // If this is polling and we got a WebSocket update within priority window, ignore polling
      if (
        !isWebSocket &&
        timeDiff < WEBSOCKET_PRIORITY_WINDOW_MS &&
        state.lastUpdateTimestamp > 0
      ) {
        return state;
      }

      // Only update if this is newer or WebSocket
      if (action.timestamp < state.lastUpdateTimestamp && !isWebSocket) {
        return state;
      }

      return {
        ...state,
        ...action.payload,
        lastUpdateTimestamp: action.timestamp,
      };
    }

    case 'APPEND_LOGS': {
      // For logs, merge intelligently
      const timeDiff = action.timestamp - state.lastUpdateTimestamp;
      const isWebSocket = action.source === 'websocket';

      // If polling and recent WebSocket update, skip
      if (
        !isWebSocket &&
        timeDiff < WEBSOCKET_PRIORITY_WINDOW_MS &&
        state.lastUpdateTimestamp > 0
      ) {
        return state;
      }

      // Merge logs - keep whichever is longer, or merge if WebSocket sends partial
      let newLogs: string[];
      if (action.logs.length > state.logs.length) {
        newLogs = action.logs;
      } else if (isWebSocket && action.logs.length > 0) {
        // WebSocket might send last N logs - check if they're newer
        const lastLocalLog = state.logs[state.logs.length - 1];
        const lastRemoteLog = action.logs[action.logs.length - 1];
        if (lastLocalLog !== lastRemoteLog) {
          // Logs diverged, trust WebSocket for recent entries
          newLogs = action.logs;
        } else {
          newLogs = state.logs;
        }
      } else {
        newLogs = state.logs;
      }

      return {
        ...state,
        logs: newLogs,
        lastUpdateTimestamp: isWebSocket ? action.timestamp : state.lastUpdateTimestamp,
      };
    }

    case 'COMPLETE':
      // Prevent duplicate completion (e.g., from both WebSocket and polling)
      if (state.status === 'complete') {
        return state;
      }
      return {
        ...state,
        status: 'complete',
        phase: 'complete',
        phaseDetail: 'Evaluation complete',
        evalId: action.payload.evalId ?? state.evalId,
        metrics: action.payload.metrics ?? state.metrics,
        errors: action.payload.errors ?? state.errors,
        summary: action.payload.summary ?? state.summary,
        lastUpdateTimestamp: action.timestamp,
      };

    case 'ERROR':
      return {
        ...state,
        status: 'error',
        phase: 'error',
        phaseDetail: action.message || 'Evaluation failed',
        lastUpdateTimestamp: action.timestamp,
      };

    case 'TOGGLE_LOGS':
      return {
        ...state,
        logsExpanded: !state.logsExpanded,
      };

    case 'ADD_VULNERABILITY': {
      // Avoid duplicate vulnerabilities by checking ID
      if (state.vulnerabilities.some((v) => v.id === action.vulnerability.id)) {
        return state;
      }

      // Update severity counts
      const newSeverityCounts = { ...state.severityCounts };
      newSeverityCounts[action.vulnerability.severity] += 1;

      return {
        ...state,
        vulnerabilities: [...state.vulnerabilities, action.vulnerability],
        severityCounts: newSeverityCounts,
      };
    }

    default:
      return state;
  }
}

/**
 * Hook for managing job execution state with conflict resolution
 */
export function useJobState() {
  const [state, dispatch] = useReducer(jobReducer, initialState);

  // Use ref for poll interval to avoid stale closures
  const pollIntervalRef = useRef<number | null>(null);

  const startJob = useCallback((jobId: string) => {
    dispatch({ type: 'START_JOB', jobId });
  }, []);

  const reset = useCallback(() => {
    if (pollIntervalRef.current) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    dispatch({ type: 'RESET' });
  }, []);

  const updateFromWebSocket = useCallback(
    (payload: {
      status?: Job['status'];
      progress?: number;
      total?: number;
      phase?: Job['phase'];
      phaseDetail?: string;
      startedAt?: number;
      metrics?: JobMetrics;
      errors?: JobError[];
      logs?: string[];
    }) => {
      const timestamp = Date.now();

      // Handle logs separately for proper merging
      if (payload.logs) {
        dispatch({
          type: 'APPEND_LOGS',
          logs: payload.logs,
          timestamp,
          source: 'websocket',
        });
      }

      // Update other fields
      const { logs: _logs, ...rest } = payload;
      if (Object.keys(rest).length > 0) {
        dispatch({
          type: 'UPDATE',
          payload: rest,
          timestamp,
          source: 'websocket',
        });
      }
    },
    [],
  );

  const updateFromPolling = useCallback(
    (payload: {
      status?: Job['status'];
      progress?: number;
      total?: number;
      phase?: Job['phase'];
      phaseDetail?: string;
      startedAt?: number;
      metrics?: JobMetrics;
      errors?: JobError[];
      logs?: string[];
    }) => {
      const timestamp = Date.now();

      // Handle logs separately
      if (payload.logs) {
        dispatch({
          type: 'APPEND_LOGS',
          logs: payload.logs,
          timestamp,
          source: 'polling',
        });
      }

      // Update other fields
      const { logs: _logs, ...rest } = payload;
      if (Object.keys(rest).length > 0) {
        dispatch({
          type: 'UPDATE',
          payload: rest,
          timestamp,
          source: 'polling',
        });
      }
    },
    [],
  );

  const completeJob = useCallback((payload: JobCompletePayload) => {
    if (pollIntervalRef.current) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    dispatch({ type: 'COMPLETE', payload, timestamp: Date.now() });
  }, []);

  const errorJob = useCallback((message: string) => {
    if (pollIntervalRef.current) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    dispatch({ type: 'ERROR', message, timestamp: Date.now() });
  }, []);

  const toggleLogs = useCallback(() => {
    dispatch({ type: 'TOGGLE_LOGS' });
  }, []);

  const addVulnerability = useCallback((vulnerability: VulnerabilityFoundEvent) => {
    dispatch({ type: 'ADD_VULNERABILITY', vulnerability });
  }, []);

  const setPollInterval = useCallback((interval: number | null) => {
    if (pollIntervalRef.current) {
      window.clearInterval(pollIntervalRef.current);
    }
    pollIntervalRef.current = interval;
  }, []);

  const clearPollInterval = useCallback(() => {
    if (pollIntervalRef.current) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  return {
    state,
    actions: {
      startJob,
      reset,
      updateFromWebSocket,
      updateFromPolling,
      completeJob,
      errorJob,
      toggleLogs,
      addVulnerability,
      setPollInterval,
      clearPollInterval,
    },
    pollIntervalRef,
  };
}
