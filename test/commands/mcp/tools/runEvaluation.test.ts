import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before importing the module
vi.mock('../../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../../src/util/config/default', () => ({
  loadDefaultConfig: vi.fn().mockResolvedValue({
    defaultConfig: {},
    defaultConfigPath: 'promptfooconfig.yaml',
  }),
}));

vi.mock('../../../../src/util/config/load', () => ({
  resolveConfigs: vi.fn().mockResolvedValue({
    config: {},
    testSuite: {
      prompts: [{ label: 'test-prompt', raw: 'What is 2+2?' }],
      providers: [{ id: 'test-provider' }],
      tests: [{ vars: { input: 'test' } }],
    },
  }),
}));

vi.mock('../../../../src/commands/eval', () => ({
  doEval: vi.fn().mockResolvedValue({
    id: 'test-eval-123',
    toEvaluateSummary: vi.fn().mockResolvedValue({
      version: 3,
      stats: { successes: 1, failures: 0, errors: 0 },
      results: [
        {
          testCase: { description: 'test case 1', assert: [] },
          vars: { input: 'test' },
          prompt: { label: 'test-prompt', raw: 'What is 2+2?' },
          provider: { id: 'test-provider', label: 'Test Provider' },
          response: { output: 'The answer is 4' },
          success: true,
          score: 1,
          namedScores: {},
          tokenUsage: { total: 10 },
          cost: 0.001,
          latencyMs: 100,
        },
      ],
      prompts: [{ label: 'test-prompt', provider: 'test-provider', metrics: {} }],
    }),
  }),
}));

