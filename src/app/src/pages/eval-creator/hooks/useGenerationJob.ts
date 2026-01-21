/**
 * Hook for managing generation job polling and state.
 * Provides a clean interface for starting jobs, tracking progress,
 * and handling completion/errors.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { getJobStatus } from '../api/generation';

import type { GenerationJob, GenerationResult } from '../api/generation';

export type JobStatus = 'idle' | 'pending' | 'in-progress' | 'complete' | 'error';

export interface UseGenerationJobOptions {
  /** Called when progress updates */
  onProgress?: (progress: number, total: number, phase: string) => void;
  /** Called when job completes successfully */
  onComplete?: (result: GenerationResult) => void;
  /** Called when job fails */
  onError?: (error: string) => void;
  /** Polling interval in ms (default: 1000) */
  pollInterval?: number;
}

export interface UseGenerationJobReturn {
  /** Start a generation job by calling the API endpoint */
  startJob: (
    type: 'dataset' | 'assertions' | 'tests',
    startJobFn: () => Promise<{ jobId: string }>,
  ) => Promise<string>;
  /** Cancel the current job polling (doesn't cancel server-side job) */
  cancelJob: () => void;
  /** Current job ID */
  jobId: string | null;
  /** Current job status */
  status: JobStatus;
  /** Current progress (0 to total) */
  progress: number;
  /** Total steps for progress */
  total: number;
  /** Current phase description */
  phase: string;
  /** Job result (when complete) */
  result: GenerationResult | null;
  /** Error message (when failed) */
  error: string | null;
  /** Reset state to idle */
  reset: () => void;
}

export function useGenerationJob(options: UseGenerationJobOptions = {}): UseGenerationJobReturn {
  const { onProgress, onComplete, onError, pollInterval = 1000 } = options;

  const [jobId, setJobId] = useState<string | null>(null);
  const [_jobType, setJobType] = useState<'dataset' | 'assertions' | 'tests' | null>(null);
  const [status, setStatus] = useState<JobStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [phase, setPhase] = useState('');
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const activeJobIdRef = useRef<string | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stopPolling();
    activeJobIdRef.current = null;
    setJobId(null);
    setJobType(null);
    setStatus('idle');
    setProgress(0);
    setTotal(0);
    setPhase('');
    setResult(null);
    setError(null);
  }, [stopPolling]);

  const pollJobStatus = useCallback(
    async (id: string, type: 'dataset' | 'assertions' | 'tests') => {
      try {
        const job: GenerationJob = await getJobStatus(type, id);

        if (!isMountedRef.current) {
          return;
        }

        // Guard against stale responses from previous jobs
        if (activeJobIdRef.current !== id) {
          return;
        }

        // Update progress
        setProgress(job.progress);
        setTotal(job.total);
        setPhase(job.phase);

        // Call progress callback
        onProgress?.(job.progress, job.total, job.phase);

        // Handle status changes
        if (job.status === 'complete') {
          stopPolling();
          setStatus('complete');
          if (job.result) {
            setResult(job.result);
            onComplete?.(job.result);
          }
        } else if (job.status === 'error') {
          stopPolling();
          setStatus('error');
          const errorMsg = job.error || 'Generation failed';
          setError(errorMsg);
          onError?.(errorMsg);
        } else if (job.status === 'in-progress') {
          setStatus('in-progress');
        }
      } catch (err) {
        if (!isMountedRef.current) {
          return;
        }
        stopPolling();
        setStatus('error');
        const errorMsg = err instanceof Error ? err.message : 'Failed to get job status';
        setError(errorMsg);
        onError?.(errorMsg);
      }
    },
    [onProgress, onComplete, onError, stopPolling],
  );

  const startJob = useCallback(
    async (
      type: 'dataset' | 'assertions' | 'tests',
      startJobFn: () => Promise<{ jobId: string }>,
    ): Promise<string> => {
      // Reset state
      reset();
      setStatus('pending');
      setJobType(type);
      setPhase('Starting generation...');

      try {
        // Call the provided function to start the job
        const { jobId: newJobId } = await startJobFn();

        if (!isMountedRef.current) {
          return newJobId;
        }

        setJobId(newJobId);
        activeJobIdRef.current = newJobId;

        // Start polling
        pollingRef.current = setInterval(() => {
          pollJobStatus(newJobId, type);
        }, pollInterval);

        // Poll immediately
        pollJobStatus(newJobId, type);

        return newJobId;
      } catch (err) {
        if (!isMountedRef.current) {
          throw err;
        }
        setStatus('error');
        const errorMsg = err instanceof Error ? err.message : 'Failed to start generation';
        setError(errorMsg);
        onError?.(errorMsg);
        throw err;
      }
    },
    [reset, pollInterval, pollJobStatus, onError],
  );

  const cancelJob = useCallback(() => {
    stopPolling();
    // Note: This doesn't cancel the server-side job, just stops polling
    // The job will continue to completion on the server
    if (status === 'pending' || status === 'in-progress') {
      setStatus('idle');
      setPhase('');
    }
  }, [stopPolling, status]);

  return {
    startJob,
    cancelJob,
    jobId,
    status,
    progress,
    total,
    phase,
    result,
    error,
    reset,
  };
}
