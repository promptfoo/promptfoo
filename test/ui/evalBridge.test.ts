import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TIMING } from '../../src/ui/constants';
import {
  createEvalUIController,
  createProgressCallback,
  extractProviderIds,
  wrapEvaluateOptions,
} from '../../src/ui/evalBridge';
import type { Mock } from 'vitest';

import type { EvaluateOptions, PromptMetrics, RunEvalOptions } from '../../src/types';
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

  describe('createProgressCallback', () => {
    it('should dispatch progress for completion without evalStep', () => {
      const dispatch = vi.fn<(action: EvalAction) => void>();
      const callback = createProgressCallback(dispatch);

      callback(5, 10, 0);

      expect(dispatch).toHaveBeenCalledWith({
        type: 'PROGRESS',
        payload: { completed: 5, total: 10 },
      });
    });

    it('should track pass/fail/error deltas per prompt', () => {
      const dispatch = vi.fn<(action: EvalAction) => void>();
      const callback = createProgressCallback(dispatch);

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

      callback(1, 10, 0, evalStep, metrics1);

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'PROGRESS',
          payload: expect.objectContaining({
            passed: true,
            error: undefined,
            latencyMs: 100,
            cost: 0.01,
          }),
        }),
      );
    });

    it('should calculate deltas from previous metrics', () => {
      const dispatch = vi.fn<(action: EvalAction) => void>();
      const callback = createProgressCallback(dispatch);

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
        testPassCount: 1,
        testFailCount: 1,
        testErrorCount: 0,
        totalLatencyMs: 250,
        cost: 0.03,
      } as any;

      callback(1, 10, 0, evalStep, metrics1);
      dispatch.mockClear();

      callback(2, 10, 1, evalStep, metrics2);

      // Delta: pass=0, fail=+1, error=0, latency=+150, cost=+0.02
      // Since deltaFail > 0 and deltaPass = 0, testPassed=false
      expect(dispatch).toHaveBeenCalled();
      const call = dispatch.mock.calls[0][0];
      expect(call.type).toBe('PROGRESS');
      if (call.type !== 'PROGRESS') {
        throw new Error('Expected PROGRESS action');
      }
      expect(call.payload.passed).toBe(false);
      expect(call.payload.error).toBeUndefined();
      expect(call.payload.latencyMs).toBe(150);
      expect(call.payload.cost).toBeCloseTo(0.02, 5);
    });

    it('should detect test errors from delta', () => {
      const dispatch = vi.fn<(action: EvalAction) => void>();
      const callback = createProgressCallback(dispatch);

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
        testPassCount: 0,
        testFailCount: 0,
        testErrorCount: 1,
        totalLatencyMs: 100,
        cost: 0.01,
      } as any;

      callback(1, 10, 0, evalStep, metrics);

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'PROGRESS',
          payload: expect.objectContaining({
            passed: false,
            error: 'Test error',
          }),
        }),
      );
    });

    it('should track metrics per provider-prompt combination', () => {
      const dispatch = vi.fn<(action: EvalAction) => void>();
      const callback = createProgressCallback(dispatch);

      const provider = {
        id: () => 'openai:gpt-4',
        label: undefined,
      };

      const evalStep1: RunEvalOptions = {
        provider: provider as any,
        prompt: { raw: 'Prompt 1' },
        test: { vars: {} },
        promptIdx: 0,
      } as any;

      const evalStep2: RunEvalOptions = {
        provider: provider as any,
        prompt: { raw: 'Prompt 2' },
        test: { vars: {} },
        promptIdx: 1,
      } as any;

      const metrics1: PromptMetrics = {
        testPassCount: 1,
        testFailCount: 0,
        testErrorCount: 0,
        totalLatencyMs: 100,
        cost: 0.01,
      } as any;

      const metrics2: PromptMetrics = {
        testPassCount: 1,
        testFailCount: 0,
        testErrorCount: 0,
        totalLatencyMs: 120,
        cost: 0.015,
      } as any;

      callback(1, 10, 0, evalStep1, metrics1);
      callback(2, 10, 1, evalStep2, metrics2);

      // Both should show as first test (passed=true, full metrics)
      expect(dispatch).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          payload: expect.objectContaining({
            passed: true,
            latencyMs: 100,
            cost: 0.01,
          }),
        }),
      );

      expect(dispatch).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          payload: expect.objectContaining({
            passed: true,
            latencyMs: 120,
            cost: 0.015,
          }),
        }),
      );
    });

    it('should dispatch grading tokens when available', () => {
      const dispatch = vi.fn<(action: EvalAction) => void>();
      const callback = createProgressCallback(dispatch);

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
        tokenUsage: {
          assertions: {
            total: 500,
            prompt: 100,
            completion: 400,
            cached: 50,
            completionDetails: {
              reasoning: 100,
            },
          },
        },
      } as any;

      callback(1, 10, 0, evalStep, metrics);

      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_GRADING_TOKENS',
        payload: {
          providerId: 'openai:gpt-4',
          tokens: {
            total: 500,
            prompt: 100,
            completion: 400,
            cached: 50,
            reasoning: 100,
          },
        },
      });
    });

    it('should not dispatch grading tokens when total is zero', () => {
      const dispatch = vi.fn<(action: EvalAction) => void>();
      const callback = createProgressCallback(dispatch);

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
        tokenUsage: {
          assertions: {
            total: 0,
            prompt: 0,
            completion: 0,
          },
        },
      } as any;

      callback(1, 10, 0, evalStep, metrics);

      expect(dispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SET_GRADING_TOKENS',
        }),
      );
    });

    it('should handle provider labels', () => {
      const dispatch = vi.fn<(action: EvalAction) => void>();
      const callback = createProgressCallback(dispatch);

      const provider = {
        id: () => 'openai:gpt-4',
        label: 'GPT-4 Production',
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

      callback(1, 10, 0, evalStep, metrics);

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            provider: 'GPT-4 Production',
          }),
        }),
      );
    });

    it('should format complex prompts', () => {
      const dispatch = vi.fn<(action: EvalAction) => void>();
      const callback = createProgressCallback(dispatch);

      const provider = {
        id: () => 'openai:gpt-4',
        label: undefined,
      };

      const evalStep: RunEvalOptions = {
        provider: provider as any,
        prompt: { raw: ['Message 1', 'Message 2'] },
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

      callback(1, 10, 0, evalStep, metrics);

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            prompt: '[complex prompt]',
          }),
        }),
      );
    });

    it('should truncate long prompts', () => {
      const dispatch = vi.fn<(action: EvalAction) => void>();
      const callback = createProgressCallback(dispatch);

      const provider = {
        id: () => 'openai:gpt-4',
        label: undefined,
      };

      const longPrompt = 'A'.repeat(100);

      const evalStep: RunEvalOptions = {
        provider: provider as any,
        prompt: { raw: longPrompt },
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

      callback(1, 10, 0, evalStep, metrics);

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            prompt: 'A'.repeat(50),
          }),
        }),
      );
    });

    it('should handle fallback logic when no delta but total increased', () => {
      const dispatch = vi.fn<(action: EvalAction) => void>();
      const callback = createProgressCallback(dispatch);

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

      // First callback with no metrics
      callback(1, 10, 0, evalStep, undefined);
      dispatch.mockClear();

      // Second callback with metrics but somehow deltas are all 0
      // This edge case is handled by the fallback logic
      const metrics: PromptMetrics = {
        testPassCount: 0,
        testFailCount: 0,
        testErrorCount: 0,
        totalLatencyMs: 100,
        cost: 0.01,
      } as any;

      callback(2, 10, 1, evalStep, metrics);

      // Should still dispatch progress
      expect(dispatch).toHaveBeenCalled();
    });

    it('should handle fallback logic with equal deltas favoring pass', () => {
      const dispatch = vi.fn<(action: EvalAction) => void>();
      const callback = createProgressCallback(dispatch);

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

      // First callback - establish baseline
      const metrics1: PromptMetrics = {
        testPassCount: 0,
        testFailCount: 0,
        testErrorCount: 0,
        totalLatencyMs: 0,
        cost: 0,
      } as any;

      callback(1, 10, 0, evalStep, metrics1);
      dispatch.mockClear();

      // Second callback with all counts equal (edge case)
      // Fallback should pick pass since deltaPass >= deltaFail
      const metrics2: PromptMetrics = {
        testPassCount: 0,
        testFailCount: 0,
        testErrorCount: 0,
        totalLatencyMs: 100,
        cost: 0.01,
      } as any;

      callback(2, 10, 1, evalStep, metrics2);

      expect(dispatch).toHaveBeenCalled();
    });

    it('should handle fallback logic favoring error over fail', () => {
      const dispatch = vi.fn<(action: EvalAction) => void>();
      const callback = createProgressCallback(dispatch);

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

      // First callback - establish baseline with zero deltas
      const metrics1: PromptMetrics = {
        testPassCount: 0,
        testFailCount: 0,
        testErrorCount: 0,
        totalLatencyMs: 0,
        cost: 0,
      } as any;

      callback(1, 10, 0, evalStep, metrics1);
      dispatch.mockClear();

      // Second callback where error count is highest
      const metrics2: PromptMetrics = {
        testPassCount: 0,
        testFailCount: 0,
        testErrorCount: 1,
        totalLatencyMs: 100,
        cost: 0.01,
      } as any;

      callback(2, 10, 1, evalStep, metrics2);

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            error: 'Test error',
          }),
        }),
      );
    });

    it('should handle negative latency deltas with Math.max', () => {
      const dispatch = vi.fn<(action: EvalAction) => void>();
      const callback = createProgressCallback(dispatch);

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
        totalLatencyMs: 200,
        cost: 0.02,
      } as any;

      const metrics2: PromptMetrics = {
        testPassCount: 2,
        testFailCount: 0,
        testErrorCount: 0,
        totalLatencyMs: 150, // Lower than previous (shouldn't happen but handled)
        cost: 0.015,
      } as any;

      callback(1, 10, 0, evalStep, metrics1);
      dispatch.mockClear();

      callback(2, 10, 1, evalStep, metrics2);

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            latencyMs: 0, // Math.max(0, -50)
            cost: 0, // Math.max(0, -0.005)
          }),
        }),
      );
    });

    it('should format vars for display', () => {
      const dispatch = vi.fn<(action: EvalAction) => void>();
      const callback = createProgressCallback(dispatch);

      const provider = {
        id: () => 'openai:gpt-4',
        label: undefined,
      };

      const evalStep: RunEvalOptions = {
        provider: provider as any,
        prompt: { raw: 'Test prompt' },
        test: {
          vars: {
            name: 'John Doe',
            age: 30,
            city: 'New York',
            country: 'USA',
          },
        },
        promptIdx: 0,
      } as any;

      const metrics: PromptMetrics = {
        testPassCount: 1,
        testFailCount: 0,
        testErrorCount: 0,
        totalLatencyMs: 100,
        cost: 0.01,
      } as any;

      callback(1, 10, 0, evalStep, metrics);

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            vars: expect.stringContaining('name='),
          }),
        }),
      );
    });

    it('should handle vars with long values', () => {
      const dispatch = vi.fn<(action: EvalAction) => void>();
      const callback = createProgressCallback(dispatch);

      const provider = {
        id: () => 'openai:gpt-4',
        label: undefined,
      };

      const longValue = 'A'.repeat(100);

      const evalStep: RunEvalOptions = {
        provider: provider as any,
        prompt: { raw: 'Test prompt' },
        test: {
          vars: {
            longVar: longValue,
          },
        },
        promptIdx: 0,
      } as any;

      const metrics: PromptMetrics = {
        testPassCount: 1,
        testFailCount: 0,
        testErrorCount: 0,
        totalLatencyMs: 100,
        cost: 0.01,
      } as any;

      callback(1, 10, 0, evalStep, metrics);

      // Should truncate long values
      expect(dispatch).toHaveBeenCalled();
      const call = dispatch.mock.calls[0][0];
      expect(call.type).toBe('PROGRESS');
      if (call.type !== 'PROGRESS') {
        throw new Error('Expected PROGRESS action');
      }
      const vars = call.payload.vars;
      expect(vars).toBeDefined();
      if (!vars) {
        throw new Error('Expected vars to be defined');
      }
      expect(vars.length).toBeLessThan(longValue.length);
    });

    it('should replace newlines in prompts', () => {
      const dispatch = vi.fn<(action: EvalAction) => void>();
      const callback = createProgressCallback(dispatch);

      const provider = {
        id: () => 'openai:gpt-4',
        label: undefined,
      };

      const evalStep: RunEvalOptions = {
        provider: provider as any,
        prompt: { raw: 'Line 1\nLine 2\nLine 3' },
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

      callback(1, 10, 0, evalStep, metrics);

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            prompt: expect.not.stringContaining('\n'),
          }),
        }),
      );
    });
  });

  describe('wrapEvaluateOptions', () => {
    it('should wrap options with progress callback', () => {
      const dispatch = vi.fn<(action: EvalAction) => void>();
      const options: EvaluateOptions = {
        maxConcurrency: 4,
      };

      const wrapped = wrapEvaluateOptions(options, dispatch);

      expect(wrapped.progressCallback).toBeDefined();
      expect(wrapped.maxConcurrency).toBe(4);
    });

    it('should call both original and ink callbacks', () => {
      const dispatch = vi.fn<(action: EvalAction) => void>();
      const originalCallback = vi.fn();

      const options: EvaluateOptions = {
        maxConcurrency: 4,
        progressCallback: originalCallback,
      };

      const wrapped = wrapEvaluateOptions(options, dispatch);

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

      wrapped.progressCallback!(1, 10, 0, evalStep, metrics);

      expect(dispatch).toHaveBeenCalled();
      expect(originalCallback).toHaveBeenCalledWith(1, 10, 0, evalStep, metrics);
    });

    it('should handle missing original callback', () => {
      const dispatch = vi.fn<(action: EvalAction) => void>();
      const options: EvaluateOptions = {
        maxConcurrency: 4,
      };

      const wrapped = wrapEvaluateOptions(options, dispatch);

      expect(() => {
        wrapped.progressCallback!(1, 10, 0, undefined as any, undefined as any);
      }).not.toThrow();

      expect(dispatch).toHaveBeenCalled();
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

    it('should dispatch SET_TABLE_DATA and SET_SESSION_PHASE for showResults', () => {
      const tableData = {
        head: { prompts: [], vars: [] },
        body: [],
      } as any;

      controller.showResults(tableData);

      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_TABLE_DATA',
        payload: tableData,
      });

      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_SESSION_PHASE',
        payload: 'results',
      });
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
