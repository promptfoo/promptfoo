import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertionUsesTrace, runAssertion, runAssertions } from '../../src/assertions/index';
import cliState from '../../src/cliState';
import { RedteamGraderBase } from '../../src/redteam/plugins/base';
import { withProviderCallTracingContext } from '../../src/scheduler/providerCallExecutionContext';
import { getTraceStore } from '../../src/tracing/store';
import { mockProcessEnv } from '../util/utils';

import type {
  Assertion,
  AtomicTestCase,
  GradingResult,
  ProviderResponse,
} from '../../src/types/index';
import type { TraceData } from '../../src/types/tracing';

// Mock the trace store
vi.mock('../../src/tracing/store');

// Mock Python execution
vi.mock('../../src/python/wrapper', () => ({
  runPythonCode: vi.fn((code: string, _functionName: string, args: any[]) => {
    // Simple Python interpreter mock for our test cases
    const [_output, context] = args;

    // Handle the specific test cases
    if (code.includes("len(context.trace['spans']) == 2")) {
      return context.trace && context.trace.spans && context.trace.spans.length === 2;
    }

    if (code.includes('root_spans') && code.includes('leaf_spans')) {
      const trace = context.trace;
      if (!trace) {
        return false;
      }
      const rootSpans = trace.spans.filter((s: any) => !s.parentSpanId);
      const leafSpans = trace.spans.filter((s: any) => s.parentSpanId);
      return rootSpans.length === 1 && leafSpans.length === 1;
    }

    if (code.includes('avg_duration')) {
      const trace = context.trace;
      if (!trace) {
        return false;
      }
      const durations = trace.spans
        .filter((s: any) => s.endTime)
        .map((s: any) => s.endTime - s.startTime);
      const avgDuration = durations.reduce((a: number, b: number) => a + b, 0) / durations.length;
      return {
        pass: true,
        score: 0.9,
        reason: `Average span duration: ${avgDuration}ms`,
      };
    }

    return false;
  }),
}));

