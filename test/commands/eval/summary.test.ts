import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { generateEvalSummary } from '../../../src/commands/eval/summary';
import { stripAnsi } from '../../util/utils';

import type { EvalSummaryParams } from '../../../src/commands/eval/summary';
import type { TokenUsageTracker } from '../../../src/util/tokenUsage';

type MockTracker = {
  getProviderIds: Mock;
  getProviderUsage: Mock;
  trackUsage: Mock;
  resetAllUsage: Mock;
  resetProviderUsage: Mock;
  getTotalUsage: Mock;
  cleanup: Mock;
};

function createMockTracker(): TokenUsageTracker {
  return {
    getProviderIds: vi.fn().mockReturnValue([]),
    getProviderUsage: vi.fn(),
    trackUsage: vi.fn(),
    resetAllUsage: vi.fn(),
    resetProviderUsage: vi.fn(),
    getTotalUsage: vi.fn(),
    cleanup: vi.fn(),
  } as unknown as TokenUsageTracker;
}

describe('generateEvalSummary', () => {
  let mockTracker: MockTracker & TokenUsageTracker;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTracker = createMockTracker() as MockTracker & TokenUsageTracker;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('completion message', () => {
    it('should show basic completion message when not writing to database', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-123',
        isRedteam: false,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: { total: 0 },
        successes: 5,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).toContain('✓ Eval complete');
      expect(output).not.toContain('eval-123');
    });

    it('should show eval ID when writing to database without shareable URL', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-456',
        isRedteam: false,
        writeToDatabase: true,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: { total: 0 },
        successes: 5,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).toContain('✓ Eval complete (ID: eval-456)');
    });

    it('should show shareable URL when available', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-789',
        isRedteam: false,
        writeToDatabase: true,
        shareableUrl: 'https://promptfoo.app/eval/abc123',
        wantsToShare: true,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: { total: 0 },
        successes: 5,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).toContain('✓ Eval complete: https://promptfoo.app/eval/abc123');
      expect(output).not.toContain('eval-789');
    });

    it('should say "Red team complete" for red team evals', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-rt-1',
        isRedteam: true,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: { total: 0 },
        successes: 10,
        failures: 2,
        errors: 0,
        duration: 8000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).toContain('✓ Red team complete');
      expect(output).not.toContain('Eval complete');
    });
  });

  describe('token usage', () => {
    it('should display eval tokens correctly', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-123',
        isRedteam: false,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: {
          total: 1000,
          prompt: 400,
          completion: 600,
          cached: 0,
        },
        successes: 5,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).toContain('Tokens:');
      expect(output).toContain('Eval: 1,000 (400 prompt, 600 completion)');
    });

    it('should display grading tokens only when no eval tokens (critical bug fix)', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-grading-only',
        isRedteam: false,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: {
          total: 0,
          assertions: {
            total: 500,
            prompt: 200,
            completion: 300,
            cached: 0,
          },
        },
        successes: 5,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).toContain('Tokens:');
      expect(output).toContain('Grading: 500 (200 prompt, 300 completion)');
      expect(output).not.toContain('Eval:');
    });

    it('should display both eval and grading tokens', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-both',
        isRedteam: false,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: {
          total: 1000,
          prompt: 400,
          completion: 600,
          assertions: {
            total: 500,
            prompt: 200,
            completion: 300,
          },
        },
        successes: 5,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).toContain('Tokens:');
      expect(output).toContain('Eval: 1,000 (400 prompt, 600 completion)');
      expect(output).toContain('Grading: 500 (200 prompt, 300 completion)');
    });

    it('should show 100% cached correctly', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-cached',
        isRedteam: false,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: {
          total: 1000,
          cached: 1000,
        },
        successes: 5,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).toContain('Tokens:');
      expect(output).toContain('Eval: 1,000 (cached)');
    });

    it('should show partial cached tokens', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-partial-cache',
        isRedteam: false,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: {
          total: 1000,
          prompt: 400,
          completion: 600,
          cached: 200,
        },
        successes: 5,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).toContain('Eval: 1,000 (400 prompt, 600 completion, 200 cached)');
    });

    it('should not show token section when no tokens', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-no-tokens',
        isRedteam: false,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: { total: 0 },
        successes: 5,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).not.toContain('Tokens:');
    });
  });

  describe('provider breakdown', () => {
    it('should show provider breakdown with request counts', () => {
      mockTracker.getProviderIds.mockReturnValue(['openai:gpt-4', 'anthropic:claude-3']);
      mockTracker.getProviderUsage.mockImplementation((id: string) => {
        if (id === 'openai:gpt-4') {
          return {
            total: 1500,
            prompt: 600,
            completion: 900,
            cached: 0,
            numRequests: 5,
          };
        }
        if (id === 'anthropic:claude-3') {
          return {
            total: 800,
            prompt: 300,
            completion: 500,
            cached: 0,
            numRequests: 3,
          };
        }
        return undefined;
      });

      const params: EvalSummaryParams = {
        evalId: 'eval-providers',
        isRedteam: false,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: { total: 2300 },
        successes: 8,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).toContain('Providers:');
      expect(output).toContain('openai:gpt-4');
      expect(output).toContain('1,500 (5 requests; 600 prompt, 900 completion)');
      expect(output).toContain('anthropic:claude-3');
      expect(output).toContain('800 (3 requests; 300 prompt, 500 completion)');
    });

    it('should always show request count even when 0', () => {
      mockTracker.getProviderIds.mockReturnValue(['openai:gpt-4', 'anthropic:claude-3']);
      mockTracker.getProviderUsage.mockImplementation((id: string) => {
        if (id === 'openai:gpt-4') {
          return {
            total: 1000,
            cached: 1000,
            numRequests: 0,
          };
        }
        if (id === 'anthropic:claude-3') {
          return {
            total: 500,
            prompt: 200,
            completion: 300,
            numRequests: 2,
          };
        }
        return undefined;
      });

      const params: EvalSummaryParams = {
        evalId: 'eval-zero-requests',
        isRedteam: false,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: { total: 1500 },
        successes: 5,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).toContain('Providers:');
      expect(output).toContain('openai:gpt-4: 1,000 (0 requests; cached)');
      expect(output).toContain('anthropic:claude-3: 500 (2 requests; 200 prompt, 300 completion)');
    });
  });

  describe('pass rate and results', () => {
    it('should show 100% pass rate in green', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-100',
        isRedteam: false,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: { total: 0 },
        successes: 10,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const plainOutput = stripAnsi(lines.join('\n'));

      expect(plainOutput).toContain('Results:');
      expect(plainOutput).toContain('10 passed');
      expect(plainOutput).toContain('0 failed');
      expect(plainOutput).toContain('0 errors');
      expect(plainOutput).toContain('(100%)');
    });

    it('should show 80%+ pass rate in yellow', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-85',
        isRedteam: false,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: { total: 0 },
        successes: 17,
        failures: 3,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const plainOutput = stripAnsi(lines.join('\n'));

      expect(plainOutput).toContain('Results:');
      expect(plainOutput).toContain('17 passed');
      expect(plainOutput).toContain('3 failed');
      expect(plainOutput).toContain('(85.00%)');
    });

    it('should show <80% pass rate in red', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-50',
        isRedteam: false,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: { total: 0 },
        successes: 5,
        failures: 5,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const plainOutput = stripAnsi(lines.join('\n'));

      expect(plainOutput).toContain('Results:');
      expect(plainOutput).toContain('5 passed');
      expect(plainOutput).toContain('5 failed');
      expect(plainOutput).toContain('(50.00%)');
    });

    it('should include errors in results', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-errors',
        isRedteam: false,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: { total: 0 },
        successes: 8,
        failures: 1,
        errors: 1,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const plainOutput = stripAnsi(lines.join('\n'));

      expect(plainOutput).toContain('Results:');
      expect(plainOutput).toContain('8 passed');
      expect(plainOutput).toContain('1 failed');
      expect(plainOutput).toContain('1 error');
      expect(plainOutput).not.toContain('1 errors');
      expect(plainOutput).toContain('(80.00%)');
    });
  });

  describe('guidance messages', () => {
    it('should show guidance when writing to database without shareable URL', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-view',
        isRedteam: false,
        writeToDatabase: true,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: { total: 0 },
        successes: 5,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).toContain('» View results: promptfoo view');
      expect(output).toContain('» Share with your team: https://promptfoo.app');
      expect(output).toContain('» Feedback: https://promptfoo.dev/feedback');
    });

    it('should show share guidance with cloud enabled', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-share-cloud',
        isRedteam: false,
        writeToDatabase: true,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: true,
        tokenUsage: { total: 0 },
        successes: 5,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).toContain('» View results: promptfoo view');
      expect(output).toContain('» Create shareable URL: promptfoo share');
      expect(output).not.toContain('https://promptfoo.app');
    });

    it('should NOT show share guidance when explicitly disabled (--no-share)', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-no-share',
        isRedteam: false,
        writeToDatabase: true,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: true,
        cloudEnabled: false,
        tokenUsage: { total: 0 },
        successes: 5,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).toContain('» View results: promptfoo view');
      expect(output).not.toContain('» Share with your team');
      expect(output).not.toContain('» Create shareable URL');
    });

    it('should NOT show guidance when not writing to database', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-no-write',
        isRedteam: false,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: { total: 0 },
        successes: 5,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).not.toContain('» View results:');
      expect(output).not.toContain('» Share');
      expect(output).not.toContain('» Feedback:');
    });

    it('should NOT show guidance when shareable URL is present', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-with-url',
        isRedteam: false,
        writeToDatabase: true,
        shareableUrl: 'https://promptfoo.app/eval/abc123',
        wantsToShare: true,
        hasExplicitDisable: false,
        cloudEnabled: true,
        tokenUsage: { total: 0 },
        successes: 5,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).not.toContain('» View results:');
      expect(output).not.toContain('» Share');
      expect(output).not.toContain('» Feedback:');
    });
  });

  describe('performance metrics', () => {
    it('should show duration and concurrency', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-perf',
        isRedteam: false,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: { total: 0 },
        successes: 5,
        failures: 0,
        errors: 0,
        duration: 125, // 125 seconds = 2m 5s
        maxConcurrency: 8,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      expect(output).toContain('Duration:');
      expect(output).toContain('(concurrency: 8)');
    });
  });

  describe('edge cases', () => {
    it('should use singular "error" when there is exactly 1 error', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-singular-error',
        isRedteam: false,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: { total: 0 },
        successes: 5,
        failures: 0,
        errors: 1,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const plainOutput = stripAnsi(lines.join('\n'));

      expect(plainOutput).toContain('1 error');
      expect(plainOutput).not.toContain('1 errors');
    });

    it('should use plural "errors" when there are multiple errors', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-plural-errors',
        isRedteam: false,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: { total: 0 },
        successes: 5,
        failures: 0,
        errors: 3,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const plainOutput = stripAnsi(lines.join('\n'));

      expect(plainOutput).toContain('3 errors');
    });

    it('should use plural "errors" when there are 0 errors', () => {
      const params: EvalSummaryParams = {
        evalId: 'eval-zero-errors',
        isRedteam: false,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: { total: 0 },
        successes: 5,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      const lines = generateEvalSummary(params);
      const plainOutput = stripAnsi(lines.join('\n'));

      expect(plainOutput).toContain('0 errors');
    });

    it('should handle provider returning undefined usage gracefully', () => {
      mockTracker.getProviderIds.mockReturnValue([
        'openai:gpt-4',
        'missing-provider',
        'anthropic:claude-3',
      ]);
      mockTracker.getProviderUsage.mockImplementation((id: string) => {
        if (id === 'openai:gpt-4') {
          return {
            total: 1000,
            prompt: 400,
            completion: 600,
            numRequests: 5,
          };
        }
        if (id === 'missing-provider') {
          return undefined; // Simulates a provider that returns undefined
        }
        if (id === 'anthropic:claude-3') {
          return {
            total: 500,
            prompt: 200,
            completion: 300,
            numRequests: 3,
          };
        }
        return undefined;
      });

      const params: EvalSummaryParams = {
        evalId: 'eval-undefined-provider',
        isRedteam: false,
        writeToDatabase: false,
        shareableUrl: null,
        wantsToShare: false,
        hasExplicitDisable: false,
        cloudEnabled: false,
        tokenUsage: { total: 1500 },
        successes: 8,
        failures: 0,
        errors: 0,
        duration: 5000,
        maxConcurrency: 4,
        tracker: mockTracker,
      };

      // Should not throw
      const lines = generateEvalSummary(params);
      const output = stripAnsi(lines.join('\n'));

      // Should show the providers that have valid usage
      expect(output).toContain('Providers:');
      expect(output).toContain('openai:gpt-4');
      expect(output).toContain('anthropic:claude-3');
      // Should NOT show the missing provider
      expect(output).not.toContain('missing-provider');
    });
  });
});
