/**
 * Hook for streaming generation results via Server-Sent Events (SSE).
 * Provides real-time updates for test cases and assertions as they're generated.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import useApiConfig from '@app/stores/apiConfig';
import type { Assertion } from '@promptfoo/types';

import type { GenerationResult } from '../api/generation';

// SSE Event types matching backend jobManager.ts
export interface StreamProgressEvent {
  type: 'progress';
  jobId: string;
  current: number;
  total: number;
  phase: string;
}

export interface StreamTestCaseEvent {
  type: 'testcase';
  jobId: string;
  testCase: Record<string, string>;
  index: number;
}

export interface StreamAssertionEvent {
  type: 'assertion';
  jobId: string;
  assertion: Assertion;
  index: number;
}

export interface StreamCompleteEvent {
  type: 'complete';
  jobId: string;
  result: GenerationResult;
}

export interface StreamErrorEvent {
  type: 'error';
  jobId: string;
  error: string;
}

export type StreamEvent =
  | StreamProgressEvent
  | StreamTestCaseEvent
  | StreamAssertionEvent
  | StreamCompleteEvent
  | StreamErrorEvent;

export interface UseGenerationStreamOptions {
  /** Called when progress updates */
  onProgress?: (current: number, total: number, phase: string) => void;
  /** Called when a new test case is streamed */
  onTestCase?: (testCase: Record<string, string>, index: number) => void;
  /** Called when a new assertion is streamed */
  onAssertion?: (assertion: Assertion, index: number) => void;
  /** Called when job completes successfully */
  onComplete?: (result: GenerationResult) => void;
  /** Called when job fails */
  onError?: (error: string) => void;
  /** Auto-reconnect on connection loss (default: true) */
  autoReconnect?: boolean;
  /** Maximum reconnection attempts (default: 3) */
  maxReconnectAttempts?: number;
}

export interface UseGenerationStreamReturn {
  /** Connect to stream for a specific job */
  connect: (jobId: string) => void;
  /** Disconnect from stream */
  disconnect: () => void;
  /** Whether currently connected */
  isConnected: boolean;
  /** Current job ID */
  jobId: string | null;
  /** Streamed test cases so far */
  testCases: Array<Record<string, string>>;
  /** Streamed assertions so far */
  assertions: Assertion[];
  /** Connection error (if any) */
  connectionError: string | null;
}

/**
 * Hook for streaming generation results via SSE.
 * Use this alongside useGenerationJob for real-time item updates.
 */
export function useGenerationStream(
  options: UseGenerationStreamOptions = {},
): UseGenerationStreamReturn {
  const {
    onProgress,
    onTestCase,
    onAssertion,
    onComplete,
    onError,
    autoReconnect = true,
    maxReconnectAttempts = 3,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [testCases, setTestCases] = useState<Array<Record<string, string>>>([]);
  const [assertions, setAssertions] = useState<Assertion[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isMountedRef = useRef(true);

  // Get the API base URL using the same config as callApi
  const getStreamUrl = useCallback((id: string) => {
    // Use the configured API base URL from the store, same as callApi
    // This respects VITE_PUBLIC_BASENAME and custom apiBaseUrl settings
    const { apiBaseUrl } = useApiConfig.getState();
    let baseUrl: string;
    if (apiBaseUrl) {
      baseUrl = apiBaseUrl.replace(/\/$/, '');
    } else {
      // Fall back to base path from build-time config
      baseUrl = import.meta.env.VITE_PUBLIC_BASENAME || '';
    }
    return `${baseUrl}/api/generation/stream/${id}`;
  }, []);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const handleEvent = useCallback(
    (event: MessageEvent) => {
      if (!isMountedRef.current) {
        return;
      }

      try {
        const data = JSON.parse(event.data) as StreamEvent;

        switch (data.type) {
          case 'progress':
            onProgress?.(data.current, data.total, data.phase);
            break;

          case 'testcase':
            setTestCases((prev) => {
              // Avoid duplicates by index
              const exists = prev.some((_, i) => i === data.index);
              if (exists) {
                return prev;
              }
              const newCases = [...prev];
              newCases[data.index] = data.testCase;
              return newCases;
            });
            onTestCase?.(data.testCase, data.index);
            break;

          case 'assertion':
            setAssertions((prev) => {
              // Avoid duplicates by index
              const exists = prev.some((_, i) => i === data.index);
              if (exists) {
                return prev;
              }
              const newAssertions = [...prev];
              newAssertions[data.index] = data.assertion;
              return newAssertions;
            });
            onAssertion?.(data.assertion, data.index);
            break;

          case 'complete':
            disconnect();
            onComplete?.(data.result);
            break;

          case 'error':
            disconnect();
            setConnectionError(data.error);
            onError?.(data.error);
            break;
        }
      } catch (err) {
        console.error('Failed to parse SSE event:', err);
      }
    },
    [onProgress, onTestCase, onAssertion, onComplete, onError, disconnect],
  );

  const connect = useCallback(
    (id: string) => {
      // Disconnect existing connection
      disconnect();

      // Reset state
      setJobId(id);
      setTestCases([]);
      setAssertions([]);
      setConnectionError(null);
      reconnectAttemptsRef.current = 0;

      const url = getStreamUrl(id);
      const eventSource = new EventSource(url);

      eventSource.onopen = () => {
        if (!isMountedRef.current) {
          return;
        }
        setIsConnected(true);
        setConnectionError(null);
        reconnectAttemptsRef.current = 0;
      };

      eventSource.onmessage = handleEvent;

      eventSource.onerror = () => {
        if (!isMountedRef.current) {
          return;
        }

        // Track reconnect attempts on any error, not just CLOSED state
        // EventSource often fires errors while still in CONNECTING state
        setIsConnected(false);
        reconnectAttemptsRef.current++;

        if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          setConnectionError('Failed to connect to stream after multiple attempts');
          disconnect();
        } else if (!autoReconnect) {
          // If auto-reconnect is disabled, disconnect on first error
          setConnectionError('Connection failed');
          disconnect();
        }
        // Otherwise, EventSource will automatically try to reconnect
      };

      eventSourceRef.current = eventSource;
    },
    [disconnect, getStreamUrl, handleEvent, autoReconnect, maxReconnectAttempts],
  );

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      disconnect();
    };
  }, [disconnect]);

  return {
    connect,
    disconnect,
    isConnected,
    jobId,
    testCases,
    assertions,
    connectionError,
  };
}
