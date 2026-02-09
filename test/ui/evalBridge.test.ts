import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TIMING } from '../../src/ui/constants';
import { createEvalUIController, extractProviderIds } from '../../src/ui/evalBridge';
import type { Mock } from 'vitest';

import type { PromptMetrics, RunEvalOptions } from '../../src/types';
import type { EvalAction } from '../../src/ui/contexts/EvalContext';
import type { EvalUIController } from '../../src/ui/evalBridge';

describe('evalBridge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('batching behavior (via createEvalUIController)', () => {
    let dispatch: Mock<(action: EvalAction) => void>;
    let controller: EvalUIController;

    beforeEach(() => {
      dispatch = vi.fn<(action: EvalAction) => void>();
      controller = createEvalUIController(dispatch);
    });

    afterEach(() => {
      controller.cleanup();
    });

    it('should dispatch first progress item immediately', () => {
      const provider = {
        id: () => 'openai:gpt-4',
        label: undefined,
      };

      const evalStep: RunEvalOptions = {
        provider: provider as any,
        prompt: { raw: 'Test prompt' },
        test: { vars: {} },
        promptIdx: 0,
      } as any;

      const metrics: PromptMetrics = {
        testPassCount: 1,
        testFailCount: 0,
        testErrorCount: 0,
        totalLatencyMs: 100,
        cost: 0.01,
      } as any;

      controller.progress(1, 10, 0, evalStep, metrics);

      // First item should be dispatched immediately
      expect(dispatch).toHaveBeenCalled();
    });

    it('should queue subsequent progress items without immediate dispatch', () => {
      const provider = {
        id: () => 'openai:gpt-4',
        label: undefined,
      };

      const evalStep: RunEvalOptions = {
        provider: provider as any,
        prompt: { raw: 'Test prompt' },
        test: { vars: {} },
        promptIdx: 0,
      } as any;

      const metrics1: PromptMetrics = {
        testPassCount: 1,
        testFailCount: 0,
        testErrorCount: 0,
        totalLatencyMs: 100,
        cost: 0.01,
      } as any;

      const metrics2: PromptMetrics = {
        testPassCount: 2,
        testFailCount: 0,
        testErrorCount: 0,
        totalLatencyMs: 200,
        cost: 0.02,
      } as any;

      controller.progress(1, 10, 0, evalStep, metrics1);
      dispatch.mockClear();

      controller.progress(2, 10, 1, evalStep, metrics2);

      // Second item should not be dispatched immediately
      expect(dispatch).not.toHaveBeenCalled();
    });

    it('should flush queued items after batch interval', () => {
      const provider = {
        id: () => 'openai:gpt-4',
        label: undefined,
      };

      const evalStep: RunEvalOptions = {
        provider: provider as any,
        prompt: { raw: 'Test prompt' },
        test: { vars: {} },
        promptIdx: 0,
      } as any;

      const metrics1: PromptMetrics = {
        testPassCount: 1,
        testFailCount: 0,
        testErrorCount: 0,
        totalLatencyMs: 100,
        cost: 0.01,
      } as any;

      const metrics2: PromptMetrics = {
        testPassCount: 2,
        testFailCount: 0,
        testErrorCount: 0,
        totalLatencyMs: 200,
        cost: 0.02,
      } as any;

      const metrics3: PromptMetrics = {
        testPassCount: 3,
        testFailCount: 0,
        testErrorCount: 0,
        totalLatencyMs: 300,
        cost: 0.03,
      } as any;

      controller.progress(1, 10, 0, evalStep, metrics1);
      dispatch.mockClear();

      controller.progress(2, 10, 1, evalStep, metrics2);
      controller.progress(3, 10, 2, evalStep, metrics3);

      // Advance timers to trigger batch flush
      vi.advanceTimersByTime(TIMING.BATCH_INTERVAL_MS);

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'BATCH_PROGRESS',
        }),
      );
    });

    it('should cleanup timers and flush remaining items on complete', () => {
      const provider = {
        id: () => 'openai:gpt-4',
        label: undefined,
      };

      const evalStep: RunEvalOptions = {
        provider: provider as any,
        prompt: { raw: 'Test prompt' },
        test: { vars: {} },
        promptIdx: 0,
      } as any;

      const metrics1: PromptMetrics = {
        testPassCount: 1,
        testFailCount: 0,
        testErrorCount: 0,
        totalLatencyMs: 100,
        cost: 0.01,
      } as any;

      const metrics2: PromptMetrics = {
        testPassCount: 2,
        testFailCount: 0,
        testErrorCount: 0,
        totalLatencyMs: 200,
        cost: 0.02,
      } as any;

      controller.progress(1, 10, 0, evalStep, metrics1);
      dispatch.mockClear();

      controller.progress(2, 10, 1, evalStep, metrics2);

      // Complete should flush remaining items
      controller.complete({ passed: 2, failed: 0, errors: 0 });

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'BATCH_PROGRESS',
        }),
      );

      expect(dispatch).toHaveBeenCalledWith({
        type: 'COMPLETE',
        payload: { passed: 2, failed: 0, errors: 0 },
      });
    });

    it('should cleanup timers and flush remaining items on error', () => {
      const provider = {
        id: () => 'openai:gpt-4',
        label: undefined,
      };

      const evalStep: RunEvalOptions = {
        provider: provider as any,
        prompt: { raw: 'Test prompt' },
        test: { vars: {} },
        promptIdx: 0,
      } as any;

      const metrics1: PromptMetrics = {
        testPassCount: 1,
        testFailCount: 0,
        testErrorCount: 0,
        totalLatencyMs: 100,
        cost: 0.01,
      } as any;

      controller.progress(1, 10, 0, evalStep, metrics1);
      dispatch.mockClear();

      // Error should flush remaining items
      controller.error('Fatal error');

      expect(dispatch).toHaveBeenCalledWith({
        type: 'ERROR',
        payload: { message: 'Fatal error' },
      });
    });

    it('should clear timer on manual cleanup', () => {
      const provider = {
        id: () => 'openai:gpt-4',
        label: undefined,
      };

      const evalStep: RunEvalOptions = {
        provider: provider as any,
        prompt: { raw: 'Test prompt' },
        test: { vars: {} },
        promptIdx: 0,
      } as any;

      const metrics1: PromptMetrics = {
        testPassCount: 1,
        testFailCount: 0,
        testErrorCount: 0,
        totalLatencyMs: 100,
        cost: 0.01,
      } as any;

      const metrics2: PromptMetrics = {
        testPassCount: 2,
        testFailCount: 0,
        testErrorCount: 0,
        totalLatencyMs: 200,
        cost: 0.02,
      } as any;

      controller.progress(1, 10, 0, evalStep, metrics1);
      controller.progress(2, 10, 1, evalStep, metrics2);

      controller.cleanup();
      dispatch.mockClear();

      // Advancing timers after cleanup should not trigger flush
      vi.advanceTimersByTime(TIMING.BATCH_INTERVAL_MS);
      expect(dispatch).not.toHaveBeenCalled();
    });

    it('should handle multiple rapid progress updates', () => {
      const provider = {
        id: () => 'openai:gpt-4',
        label: undefined,
      };

      const evalStep: RunEvalOptions = {
        provider: provider as any,
        prompt: { raw: 'Test prompt' },
        test: { vars: {} },
        promptIdx: 0,
      } as any;

      // Simulate 10 rapid progress updates
      for (let i = 0; i < 10; i++) {
        const metrics: PromptMetrics = {
          testPassCount: i + 1,
          testFailCount: 0,
          testErrorCount: 0,
          totalLatencyMs: (i + 1) * 100,
          cost: (i + 1) * 0.01,
        } as any;

        controller.progress(i + 1, 10, i, evalStep, metrics);
      }

      // First item should be dispatched immediately
      // Find the first PROGRESS dispatch
      const progressDispatches = dispatch.mock.calls.filter((call) => call[0].type === 'PROGRESS');
      expect(progressDispatches.length).toBeGreaterThan(0);

      dispatch.mockClear();

      // Flush remaining items
      vi.advanceTimersByTime(TIMING.BATCH_INTERVAL_MS);

      // Should have batched remaining items
      const batchDispatches = dispatch.mock.calls.filter(
        (call) => call[0].type === 'BATCH_PROGRESS',
      );
      expect(batchDispatches.length).toBeGreaterThan(0);
    });
  });

  describe('extractProviderIds', () => {
    it('should extract provider IDs from providers with id() method', () => {
      const providers = [
        { id: () => 'openai:gpt-4', label: undefined },
        { id: () => 'anthropic:claude-3', label: undefined },
      ];

      const ids = extractProviderIds(providers);

      expect(ids).toEqual(['openai:gpt-4', 'anthropic:claude-3']);
    });

    it('should prefer label over id() when label is present', () => {
      const providers = [
        { id: () => 'openai:gpt-4', label: 'GPT-4 Production' },
        { id: () => 'anthropic:claude-3', label: 'Claude Dev' },
      ];

      const ids = extractProviderIds(providers);

      expect(ids).toEqual(['GPT-4 Production', 'Claude Dev']);
    });

    it('should handle mix of labeled and unlabeled providers', () => {
      const providers = [
        { id: () => 'openai:gpt-4', label: 'GPT-4 Production' },
        { id: () => 'anthropic:claude-3', label: undefined },
        { id: () => 'gemini:pro', label: 'Gemini' },
      ];

      const ids = extractProviderIds(providers);

      expect(ids).toEqual(['GPT-4 Production', 'anthropic:claude-3', 'Gemini']);
    });

    it('should handle empty provider array', () => {
      const providers: Array<{ id: () => string; label?: string }> = [];

      const ids = extractProviderIds(providers);

      expect(ids).toEqual([]);
    });
  });

  describe('createEvalUIController', () => {
    let dispatch: Mock<(action: EvalAction) => void>;
    let controller: EvalUIController;

    beforeEach(() => {
      dispatch = vi.fn<(action: EvalAction) => void>();
      controller = createEvalUIController(dispatch);
    });

    afterEach(() => {
      controller.cleanup();
    });

    it('should create controller with all methods', () => {
      expect(controller.init).toBeDefined();
      expect(controller.start).toBeDefined();
      expect(controller.progress).toBeDefined();
      expect(controller.addError).toBeDefined();
      expect(controller.addLog).toBeDefined();
      expect(controller.complete).toBeDefined();
      expect(controller.error).toBeDefined();
      expect(controller.setPhase).toBeDefined();
      expect(controller.setShareUrl).toBeDefined();
      expect(controller.setSharingStatus).toBeDefined();
      expect(controller.setSessionPhase).toBeDefined();
      expect(controller.showResults).toBeDefined();
      expect(controller.cleanup).toBeDefined();
    });

    it('should dispatch INIT action', () => {
      controller.init(100, ['openai:gpt-4', 'anthropic:claude-3'], 10);

      expect(dispatch).toHaveBeenCalledWith({
        type: 'INIT',
        payload: {
          totalTests: 100,
          providers: ['openai:gpt-4', 'anthropic:claude-3'],
          concurrency: 10,
        },
      });
    });

    it('should dispatch START action', () => {
      controller.start();

      expect(dispatch).toHaveBeenCalledWith({ type: 'START' });
    });

    it('should dispatch ADD_ERROR action', () => {
      controller.addError('openai:gpt-4', 'Test prompt', 'API error', { var1: 'value' });

      expect(dispatch).toHaveBeenCalledWith({
        type: 'ADD_ERROR',
        payload: {
          provider: 'openai:gpt-4',
          prompt: 'Test prompt',
          message: 'API error',
          vars: { var1: 'value' },
        },
      });
    });

    it('should dispatch ADD_LOG action', () => {
      const logEntry = {
        id: 'log-test-1',
        timestamp: Date.now(),
        level: 'info' as const,
        message: 'Test log',
      };

      controller.addLog(logEntry);

      expect(dispatch).toHaveBeenCalledWith({
        type: 'ADD_LOG',
        payload: logEntry,
      });
    });

    it('should flush batches and dispatch COMPLETE action', () => {
      controller.complete({ passed: 80, failed: 15, errors: 5 });

      expect(dispatch).toHaveBeenCalledWith({
        type: 'COMPLETE',
        payload: { passed: 80, failed: 15, errors: 5 },
      });
    });

    it('should flush batches and dispatch ERROR action', () => {
      controller.error('Fatal error');

      expect(dispatch).toHaveBeenCalledWith({
        type: 'ERROR',
        payload: { message: 'Fatal error' },
      });
    });

    it('should dispatch SET_PHASE action', () => {
      controller.setPhase('evaluating');

      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_PHASE',
        payload: 'evaluating',
      });
    });

    it('should dispatch SET_SHARE_URL action', () => {
      controller.setShareUrl('https://example.com/share/123');

      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_SHARE_URL',
        payload: 'https://example.com/share/123',
      });
    });

    it('should dispatch SET_SHARING_STATUS action', () => {
      controller.setSharingStatus('sharing', 'https://example.com/share/123');

      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_SHARING_STATUS',
        payload: { status: 'sharing', url: 'https://example.com/share/123' },
      });
    });

    it('should dispatch SET_SESSION_PHASE action', () => {
      controller.setSessionPhase('results');

      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_SESSION_PHASE',
        payload: 'results',
      });
    });

    it('should dispatch SET_TABLE_DATA for showResults', () => {
      const tableData = {
        head: { prompts: [], vars: [] },
        body: [],
      } as any;

      controller.showResults(tableData);

      // Only SET_TABLE_DATA is dispatched; it maps to SHOW_RESULTS event
      // which transitions to results state AND sets table data
      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_TABLE_DATA',
        payload: tableData,
      });
      expect(dispatch).toHaveBeenCalledTimes(1);
    });

    it('should use batching for progress callback', () => {
      const provider = {
        id: () => 'openai:gpt-4',
        label: undefined,
      };

      const evalStep: RunEvalOptions = {
        provider: provider as any,
        prompt: { raw: 'Test prompt' },
        test: { vars: {} },
        promptIdx: 0,
      } as any;

      const metrics: PromptMetrics = {
        testPassCount: 1,
        testFailCount: 0,
        testErrorCount: 0,
        totalLatencyMs: 100,
        cost: 0.01,
      } as any;

      // First progress should be dispatched immediately
      controller.progress(1, 10, 0, evalStep, metrics);

      expect(dispatch).toHaveBeenCalled();
      dispatch.mockClear();

      // Second progress should be queued
      const metrics2: PromptMetrics = {
        testPassCount: 2,
        testFailCount: 0,
        testErrorCount: 0,
        totalLatencyMs: 200,
        cost: 0.02,
      } as any;

      controller.progress(2, 10, 1, evalStep, metrics2);

      // Should not be dispatched yet
      expect(dispatch).not.toHaveBeenCalled();

      // Advance timer to flush batch
      vi.advanceTimersByTime(TIMING.BATCH_INTERVAL_MS);

      // Now should be dispatched as batch
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'BATCH_PROGRESS',
        }),
      );
    });

    it('should cleanup batching timers', () => {
      const provider = {
        id: () => 'openai:gpt-4',
        label: undefined,
      };

      const evalStep: RunEvalOptions = {
        provider: provider as any,
        prompt: { raw: 'Test prompt' },
        test: { vars: {} },
        promptIdx: 0,
      } as any;

      const metrics: PromptMetrics = {
        testPassCount: 1,
        testFailCount: 0,
        testErrorCount: 0,
        totalLatencyMs: 100,
        cost: 0.01,
      } as any;

      controller.progress(1, 10, 0, evalStep, metrics);
      dispatch.mockClear();

      controller.progress(2, 10, 1, evalStep, metrics);

      // Cleanup should flush pending items
      controller.cleanup();

      expect(dispatch).toHaveBeenCalled();
      dispatch.mockClear();

      // Timer should be cleared
      vi.advanceTimersByTime(TIMING.BATCH_INTERVAL_MS);
      expect(dispatch).not.toHaveBeenCalled();
    });
  });
});