describe('runEvaluation tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('result formatting', () => {
    it('should use shared formatter for pagination', async () => {
      const { formatEvaluationResults } = await import(
        '../../../../src/commands/mcp/lib/resultFormatter'
      );

      const mockSummary = {
        version: 3,
        stats: { successes: 5, failures: 2, errors: 0 },
        results: Array.from({ length: 10 }, (_, i) => ({
          testCase: { description: `test case ${i}`, assert: [] },
          vars: { index: i },
          prompt: { label: 'test', raw: 'prompt text' },
          provider: { id: 'provider', label: 'Provider' },
          response: { output: `response ${i}` },
          success: i < 5,
          score: i < 5 ? 1 : 0,
          namedScores: {},
          cost: 0.001,
          latencyMs: 100,
        })),
        prompts: [],
      };

      // Test default pagination
      const result = formatEvaluationResults(mockSummary as any);
      expect(result.pagination.totalResults).toBe(10);
      expect(result.pagination.limit).toBe(20);
      expect(result.pagination.offset).toBe(0);
      expect(result.pagination.hasMore).toBe(false);
      expect(result.results.length).toBe(10);
    });

    it('should respect custom pagination options', async () => {
      const { formatEvaluationResults } = await import(
        '../../../../src/commands/mcp/lib/resultFormatter'
      );

      const mockSummary = {
        version: 3,
        stats: { successes: 100, failures: 0, errors: 0 },
        results: Array.from({ length: 100 }, (_, i) => ({
          testCase: { description: `test case ${i}`, assert: [] },
          vars: { index: i },
          prompt: { label: 'test', raw: 'prompt text' },
          provider: { id: 'provider', label: 'Provider' },
          response: { output: `response ${i}` },
          success: true,
          score: 1,
          namedScores: {},
          cost: 0.001,
          latencyMs: 100,
        })),
        prompts: [],
      };

      // Test custom limit and offset
      const result = formatEvaluationResults(mockSummary as any, {
        resultLimit: 10,
        resultOffset: 20,
      });
      expect(result.pagination.totalResults).toBe(100);
      expect(result.pagination.limit).toBe(10);
      expect(result.pagination.offset).toBe(20);
      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.returnedCount).toBe(10);
      expect(result.results.length).toBe(10);
      expect(result.results[0].index).toBe(20);
    });

    it('should limit results to max 100', async () => {
      const { formatEvaluationResults } = await import(
        '../../../../src/commands/mcp/lib/resultFormatter'
      );

      const mockSummary = {
        version: 3,
        stats: { successes: 200, failures: 0, errors: 0 },
        results: Array.from({ length: 200 }, (_, i) => ({
          testCase: { description: `test case ${i}`, assert: [] },
          vars: { index: i },
          prompt: { label: 'test', raw: 'prompt text' },
          provider: { id: 'provider', label: 'Provider' },
          response: { output: `response ${i}` },
          success: true,
          score: 1,
          namedScores: {},
          cost: 0.001,
          latencyMs: 100,
        })),
        prompts: [],
      };

      // Even if requesting 200, should cap at 100
      const result = formatEvaluationResults(mockSummary as any, {
        resultLimit: 200,
      });
      expect(result.pagination.limit).toBe(100);
      expect(result.results.length).toBe(100);
    });

    it('should truncate long text fields', async () => {
      const { formatEvaluationResults } = await import(
        '../../../../src/commands/mcp/lib/resultFormatter'
      );

      const longText = 'x'.repeat(500);
      const mockSummary = {
        version: 3,
        stats: { successes: 1, failures: 0, errors: 0 },
        results: [
          {
            testCase: { description: 'test', assert: [] },
            vars: {},
            prompt: { label: 'test', raw: longText },
            provider: { id: 'provider', label: 'Provider' },
            response: { output: longText },
            success: true,
            score: 1,
            namedScores: {},
          },
        ],
        prompts: [],
      };

      const result = formatEvaluationResults(mockSummary as any);
      expect(result.results[0].prompt.raw.length).toBeLessThan(200);
      expect(result.results[0].prompt.raw).toContain('...');
      expect(result.results[0].response.output!.length).toBeLessThan(300);
      expect(result.results[0].response.output).toContain('...');
    });
  });

  describe('prompts summary formatting', () => {
    it('should format prompts summary for version 3', async () => {
      const { formatPromptsSummary } = await import(
        '../../../../src/commands/mcp/lib/resultFormatter'
      );

      const mockSummary = {
        version: 3,
        stats: { successes: 1, failures: 0, errors: 0 },
        results: [],
        prompts: [
          { label: 'prompt1', provider: 'openai', metrics: { avgScore: 0.95 } },
          { label: 'prompt2', provider: 'anthropic', metrics: { avgScore: 0.88 } },
        ],
      };

      const result = formatPromptsSummary(mockSummary as any);
      expect(result.length).toBe(2);
      expect(result[0].label).toBe('prompt1');
      expect(result[0].provider).toBe('openai');
      expect(result[0].metrics).toEqual({ avgScore: 0.95 });
    });

    it('should return empty array for non-version 3 summaries', async () => {
      const { formatPromptsSummary } = await import(
        '../../../../src/commands/mcp/lib/resultFormatter'
      );

      const mockSummary = {
        version: 2,
        stats: { successes: 1, failures: 0, errors: 0 },
        results: [],
      };

      const result = formatPromptsSummary(mockSummary as any);
      expect(result).toEqual([]);
    });
  });

  describe('promptFilter validation', () => {
    it('should error on mixed numeric and non-numeric filters', async () => {
      const { registerRunEvaluationTool } = await import(
        '../../../../src/commands/mcp/tools/runEvaluation'
      );

      let toolHandler: any;
      const mockServer = {
        tool: vi.fn((_name, _schema, handler) => {
          toolHandler = handler;
        }),
      } as any;

      registerRunEvaluationTool(mockServer);

      const result = await toolHandler({
        configPath: 'test.yaml',
        promptFilter: ['0', 'morning.*'],
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Cannot mix numeric indices and regex patterns');
    });

    it('should return error when all prompts are filtered out', async () => {
      const { resolveConfigs } = await import('../../../../src/util/config/load');

      vi.mocked(resolveConfigs).mockResolvedValueOnce({
        config: {},
        testSuite: {
          prompts: [{ label: 'test-prompt', raw: 'test' }],
          providers: [{ id: 'test-provider' }],
          tests: [{ vars: { input: 'test' } }],
        },
      } as any);

      const { registerRunEvaluationTool } = await import(
        '../../../../src/commands/mcp/tools/runEvaluation'
      );

      let toolHandler: any;
      registerRunEvaluationTool({
        tool: vi.fn((_name, _schema, handler) => {
          toolHandler = handler;
        }),
      } as any);

      const result = await toolHandler({
        configPath: 'test.yaml',
        promptFilter: 'nonexistent.*',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No prompts found after applying filter');
    });
  });
});
