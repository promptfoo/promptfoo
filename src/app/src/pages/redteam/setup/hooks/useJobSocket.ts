import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { IS_RUNNING_LOCALLY } from '@app/constants';
import useApiConfig from '@app/stores/apiConfig';
import type {
  Job,
  JobError,
  JobMetrics,
  JobCompletionSummary,
  VulnerabilityFoundEvent,
} from '@promptfoo/types';

/**
 * Job update payload from WebSocket
 */
interface JobUpdatePayload {
  status: Job['status'];
  progress?: number;
  total?: number;
  phase?: Job['phase'];
  phaseDetail?: string;
  startedAt?: number;
  metrics?: JobMetrics;
  errors?: JobError[];
  logs?: string[];
}

/**
 * Job complete payload from WebSocket
 */
interface JobCompletePayload {
  status: Job['status'];
  evalId?: string | null;
  phase?: Job['phase'];
  phaseDetail?: string;
  metrics?: JobMetrics;
  errors?: JobError[];
  summary?: JobCompletionSummary;
}

interface UseJobSocketOptions {
  jobId: string | null;
  onUpdate?: (payload: JobUpdatePayload) => void;
  onComplete?: (payload: JobCompletePayload) => void;
  onVulnerability?: (vulnerability: VulnerabilityFoundEvent) => void;
  onError?: (error: Error) => void;
}

interface UseJobSocketReturn {
  isConnected: boolean;
  subscribe: (jobId: string) => void;
  unsubscribe: (jobId: string) => void;
}

/**
 * Custom hook for subscribing to job updates via WebSocket
 *
 * This hook creates a persistent socket connection and allows subscribing
 * to job-specific updates. It handles connection lifecycle and cleanup.
 */
export function useJobSocket({
  jobId,
  onUpdate,
  onComplete,
  onVulnerability,
  onError,
}: UseJobSocketOptions): UseJobSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const currentJobIdRef = useRef<string | null>(null);
  const apiBaseUrl = useApiConfig((state) => state.apiBaseUrl);

  // Store callbacks in refs to avoid reconnection when they change
  const onUpdateRef = useRef(onUpdate);
  const onCompleteRef = useRef(onComplete);
  const onVulnerabilityRef = useRef(onVulnerability);
  const onErrorRef = useRef(onError);

  // Keep refs in sync with props
  useEffect(() => {
    onUpdateRef.current = onUpdate;
    onCompleteRef.current = onComplete;
    onVulnerabilityRef.current = onVulnerability;
    onErrorRef.current = onError;
  }, [onUpdate, onComplete, onVulnerability, onError]);

  // Initialize socket connection
  useEffect(() => {
    if (!IS_RUNNING_LOCALLY) {
      return;
    }

    const socket = io(apiBaseUrl || '', {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      // Re-subscribe to current job if we reconnect
      if (currentJobIdRef.current) {
        socket.emit('job:subscribe', currentJobIdRef.current);
      }
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      onErrorRef.current?.(error);
    });

    // Handle job updates
    socket.on('job:update', (payload: JobUpdatePayload) => {
      onUpdateRef.current?.(payload);
    });

    // Handle job completion
    socket.on('job:complete', (payload: JobCompletePayload) => {
      onCompleteRef.current?.(payload);
    });

    // Handle vulnerability discoveries (sent immediately, not throttled)
    socket.on('job:vulnerability', (vulnerability: VulnerabilityFoundEvent) => {
      onVulnerabilityRef.current?.(vulnerability);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [apiBaseUrl]);

  // Subscribe to job updates when jobId changes
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !jobId) {
      return;
    }

    // Unsubscribe from previous job
    if (currentJobIdRef.current && currentJobIdRef.current !== jobId) {
      socket.emit('job:unsubscribe', currentJobIdRef.current);
    }

    // Subscribe to new job
    socket.emit('job:subscribe', jobId);
    currentJobIdRef.current = jobId;

    return () => {
      if (currentJobIdRef.current) {
        socket.emit('job:unsubscribe', currentJobIdRef.current);
        currentJobIdRef.current = null;
      }
    };
  }, [jobId]);

  const subscribe = useCallback((id: string) => {
    const socket = socketRef.current;
    if (!socket) {
      return;
    }
    socket.emit('job:subscribe', id);
    currentJobIdRef.current = id;
  }, []);

  const unsubscribe = useCallback((id: string) => {
    const socket = socketRef.current;
    if (!socket) {
      return;
    }
    socket.emit('job:unsubscribe', id);
    if (currentJobIdRef.current === id) {
      currentJobIdRef.current = null;
    }
  }, []);

  return {
    isConnected,
    subscribe,
    unsubscribe,
  };
}