describe('trace assertions', () => {
  const originalBasePath = cliState.basePath;
  const originalConfig = cliState.config;
  const originalTraceFetchEnv = {
    PROMPTFOO_TRACE_FETCH_MAX_ATTEMPTS: process.env.PROMPTFOO_TRACE_FETCH_MAX_ATTEMPTS,
    PROMPTFOO_TRACE_FETCH_RETRY_DELAY_MS: process.env.PROMPTFOO_TRACE_FETCH_RETRY_DELAY_MS,
    PROMPTFOO_TRACE_FETCH_STABLE_POLLS: process.env.PROMPTFOO_TRACE_FETCH_STABLE_POLLS,
  };
  const mockTraceStore = {
    getTrace: vi.fn(),
  };

  const restoreTraceFetchEnv = () => {
    for (const [name, value] of Object.entries(originalTraceFetchEnv)) {
      if (value === undefined) {
        mockProcessEnv({ [name]: undefined });
      } else {
        mockProcessEnv({ [name]: value });
      }
    }
  };

  beforeEach(() => {
    mockTraceStore.getTrace.mockReset();
    vi.clearAllMocks();
    restoreTraceFetchEnv();
    mockProcessEnv({ PROMPTFOO_TRACE_FETCH_RETRY_DELAY_MS: '0' });
    mockProcessEnv({ PROMPTFOO_TRACE_FETCH_STABLE_POLLS: '1' });
    vi.mocked(getTraceStore).mockReturnValue(
      mockTraceStore as unknown as ReturnType<typeof getTraceStore>,
    );
  });

  afterEach(() => {
    cliState.basePath = originalBasePath;
    cliState.config = originalConfig;
    restoreTraceFetchEnv();
    vi.resetAllMocks();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const mockTest: AtomicTestCase = {
    vars: { test: 'value' },
  };

  const mockProviderResponse: ProviderResponse = {
    output: 'Test output',
  };

  const mockTraceData: TraceData = {
    traceId: 'test-trace-id',
    evaluationId: 'test-evaluation-id',
    testCaseId: 'test-test-case-id',
    metadata: { test: 'value' },
    spans: [
      {
        spanId: 'span-1',
        name: 'http.request',
        startTime: 1000,
        endTime: 1500,
        attributes: { 'http.method': 'GET' },
        statusCode: 200,
      },
      {
        spanId: 'span-2',
        parentSpanId: 'span-1',
        name: 'api.call',
        startTime: 1100,
        endTime: 1400,
        attributes: { 'api.name': 'test-api' },
      },
    ],
  };

  it('passes captured trace evidence to the SQL injection grader', async () => {
    mockTraceStore.getTrace.mockResolvedValue(mockTraceData);
    const grade = vi.spyOn(RedteamGraderBase.prototype, 'getResult').mockResolvedValue({
      grade: { pass: true, score: 1, reason: 'Fixture verdict' },
      rubric: 'Fixture rubric',
    });

    await runAssertion({
      assertion: { type: 'promptfoo:redteam:sql-injection' },
      prompt: 'Perform the requested action.',
      test: { metadata: { purpose: 'Fixture assistant' } },
      providerResponse: mockProviderResponse,
      traceId: 'test-trace-id',
    });

    expect(grade).toHaveBeenCalledOnce();
    expect(grade.mock.calls[0]?.[7]).toMatchObject({
      traceData: mockTraceData,
      traceSummary: expect.stringContaining('http.request'),
    });
  });

  it.each([false, true])(
    'includes SQL outcomes without rows or bind values (redact query: %s)',
    async (redactQuery) => {
      if (redactQuery) {
        cliState.config = {
          ...originalConfig,
          tracing: {
            enabled: false,
            otlp: {
              http: {
                enabled: false,
                port: 4318,
                host: '127.0.0.1',
                acceptFormats: ['json'],
                redactAttributes: ['query'],
              },
            },
          },
        };
      }
      const queries = [
        'SELECT id FROM records WHERE owner_id = ?',
        'SELECT id FROM records WHERE owner_id = ? OR 1=1',
      ];
      mockTraceStore.getTrace.mockResolvedValue({
        ...mockTraceData,
        spans: queries.map((query, index) => ({
          spanId: `sql-${index}`,
          name: 'execute_tool query_database',
          startTime: index,
          statusCode: 1,
          attributes: {
            'gen_ai.tool.name': 'query_database',
            'tool.arguments': JSON.stringify({ query, parameters: ['PRIVATE_BIND_VALUE'] }),
            'tool.output': JSON.stringify({
              authorized: index === 0,
              rowCount: index + 1,
              rows: ['PRIVATE_ROW_DATA'],
            }),
            authorization: 'PRIVATE_AUTH_TOKEN',
          },
        })),
      });
      const grade = vi.spyOn(RedteamGraderBase.prototype, 'getResult').mockResolvedValue({
        grade: { pass: false, score: 0, reason: 'Unauthorized query' },
        rubric: 'Fixture rubric',
      });
      await runAssertion({
        assertion: { type: 'promptfoo:redteam:sql-injection' },
        prompt: 'Perform the requested action.',
        test: { metadata: { purpose: 'Only return records belonging to the authenticated user.' } },
        providerResponse: { output: 'I cannot help with that.' },
        traceId: 'test-trace-id',
      });
      const summary = grade.mock.calls[0]?.[7]?.traceSummary;
      expect(summary).toBeDefined();
      const steps = JSON.parse(summary!).steps;
      expect(steps).toHaveLength(2);
      expect(steps.map((step: { sql: unknown }) => step.sql)).toEqual([
        { query: redactQuery ? '[REDACTED]' : queries[0], authorized: true, rowCount: 1 },
        { query: redactQuery ? '[REDACTED]' : queries[1], authorized: false, rowCount: 2 },
      ]);
      expect(summary).not.toMatch(/PRIVATE_/);
    },
  );

  it.each(['global', 'test', 'strategy'] as const)(
    'honors the SQL trace grading opt-out from %s configuration',
    async (source) => {
      const tracing = { includeInGrading: false };
      const test: AtomicTestCase = {
        assert: [{ type: 'promptfoo:redteam:sql-injection' }],
        metadata: {
          purpose: 'Fixture assistant',
          ...(source === 'test' ? { tracing } : {}),
          ...(source === 'strategy' ? { strategyConfig: { tracing } } : {}),
        },
      };
      if (source === 'global') {
        cliState.config = { ...originalConfig, redteam: { tracing } };
      }
      mockTraceStore.getTrace.mockResolvedValue(mockTraceData);
      const grade = vi.spyOn(RedteamGraderBase.prototype, 'getResult').mockResolvedValue({
        grade: { pass: true, score: 1, reason: 'Fixture verdict' },
        rubric: 'Fixture rubric',
      });
      await runAssertions({
        prompt: 'Perform the requested action.',
        test,
        providerResponse: mockProviderResponse,
        traceId: 'test-trace-id',
      });
      await runAssertion({
        prompt: 'Perform the requested action.',
        test,
        assertion: { type: 'promptfoo:redteam:sql-injection' },
        providerResponse: mockProviderResponse,
        traceId: 'test-trace-id',
      });
      expect(mockTraceStore.getTrace).not.toHaveBeenCalled();
      expect(grade).toHaveBeenCalledTimes(2);
      for (const call of grade.mock.calls) {
        expect(call[7]?.traceData).toBeUndefined();
        expect(call[7]?.traceSummary).toBeUndefined();
      }
    },
  );

  describe('javascript assertions with trace', () => {
    it('uses the evaluation tracing context for the grader test index', async () => {
      const graderSpan = vi.fn();
      const test: AtomicTestCase = {
        metadata: { evaluationId: 'test-evaluation-id' },
        vars: { input: 'ordinary user variable' },
      };

      await withProviderCallTracingContext(
        {
          getActiveTraceparent: () => undefined,
          testIndex: 5,
          withGraderSpan: async (options, invoke) => {
            graderSpan(options);
            return invoke();
          },
          withProviderSpan: async ({ callContext }, invoke) => invoke(callContext),
        },
        () =>
          runAssertion({
            assertion: { type: 'contains', value: 'Test' },
            test,
            providerResponse: mockProviderResponse,
            traceId: 'test-trace-id',
          }),
      );

      expect(graderSpan).toHaveBeenCalledWith({
        graderId: 'contains',
        evalId: 'test-evaluation-id',
        testIndex: 5,
      });
      expect(test.vars).toEqual({ input: 'ordinary user variable' });
    });

    it('should treat ruby assertions as trace-aware', () => {
      expect(
        assertionUsesTrace({
          type: 'ruby',
          value: 'context.trace && context.trace.spans.length > 0',
        }),
      ).toBe(true);
    });

    it('should pass trace data to javascript assertion', async () => {
      mockTraceStore.getTrace.mockResolvedValue(mockTraceData);

      const assertion: Assertion = {
        type: 'javascript',
        value: `
          if (!context.trace) return false;
          return context.trace.spans.length === 2 && 
                 context.trace.traceId === 'test-trace-id';
        `,
      };

      const result: GradingResult = await runAssertion({
        assertion,
        test: mockTest,
        providerResponse: mockProviderResponse,
        traceId: 'test-trace-id',
      });

      expect(result.pass).toBe(true);
      expect(mockTraceStore.getTrace).toHaveBeenCalledWith('test-trace-id', {
        sanitizeAttributes: false,
      });
    });

    it('should retry until trace spans are available', async () => {
      mockProcessEnv({ PROMPTFOO_TRACE_FETCH_MAX_ATTEMPTS: '3' });
      mockProcessEnv({ PROMPTFOO_TRACE_FETCH_RETRY_DELAY_MS: '0' });
      mockProcessEnv({ PROMPTFOO_TRACE_FETCH_STABLE_POLLS: '1' });

      mockTraceStore.getTrace
        .mockResolvedValueOnce({
          ...mockTraceData,
          spans: [],
        })
        .mockResolvedValueOnce(mockTraceData);

      const assertion: Assertion = {
        type: 'javascript',
        value: 'context.trace?.spans?.length === 2',
      };

      const result: GradingResult = await runAssertion({
        assertion,
        test: mockTest,
        providerResponse: mockProviderResponse,
        traceId: 'test-trace-id',
      });

      expect(result.pass).toBe(true);
      expect(mockTraceStore.getTrace).toHaveBeenCalledTimes(2);
    });

    it('should use default retry timing when trace fetch env vars are unset', async () => {
      mockProcessEnv({ PROMPTFOO_TRACE_FETCH_RETRY_DELAY_MS: undefined });
      mockProcessEnv({ PROMPTFOO_TRACE_FETCH_STABLE_POLLS: undefined });
      vi.useFakeTimers();

      mockTraceStore.getTrace.mockResolvedValue(mockTraceData);

      const resultPromise = runAssertion({
        assertion: {
          type: 'javascript',
          value: 'context.trace?.spans?.length === 2',
        },
        test: mockTest,
        providerResponse: mockProviderResponse,
        traceId: 'test-trace-id',
      });

      await vi.advanceTimersByTimeAsync(250);
      const result = await resultPromise;

      expect(result.pass).toBe(true);
      expect(mockTraceStore.getTrace).toHaveBeenCalledTimes(2);
    });

    it('should wait for span count to stabilize', async () => {
      mockProcessEnv({ PROMPTFOO_TRACE_FETCH_MAX_ATTEMPTS: '4' });
      mockProcessEnv({ PROMPTFOO_TRACE_FETCH_RETRY_DELAY_MS: '0' });
      mockProcessEnv({ PROMPTFOO_TRACE_FETCH_STABLE_POLLS: '2' });

      mockTraceStore.getTrace
        .mockResolvedValueOnce({
          ...mockTraceData,
          spans: [mockTraceData.spans[0]],
        })
        .mockResolvedValueOnce(mockTraceData)
        .mockResolvedValueOnce(mockTraceData);

      const assertion: Assertion = {
        type: 'javascript',
        value: 'context.trace?.spans?.length === 2',
      };

      const result: GradingResult = await runAssertion({
        assertion,
        test: mockTest,
        providerResponse: mockProviderResponse,
        traceId: 'test-trace-id',
      });

      expect(result.pass).toBe(true);
      expect(mockTraceStore.getTrace).toHaveBeenCalledTimes(3);
    });

    it('should handle missing trace gracefully', async () => {
      mockTraceStore.getTrace.mockResolvedValue(null);

      const assertion: Assertion = {
        type: 'javascript',
        value: 'context.trace === undefined',
      };

      const result: GradingResult = await runAssertion({
        assertion,
        test: mockTest,
        providerResponse: mockProviderResponse,
        traceId: 'non-existent-trace',
      });

      expect(result.pass).toBe(true);
    });

    it('should reuse a preloaded missing trace instead of retrying once per assertion', async () => {
      mockProcessEnv({ PROMPTFOO_TRACE_FETCH_MAX_ATTEMPTS: '2' });
      mockProcessEnv({ PROMPTFOO_TRACE_FETCH_RETRY_DELAY_MS: '0' });
      mockProcessEnv({ PROMPTFOO_TRACE_FETCH_STABLE_POLLS: '1' });

      mockTraceStore.getTrace.mockResolvedValue(null);

      const result = await runAssertions({
        test: {
          ...mockTest,
          assert: [
            {
              type: 'javascript',
              value: 'context.trace === undefined',
            },
            {
              type: 'javascript',
              value: 'context.trace === undefined',
            },
          ],
        },
        providerResponse: mockProviderResponse,
        traceId: 'non-existent-trace',
      });

      expect(result.pass).toBe(true);
      expect(mockTraceStore.getTrace).toHaveBeenCalledTimes(2);
    });

    it('should pass trace data to file:// scripts for non-trace assertion types', async () => {
      mockTraceStore.getTrace.mockResolvedValue(mockTraceData);
      cliState.basePath = path.resolve(__dirname, '../fixtures/file-script-assertions');

      const result: GradingResult = await runAssertion({
        assertion: {
          type: 'equals',
          value: 'file://rubric-generator.cjs:traceSpanName',
        },
        test: mockTest,
        providerResponse: {
          ...mockProviderResponse,
          output: 'http.request',
        },
        traceId: 'test-trace-id',
      });

      expect(result.pass).toBe(true);
    });

    it('should calculate trace duration correctly', async () => {
      mockTraceStore.getTrace.mockResolvedValue(mockTraceData);

      const assertion: Assertion = {
        type: 'javascript',
        value: `
          const duration = Math.max(...context.trace.spans.map(s => s.endTime || 0)) - 
                          Math.min(...context.trace.spans.map(s => s.startTime));
          return duration === 500; // 1500 - 1000
        `,
      };

      const result: GradingResult = await runAssertion({
        assertion,
        test: mockTest,
        providerResponse: mockProviderResponse,
        traceId: 'test-trace-id',
      });

      expect(result.pass).toBe(true);
    });

    it('should detect error spans', async () => {
      const traceWithError: TraceData = {
        traceId: 'error-trace',
        evaluationId: 'test-evaluation-id',
        testCaseId: 'test-test-case-id',
        metadata: { test: 'value' },
        spans: [
          ...mockTraceData.spans,
          {
            spanId: 'error-span',
            name: 'failed.request',
            startTime: 2000,
            endTime: 2100,
            statusCode: 500,
            statusMessage: 'Internal Server Error',
          },
        ],
      };
      mockTraceStore.getTrace.mockResolvedValue(traceWithError);

      const assertion: Assertion = {
        type: 'javascript',
        value: `
          const errorSpans = context.trace.spans.filter(s => s.statusCode >= 400);
          return errorSpans.length === 1 && errorSpans[0].statusCode === 500;
        `,
      };

      const result: GradingResult = await runAssertion({
        assertion,
        test: mockTest,
        providerResponse: mockProviderResponse,
        traceId: 'error-trace',
      });

      expect(result.pass).toBe(true);
    });

    it('should work without traceId', async () => {
      const assertion: Assertion = {
        type: 'javascript',
        value: 'context.trace === undefined && output === "Test output"',
      };

      const result: GradingResult = await runAssertion({
        assertion,
        test: mockTest,
        providerResponse: mockProviderResponse,
        // No traceId provided
      });

      expect(result.pass).toBe(true);
      expect(mockTraceStore.getTrace).not.toHaveBeenCalled();
    });
  });

  describe('python assertions with trace', () => {
    it('should pass trace data to python assertion', async () => {
      mockTraceStore.getTrace.mockResolvedValue(mockTraceData);

      const assertion: Assertion = {
        type: 'python',
        value: `
if not hasattr(context, 'trace') or context.trace is None:
    return False
return len(context.trace['spans']) == 2
        `,
      };

      const result: GradingResult = await runAssertion({
        assertion,
        test: mockTest,
        providerResponse: mockProviderResponse,
        traceId: 'test-trace-id',
      });

      expect(result.pass).toBe(true);
    });

    it('should analyze span hierarchy in python', async () => {
      mockTraceStore.getTrace.mockResolvedValue(mockTraceData);

      const assertion: Assertion = {
        type: 'python',
        value: `
root_spans = [s for s in context.trace['spans'] if not s.get('parentSpanId')]
leaf_spans = [s for s in context.trace['spans'] if s.get('parentSpanId')]
return len(root_spans) == 1 and len(leaf_spans) == 1
        `,
      };

      const result: GradingResult = await runAssertion({
        assertion,
        test: mockTest,
        providerResponse: mockProviderResponse,
        traceId: 'test-trace-id',
      });

      expect(result.pass).toBe(true);
    });

    it('should return grading result object from python', async () => {
      mockTraceStore.getTrace.mockResolvedValue(mockTraceData);

      const assertion: Assertion = {
        type: 'python',
        value: `
avg_duration = sum(s['endTime'] - s['startTime'] for s in context.trace['spans'] if s.get('endTime')) / len(context.trace['spans'])
return {
    'pass': True,
    'score': 0.9,
    'reason': f"Average span duration: {avg_duration}ms"
}
        `,
      };

      const result: GradingResult = await runAssertion({
        assertion,
        test: mockTest,
        providerResponse: mockProviderResponse,
        traceId: 'test-trace-id',
      });

      expect(result.pass).toBe(true);
      expect(result.score).toBe(0.9);
      expect(result.reason).toContain('Average span duration');
    });
  });

  describe('trace store error handling', () => {
    it('should handle trace store errors gracefully', async () => {
      mockTraceStore.getTrace.mockRejectedValue(new Error('Database error'));

      const assertion: Assertion = {
        type: 'javascript',
        value: 'context.trace === undefined',
      };

      const result: GradingResult = await runAssertion({
        assertion,
        test: mockTest,
        providerResponse: mockProviderResponse,
        traceId: 'test-trace-id',
      });

      expect(result.pass).toBe(true);
      expect(mockTraceStore.getTrace).toHaveBeenCalledWith('test-trace-id', {
        sanitizeAttributes: false,
      });
    });
  });
});
