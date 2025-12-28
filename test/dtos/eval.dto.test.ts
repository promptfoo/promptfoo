import { describe, expect, it } from 'vitest';
import {
  TokenUsageSchema,
  ResultSuggestionSchema,
  AssertionValueSchema,
  AssertionProviderSchema,
  GradingResultSchema,
  PromptMetricsSchema,
  EvalJobStatusSchema,
  EvalResultsFilterModeSchema,
  GetJobCompleteResponseSchema,
  GetJobErrorResponseSchema,
  GetJobInProgressResponseSchema,
  GetJobResponseSchema,
  UpdateEvalRequestSchema,
  UpdateAuthorRequestSchema,
  GetTableQuerySchema,
  EvalResultItemSchema,
  AddResultsRequestSchema,
  CreateEvalRequestV3Schema,
  CreateEvalRequestV4Schema,
  CreateEvalRequestSchema,
  ReplayRequestSchema,
  ReplayResponseSchema,
  CopyEvalRequestSchema,
  CopyEvalResponseSchema,
  BulkDeleteEvalsRequestSchema,
  ShareResultsRequestSchema,
  ShareResultsResponseSchema,
  CheckShareDomainQuerySchema,
  CheckShareDomainResponseSchema,
} from '../../src/dtos/eval.dto';

