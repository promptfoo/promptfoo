import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useJobState } from './useJobState';
import type { JobMetrics, JobError, JobCompletionSummary } from '@promptfoo/types';

describe('useJobState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('should return idle state initially', () => {
      const { result } = renderHook(() => useJobState());

      expect(result.current.state).toEqual({
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
        lastUpdateTimestamp: 0,
        vulnerabilities: [],
        severityCounts: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
        },
      });
    });
  });

  describe('startJob', () => {
    it('should transition to in-progress state with job ID', () => {
      const { result } = renderHook(() => useJobState());

      vi.setSystemTime(new Date('2024-01-01T12:00:00Z'));

      act(() => {
        result.current.actions.startJob('job-123');
      });

      expect(result.current.state.jobId).toBe('job-123');
      expect(result.current.state.status).toBe('in-progress');
      expect(result.current.state.phase).toBe('initializing');
      expect(result.current.state.phaseDetail).toBe('Starting red team evaluation...');
      expect(result.current.state.startedAt).toBe(Date.now());
      expect(result.current.state.metrics).toEqual({
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
      });
      expect(result.current.state.errors).toEqual([]);
    });

    it('should reset state when starting a new job', () => {
      const { result } = renderHook(() => useJobState());

      // Start first job and add some state
      act(() => {
        result.current.actions.startJob('job-1');
      });

      act(() => {
        result.current.actions.updateFromWebSocket({
          progress: 50,
          total: 100,
          logs: ['log1', 'log2'],
        });
      });

      // Start second job - should reset
      act(() => {
        result.current.actions.startJob('job-2');
      });

      expect(result.current.state.jobId).toBe('job-2');
      expect(result.current.state.progress).toBe(0);
      expect(result.current.state.total).toBe(0);
      expect(result.current.state.logs).toEqual([]);
    });
  });

  describe('reset', () => {
    it('should reset to initial state', () => {
      const { result } = renderHook(() => useJobState());

      act(() => {
        result.current.actions.startJob('job-123');
      });

      act(() => {
        result.current.actions.updateFromWebSocket({
          progress: 50,
          total: 100,
        });
      });

      act(() => {
        result.current.actions.reset();
      });

      expect(result.current.state.status).toBe('idle');
      expect(result.current.state.jobId).toBe(null);
      expect(result.current.state.progress).toBe(0);
    });

    it('should clear poll interval on reset', () => {
      const { result } = renderHook(() => useJobState());
      const clearIntervalSpy = vi.spyOn(window, 'clearInterval');

      act(() => {
        result.current.actions.startJob('job-123');
        result.current.actions.setPollInterval(123);
      });

      act(() => {
        result.current.actions.reset();
      });

      expect(clearIntervalSpy).toHaveBeenCalledWith(123);
    });
  });

  describe('updateFromWebSocket', () => {
    it('should update state with WebSocket payload', () => {
      const { result } = renderHook(() => useJobState());

      act(() => {
        result.current.actions.startJob('job-123');
      });

      const metrics: JobMetrics = {
        testPassCount: 5,
        testFailCount: 2,
        testErrorCount: 1,
        tokenUsage: { total: 1000, prompt: 600, completion: 400, numRequests: 8 },
        totalLatencyMs: 5000,
      };

      act(() => {
        result.current.actions.updateFromWebSocket({
          progress: 25,
          total: 100,
          phase: 'evaluating',
          phaseDetail: 'Running probes...',
          metrics,
        });
      });

      expect(result.current.state.progress).toBe(25);
      expect(result.current.state.total).toBe(100);
      expect(result.current.state.phase).toBe('evaluating');
      expect(result.current.state.phaseDetail).toBe('Running probes...');
      expect(result.current.state.metrics).toEqual(metrics);
    });

    it('should append logs correctly', () => {
      const { result } = renderHook(() => useJobState());

      act(() => {
        result.current.actions.startJob('job-123');
      });

      act(() => {
        result.current.actions.updateFromWebSocket({
          logs: ['log1', 'log2', 'log3'],
        });
      });

      expect(result.current.state.logs).toEqual(['log1', 'log2', 'log3']);
    });
  });

  describe('updateFromPolling', () => {
    it('should update state when no recent WebSocket update', () => {
      const { result } = renderHook(() => useJobState());

      act(() => {
        result.current.actions.startJob('job-123');
      });

      // Advance time past WebSocket priority window (2000ms)
      vi.advanceTimersByTime(3000);

      act(() => {
        result.current.actions.updateFromPolling({
          progress: 50,
          total: 100,
        });
      });

      expect(result.current.state.progress).toBe(50);
      expect(result.current.state.total).toBe(100);
    });

    it('should ignore polling update within WebSocket priority window', () => {
      const { result } = renderHook(() => useJobState());

      act(() => {
        result.current.actions.startJob('job-123');
      });

      // WebSocket update sets timestamp
      act(() => {
        result.current.actions.updateFromWebSocket({
          progress: 25,
          total: 100,
        });
      });

      // Polling update within 2 second window should be ignored
      vi.advanceTimersByTime(500);

      act(() => {
        result.current.actions.updateFromPolling({
          progress: 30, // Different value
          total: 100,
        });
      });

      // Should still have WebSocket value
      expect(result.current.state.progress).toBe(25);
    });

    it('should accept polling update after WebSocket priority window expires', () => {
      const { result } = renderHook(() => useJobState());

      act(() => {
        result.current.actions.startJob('job-123');
      });

      act(() => {
        result.current.actions.updateFromWebSocket({
          progress: 25,
          total: 100,
        });
      });

      // Advance past priority window
      vi.advanceTimersByTime(2500);

      act(() => {
        result.current.actions.updateFromPolling({
          progress: 50,
          total: 100,
        });
      });

      expect(result.current.state.progress).toBe(50);
    });
  });

  describe('logs merging', () => {
    it('should prefer longer log array', () => {
      const { result } = renderHook(() => useJobState());

      act(() => {
        result.current.actions.startJob('job-123');
      });

      // Initial logs
      act(() => {
        result.current.actions.updateFromWebSocket({
          logs: ['log1', 'log2'],
        });
      });

      vi.advanceTimersByTime(3000);

      // Polling with more logs should win
      act(() => {
        result.current.actions.updateFromPolling({
          logs: ['log1', 'log2', 'log3', 'log4'],
        });
      });

      expect(result.current.state.logs).toEqual(['log1', 'log2', 'log3', 'log4']);
    });

    it('should trust WebSocket logs when they have different last entry', () => {
      const { result } = renderHook(() => useJobState());

      act(() => {
        result.current.actions.startJob('job-123');
      });

      // Set initial logs via polling
      vi.advanceTimersByTime(3000);
      act(() => {
        result.current.actions.updateFromPolling({
          logs: ['log1', 'log2', 'log3'],
        });
      });

      // WebSocket sends different (newer) logs
      act(() => {
        result.current.actions.updateFromWebSocket({
          logs: ['log2', 'log3', 'log4'],
        });
      });

      // WebSocket should win because last entry differs
      expect(result.current.state.logs).toEqual(['log2', 'log3', 'log4']);
    });
  });

  describe('completeJob', () => {
    it('should transition to complete state', () => {
      const { result } = renderHook(() => useJobState());

      act(() => {
        result.current.actions.startJob('job-123');
      });

      const summary: JobCompletionSummary = {
        vulnerabilitiesFound: 5,
        topCategories: [{ name: 'pii', count: 3 }],
      };

      act(() => {
        result.current.actions.completeJob({
          evalId: 'eval-456',
          summary,
        });
      });

      expect(result.current.state.status).toBe('complete');
      expect(result.current.state.phase).toBe('complete');
      expect(result.current.state.evalId).toBe('eval-456');
      expect(result.current.state.summary).toEqual(summary);
    });

    it('should prevent duplicate completion', () => {
      const { result } = renderHook(() => useJobState());

      act(() => {
        result.current.actions.startJob('job-123');
      });

      act(() => {
        result.current.actions.completeJob({
          evalId: 'eval-1',
          summary: { vulnerabilitiesFound: 5, topCategories: [] },
        });
      });

      // Try to complete again with different data
      act(() => {
        result.current.actions.completeJob({
          evalId: 'eval-2', // Different ID
          summary: { vulnerabilitiesFound: 10, topCategories: [] },
        });
      });

      // Should keep first completion
      expect(result.current.state.evalId).toBe('eval-1');
      expect(result.current.state.summary?.vulnerabilitiesFound).toBe(5);
    });

    it('should clear poll interval on completion', () => {
      const { result } = renderHook(() => useJobState());
      const clearIntervalSpy = vi.spyOn(window, 'clearInterval');

      act(() => {
        result.current.actions.startJob('job-123');
        result.current.actions.setPollInterval(456);
      });

      act(() => {
        result.current.actions.completeJob({ evalId: 'eval-1' });
      });

      expect(clearIntervalSpy).toHaveBeenCalledWith(456);
    });
  });

  describe('errorJob', () => {
    it('should transition to error state with message', () => {
      const { result } = renderHook(() => useJobState());

      act(() => {
        result.current.actions.startJob('job-123');
      });

      act(() => {
        result.current.actions.errorJob('Connection lost');
      });

      expect(result.current.state.status).toBe('error');
      expect(result.current.state.phase).toBe('error');
      expect(result.current.state.phaseDetail).toBe('Connection lost');
    });

    it('should clear poll interval on error', () => {
      const { result } = renderHook(() => useJobState());
      const clearIntervalSpy = vi.spyOn(window, 'clearInterval');

      act(() => {
        result.current.actions.startJob('job-123');
        result.current.actions.setPollInterval(789);
      });

      act(() => {
        result.current.actions.errorJob('Failed');
      });

      expect(clearIntervalSpy).toHaveBeenCalledWith(789);
    });

    it('should use default message when none provided', () => {
      const { result } = renderHook(() => useJobState());

      act(() => {
        result.current.actions.startJob('job-123');
      });

      act(() => {
        result.current.actions.errorJob('');
      });

      expect(result.current.state.phaseDetail).toBe('Evaluation failed');
    });
  });

  describe('toggleLogs', () => {
    it('should toggle logsExpanded state', () => {
      const { result } = renderHook(() => useJobState());

      expect(result.current.state.logsExpanded).toBe(false);

      act(() => {
        result.current.actions.toggleLogs();
      });

      expect(result.current.state.logsExpanded).toBe(true);

      act(() => {
        result.current.actions.toggleLogs();
      });

      expect(result.current.state.logsExpanded).toBe(false);
    });
  });

  describe('poll interval management', () => {
    it('should set and clear poll interval', () => {
      const { result } = renderHook(() => useJobState());
      const clearIntervalSpy = vi.spyOn(window, 'clearInterval');

      act(() => {
        result.current.actions.setPollInterval(100);
      });

      expect(result.current.pollIntervalRef.current).toBe(100);

      act(() => {
        result.current.actions.clearPollInterval();
      });

      expect(clearIntervalSpy).toHaveBeenCalledWith(100);
      expect(result.current.pollIntervalRef.current).toBe(null);
    });

    it('should clear previous interval when setting new one', () => {
      const { result } = renderHook(() => useJobState());
      const clearIntervalSpy = vi.spyOn(window, 'clearInterval');

      act(() => {
        result.current.actions.setPollInterval(100);
      });

      act(() => {
        result.current.actions.setPollInterval(200);
      });

      expect(clearIntervalSpy).toHaveBeenCalledWith(100);
      expect(result.current.pollIntervalRef.current).toBe(200);
    });
  });

  describe('errors handling', () => {
    it('should update errors array via WebSocket', () => {
      const { result } = renderHook(() => useJobState());

      act(() => {
        result.current.actions.startJob('job-123');
      });

      const errors: JobError[] = [
        { type: 'rate_limit', message: 'Rate limited', timestamp: Date.now(), count: 3 },
        { type: 'timeout', message: 'Request timed out', timestamp: Date.now(), count: 1 },
      ];

      act(() => {
        result.current.actions.updateFromWebSocket({ errors });
      });

      expect(result.current.state.errors).toEqual(errors);
    });
  });

  describe('edge cases', () => {
    it('should handle empty update payloads gracefully', () => {
      const { result } = renderHook(() => useJobState());

      act(() => {
        result.current.actions.startJob('job-123');
      });

      const initialState = { ...result.current.state };

      act(() => {
        result.current.actions.updateFromWebSocket({});
      });

      // State should be unchanged except for potentially lastUpdateTimestamp
      expect(result.current.state.progress).toBe(initialState.progress);
      expect(result.current.state.total).toBe(initialState.total);
    });

    it('should handle rapid WebSocket updates', () => {
      const { result } = renderHook(() => useJobState());

      act(() => {
        result.current.actions.startJob('job-123');
      });

      // Rapid updates
      for (let i = 1; i <= 10; i++) {
        act(() => {
          result.current.actions.updateFromWebSocket({
            progress: i * 10,
            total: 100,
          });
        });
      }

      expect(result.current.state.progress).toBe(100);
    });

    it('should preserve metrics when completing without new metrics', () => {
      const { result } = renderHook(() => useJobState());

      act(() => {
        result.current.actions.startJob('job-123');
      });

      const metrics: JobMetrics = {
        testPassCount: 10,
        testFailCount: 2,
        testErrorCount: 0,
        tokenUsage: { total: 5000, prompt: 3000, completion: 2000, numRequests: 12 },
        totalLatencyMs: 10000,
      };

      act(() => {
        result.current.actions.updateFromWebSocket({ metrics });
      });

      // Complete without providing metrics
      act(() => {
        result.current.actions.completeJob({ evalId: 'eval-1' });
      });

      // Should preserve the existing metrics
      expect(result.current.state.metrics).toEqual(metrics);
    });
  });
});