describe('Eval DTOs', () => {
  describe('TokenUsageSchema', () => {
    it('should validate minimal token usage', () => {
      const usage = {};
      expect(TokenUsageSchema.parse(usage)).toEqual({});
    });

    it('should validate full token usage', () => {
      const usage = {
        prompt: 100,
        completion: 50,
        cached: 10,
        total: 160,
        numRequests: 1,
        completionDetails: {
          reasoning: 20,
          acceptedPrediction: 5,
          rejectedPrediction: 2,
        },
        assertions: {
          total: 30,
          prompt: 20,
          completion: 10,
        },
      };
      expect(TokenUsageSchema.parse(usage)).toEqual(usage);
    });
  });

  describe('AssertionValueSchema', () => {
    it('should accept string', () => {
      expect(AssertionValueSchema.parse('test')).toBe('test');
    });

    it('should accept string array', () => {
      expect(AssertionValueSchema.parse(['a', 'b'])).toEqual(['a', 'b']);
    });

    it('should accept number', () => {
      expect(AssertionValueSchema.parse(42)).toBe(42);
    });

    it('should accept boolean', () => {
      expect(AssertionValueSchema.parse(true)).toBe(true);
    });

    it('should accept object', () => {
      expect(AssertionValueSchema.parse({ key: 'value' })).toEqual({ key: 'value' });
    });
  });

  describe('AssertionProviderSchema', () => {
    it('should accept string provider ID', () => {
      expect(AssertionProviderSchema.parse('openai:gpt-4')).toBe('openai:gpt-4');
    });

    it('should accept provider object', () => {
      const provider = {
        id: 'openai:gpt-4',
        label: 'GPT-4',
        config: { temperature: 0.7 },
      };
      expect(AssertionProviderSchema.parse(provider)).toEqual(provider);
    });
  });

  describe('GradingResultSchema', () => {
    it('should validate minimal grading result', () => {
      const result = {
        pass: true,
        score: 1.0,
        reason: 'Test passed',
      };
      expect(GradingResultSchema.parse(result)).toMatchObject(result);
    });

    it('should validate grading result with nested components', () => {
      const result = {
        pass: true,
        score: 0.8,
        reason: 'Partial pass',
        namedScores: { relevance: 0.9, accuracy: 0.7 },
        componentResults: [
          { pass: true, score: 1.0, reason: 'Component 1 passed' },
          { pass: false, score: 0.6, reason: 'Component 2 failed' },
        ],
        assertion: {
          type: 'contains',
          value: 'expected text',
          weight: 1.5,
        },
      };
      expect(GradingResultSchema.parse(result)).toMatchObject(result);
    });
  });

  describe('EvalJobStatusSchema', () => {
    it('should accept valid statuses', () => {
      expect(EvalJobStatusSchema.parse('in-progress')).toBe('in-progress');
      expect(EvalJobStatusSchema.parse('complete')).toBe('complete');
      expect(EvalJobStatusSchema.parse('error')).toBe('error');
    });

    it('should reject invalid status', () => {
      expect(() => EvalJobStatusSchema.parse('pending')).toThrow();
    });
  });

  describe('GetJobResponseSchema (discriminated union)', () => {
    it('should parse complete response', () => {
      const response = {
        status: 'complete' as const,
        result: { summary: 'data' },
        evalId: 'eval-123',
        logs: ['log1', 'log2'],
      };
      const parsed = GetJobResponseSchema.parse(response);
      expect(parsed.status).toBe('complete');
      if (parsed.status === 'complete') {
        expect(parsed.evalId).toBe('eval-123');
        expect(parsed.result).toEqual({ summary: 'data' });
      }
    });

    it('should parse error response', () => {
      const response = {
        status: 'error' as const,
        logs: ['Error occurred'],
      };
      const parsed = GetJobResponseSchema.parse(response);
      expect(parsed.status).toBe('error');
    });

    it('should parse in-progress response', () => {
      const response = {
        status: 'in-progress' as const,
        progress: 50,
        total: 100,
        logs: ['Processing...'],
      };
      const parsed = GetJobResponseSchema.parse(response);
      expect(parsed.status).toBe('in-progress');
      if (parsed.status === 'in-progress') {
        expect(parsed.progress).toBe(50);
        expect(parsed.total).toBe(100);
      }
    });
  });

  describe('GetTableQuerySchema', () => {
    it('should parse with defaults', () => {
      const result = GetTableQuerySchema.parse({});
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
      expect(result.filterMode).toBe('all');
      expect(result.search).toBe('');
      expect(result.filter).toEqual([]);
      expect(result.comparisonEvalIds).toEqual([]);
    });

    it('should coerce string to number for limit/offset', () => {
      const result = GetTableQuerySchema.parse({ limit: '25', offset: '10' });
      expect(result.limit).toBe(25);
      expect(result.offset).toBe(10);
    });

    it('should transform single filter to array', () => {
      const result = GetTableQuerySchema.parse({ filter: 'plugin:harmful' });
      expect(result.filter).toEqual(['plugin:harmful']);
    });

    it('should accept filter array', () => {
      const result = GetTableQuerySchema.parse({ filter: ['plugin:harmful', 'strategy:jailbreak'] });
      expect(result.filter).toEqual(['plugin:harmful', 'strategy:jailbreak']);
    });
  });

  describe('EvalResultItemSchema', () => {
    it('should validate minimal result item', () => {
      const item = {
        id: 'result-123',
        promptIdx: 0,
        testIdx: 0,
        testCase: {},
        prompt: {},
        provider: { id: 'openai:gpt-4' },
        success: true,
        score: 1.0,
      };
      const result = EvalResultItemSchema.parse(item);
      expect(result.id).toBe('result-123');
      expect(result.failureReason).toBe(0); // default
    });

    it('should validate full result item', () => {
      const item = {
        id: 'result-123',
        promptIdx: 1,
        testIdx: 2,
        testCase: { vars: { input: 'test' } },
        prompt: { raw: 'Hello {{input}}' },
        promptId: 'prompt-456',
        provider: {
          id: 'openai:gpt-4',
          label: 'GPT-4',
          config: { temperature: 0.5 },
        },
        latencyMs: 1500,
        cost: 0.003,
        response: { output: 'Hello test' },
        error: null,
        failureReason: 0,
        success: true,
        score: 1.0,
        gradingResult: {
          pass: true,
          score: 1.0,
          reason: 'Correct',
        },
        namedScores: { accuracy: 1.0 },
        metadata: { custom: 'data' },
      };
      expect(EvalResultItemSchema.parse(item)).toMatchObject(item);
    });

    it('should reject missing required fields', () => {
      const item = { id: 'result-123' };
      expect(() => EvalResultItemSchema.parse(item)).toThrow();
    });
  });

  describe('CreateEvalRequestSchema', () => {
    it('should accept V3 format', () => {
      const v3Request = {
        data: {
          results: { prompts: [] },
          config: { description: 'test' },
        },
      };
      expect(() => CreateEvalRequestSchema.parse(v3Request)).not.toThrow();
    });

    it('should accept V4 format', () => {
      const v4Request = {
        config: { description: 'test' },
        createdAt: Date.now(),
        results: [
          {
            id: 'r1',
            promptIdx: 0,
            testIdx: 0,
            testCase: {},
            prompt: {},
            provider: { id: 'test' },
            success: true,
            score: 1,
          },
        ],
      };
      expect(() => CreateEvalRequestSchema.parse(v4Request)).not.toThrow();
    });
  });

  describe('ReplayRequestSchema', () => {
    it('should validate replay request', () => {
      const request = {
        evaluationId: 'eval-123',
        testIndex: 0,
        prompt: 'Hello world',
        variables: { name: 'test' },
      };
      expect(ReplayRequestSchema.parse(request)).toEqual(request);
    });

    it('should require evaluationId and prompt', () => {
      expect(() => ReplayRequestSchema.parse({ prompt: 'test' })).toThrow();
      expect(() => ReplayRequestSchema.parse({ evaluationId: 'eval-123' })).toThrow();
    });
  });

  describe('ShareResultsSchemas', () => {
    it('should validate share request', () => {
      expect(ShareResultsRequestSchema.parse({ id: 'eval-123' })).toEqual({ id: 'eval-123' });
    });

    it('should validate share response', () => {
      expect(ShareResultsResponseSchema.parse({ url: 'https://example.com/share/123' })).toEqual({
        url: 'https://example.com/share/123',
      });
    });

    it('should validate check domain query', () => {
      expect(CheckShareDomainQuerySchema.parse({ id: 'eval-123' })).toEqual({ id: 'eval-123' });
    });

    it('should validate check domain response', () => {
      const response = {
        domain: 'cloud.promptfoo.dev',
        isCloudEnabled: true,
      };
      expect(CheckShareDomainResponseSchema.parse(response)).toEqual(response);
    });
  });

  describe('BulkDeleteEvalsRequestSchema', () => {
    it('should validate array of IDs', () => {
      const request = { ids: ['eval-1', 'eval-2', 'eval-3'] };
      expect(BulkDeleteEvalsRequestSchema.parse(request)).toEqual(request);
    });

    it('should accept empty array', () => {
      expect(BulkDeleteEvalsRequestSchema.parse({ ids: [] })).toEqual({ ids: [] });
    });
  });

  describe('CopyEvalSchemas', () => {
    it('should validate copy request with optional description', () => {
      expect(CopyEvalRequestSchema.parse({})).toEqual({});
      expect(CopyEvalRequestSchema.parse({ description: 'Copy of eval' })).toEqual({
        description: 'Copy of eval',
      });
    });

    it('should validate copy response', () => {
      const response = { id: 'new-eval-123', distinctTestCount: 42 };
      expect(CopyEvalResponseSchema.parse(response)).toEqual(response);
    });
  });
});
