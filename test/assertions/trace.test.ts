import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertionUsesTrace, runAssertion, runAssertions } from '../../src/assertions/index';
import cliState from '../../src/cliState';
import { withProviderCallTracingContext } from '../../src/scheduler/providerCallExecutionContext';
import { getTraceStore } from '../../src/tracing/store';
import { UNRELIABLE_SPAN_ATTRIBUTE } from '../../src/tracing/traceEvidence';
import { mockProcessEnv } from '../util/utils';

import type {
  Assertion,
  AtomicTestCase,
  GradingResult,
  ProviderResponse,
} from '../../src/types/index';
import type { TraceData } from '../../src/types/tracing';

const createSpanCountAssertion = (value: string = 'context.trace === undefined') => ({
  type: 'javascript' as const,
  value,
});

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
    restoreTraceFetchEnv();
    vi.resetAllMocks();
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

  it('grades an empty stored association as unavailable without discarding output assertions', async () => {
    const emptyTrace = { ...mockTraceData, spans: [] };
    mockTraceStore.getTrace.mockResolvedValue(emptyTrace);
    mockProcessEnv({ PROMPTFOO_TRACE_FETCH_MAX_ATTEMPTS: '2' });
    const absence = { type: 'trace-span-count', value: { pattern: '*', max: 0 } } as const;
    const result = await runAssertions({
      test: {
        assert: [absence, { type: 'equals', value: 'Test output' }, createSpanCountAssertion()],
      },
      providerResponse: mockProviderResponse,
      traceId: emptyTrace.traceId,
    });
    expect(result.componentResults?.map((grade) => grade.pass)).toEqual([false, true, true]);
    expect(result.componentResults?.[0].reason).toContain('No spans were stored');
    expect(mockTraceStore.getTrace).toHaveBeenCalledTimes(2);
    // An explicit empty capture from the caller is authoritative.
    const explicit = await runAssertion({
      test: mockTest,
      assertion: absence,
      providerResponse: mockProviderResponse,
      traceId: emptyTrace.traceId,
      traceData: emptyTrace,
    });
    expect(explicit.pass).toBe(true);
  });

  it.each([
    { type: 'trace-span-count', value: { pattern: '*', min: 4, max: 4 } },
    { type: 'trace-error-spans', value: { max_count: 0 } },
    createSpanCountAssertion(
      'context.trace.spans.length === 4 && context.trace.spans.some(span => span.spanId === "target")',
    ),
  ] satisfies Assertion[])(
    'uses the captured span IDs for direct and replayed $type assertions',
    async (assertion) => {
      const internalSpans = [
        {
          spanId: 'grader-grandchild',
          parentSpanId: 'grader-child',
          name: 'tool execution',
          startTime: 1800,
          endTime: 1900,
          statusCode: 2,
        },
        {
          spanId: 'grader-child',
          parentSpanId: 'grader',
          name: 'model generation',
          startTime: 1700,
          endTime: 2000,
        },
        {
          spanId: 'eval-root',
          name: 'promptfoo.test_case',
          startTime: 900,
          endTime: 2100,
          statusCode: 2,
          attributes: { 'promptfoo.span.role': 'test_case' },
        },
        {
          spanId: 'grader',
          name: 'grader javascript',
          startTime: 1700,
          endTime: 2000,
          statusCode: 2,
          attributes: { 'promptfoo.span.role': 'grader' },
        },
      ];
      const targetSpans = [
        ...mockTraceData.spans,
        {
          spanId: 'roleless',
          parentSpanId: 'eval-root',
          name: 'promptfoo.test_case',
          startTime: 1000,
          endTime: 1500,
        },
        {
          spanId: 'target',
          name: 'grader target',
          startTime: 1100,
          endTime: 1400,
          attributes: { 'promptfoo.span.role': 'grader' },
        },
      ];
      const traceData: TraceData = {
        ...mockTraceData,
        metadata: {
          promptfooTraceEvidence: 'complete',
          promptfooTraceSpanIds: targetSpans.map((span) => span.spanId),
        },
        spans: [...targetSpans, ...internalSpans],
      };
      const direct = await runAssertion({
        assertion,
        test: mockTest,
        providerResponse: mockProviderResponse,
        traceId: traceData.traceId,
        traceData,
      });
      expect(direct.pass).toBe(true);
      mockTraceStore.getTrace.mockResolvedValue(JSON.parse(JSON.stringify(traceData)));
      const replay = await runAssertions({
        test: { assert: [assertion] },
        providerResponse: mockProviderResponse,
        traceId: traceData.traceId,
      });
      expect(replay.pass).toBe(true);
      expect(traceData.spans).toEqual([...targetSpans, ...internalSpans]);
    },
  );

  it.each([[], 'span-1', [null], ['missing'], ['span-1', 'missing']])(
    'does not certify an invalid or incomplete saved capture %j',
    async (capturedIds) => {
      const traceData = {
        ...mockTraceData,
        metadata: { promptfooTraceEvidence: 'complete', promptfooTraceSpanIds: capturedIds },
      };
      const absence = { type: 'trace-span-count', value: { pattern: 'missing', max: 0 } } as const;
      const direct = await runAssertion({
        assertion: absence,
        test: mockTest,
        providerResponse: mockProviderResponse,
        traceId: traceData.traceId,
        traceData,
      });
      expect(direct.pass).toBe(false);
      mockTraceStore.getTrace.mockResolvedValue(JSON.parse(JSON.stringify(traceData)));
      const replay = await runAssertions({
        test: { assert: [absence] },
        providerResponse: mockProviderResponse,
        traceId: traceData.traceId,
      });
      expect(replay.pass).toBe(false);
    },
  );

  it('admits late partial target descendants while excluding grader tools', async () => {
    const traceData: TraceData = {
      ...mockTraceData,
      metadata: {
        promptfooTraceEvidence: 'partial',
        promptfooTraceSpanIds: ['target', 'open-child'],
      },
      spans: [
        { spanId: 'target', parentSpanId: 'root', name: 'target.call', startTime: 1 },
        { spanId: 'root', name: 'promptfoo.test_case', startTime: 0 },
        { spanId: 'grader', parentSpanId: 'root', name: 'grader', startTime: 2 },
        {
          spanId: 'grader-tool',
          parentSpanId: 'grader',
          name: 'execute_tool grader',
          startTime: 3,
        },
      ],
    };
    const assertion = {
      type: 'trace-span-count',
      value: { pattern: 'execute_tool *', min: 1 },
    } as const;
    mockTraceStore.getTrace.mockResolvedValue(traceData);
    const options = {
      traceId: traceData.traceId,
      providerResponse: mockProviderResponse,
      test: { assert: [assertion] },
    };
    expect((await runAssertions(options)).pass).toBe(false);
    traceData.spans.push(
      { spanId: 'open-child', parentSpanId: 'target', name: 'active target child', startTime: 1 },
      {
        spanId: 'late-tool',
        parentSpanId: 'open-child',
        name: 'execute_tool target',
        startTime: 2,
        attributes: { 'promptfoo.span.role': 'grader' },
      },
    );
    expect((await runAssertions(options)).pass).toBe(true);
    const absence = await runAssertions({
      ...options,
      test: { assert: [{ type: 'trace-span-count', value: { pattern: 'missing', max: 0 } }] },
    });
    expect(absence.pass).toBe(false);
    expect(traceData.spans).toHaveLength(6);
  });

  it.each(['complete', 'partial', 'external'] as const)(
    'withholds %s evidence when a selected target span loses attributes',
    async (evidence) => {
      const traceData: TraceData = {
        ...mockTraceData,
        metadata:
          evidence === 'external'
            ? {}
            : {
                promptfooTraceEvidence: evidence,
                promptfooTraceSpanIds:
                  evidence === 'complete' ? ['target', 'late-child'] : ['target'],
              },
        spans: [
          { spanId: 'target', parentSpanId: 'root', name: 'target.call', startTime: 1 },
          {
            spanId: 'late-child',
            parentSpanId: 'target',
            name: 'execute_tool',
            startTime: 2,
            attributes: {
              'tool.arguments': 'safe_probe',
              [UNRELIABLE_SPAN_ATTRIBUTE]: true,
            },
          },
        ],
      };
      const assertion = { type: 'trajectory:tool-used', value: 'safe_probe' } as const;
      const direct = await runAssertion({
        assertion,
        test: mockTest,
        providerResponse: mockProviderResponse,
        traceId: traceData.traceId,
        traceData,
      });
      expect(direct.pass).toBe(false);
      const unmarked = structuredClone(traceData);
      delete unmarked.spans[1].attributes![UNRELIABLE_SPAN_ATTRIBUTE];
      expect(
        (
          await runAssertion({
            assertion,
            test: mockTest,
            providerResponse: mockProviderResponse,
            traceId: unmarked.traceId,
            traceData: unmarked,
          })
        ).pass,
      ).toBe(true);
      mockTraceStore.getTrace.mockResolvedValue(JSON.parse(JSON.stringify(traceData)));
      const replay = await runAssertions({
        test: { assert: [assertion, createSpanCountAssertion('context.trace === undefined')] },
        providerResponse: mockProviderResponse,
        traceId: traceData.traceId,
      });
      expect(replay.componentResults?.map((result) => result.pass)).toEqual([false, true]);
    },
  );

  it.each(['complete', 'partial'])(
    'keeps %s target evidence usable when only an excluded grader loses attributes',
    async (evidence) => {
      mockTraceStore.getTrace.mockResolvedValue({
        ...mockTraceData,
        metadata: { promptfooTraceEvidence: evidence, promptfooTraceSpanIds: ['target'] },
        spans: [
          {
            spanId: 'target',
            parentSpanId: 'root',
            name: 'execute_tool target',
            startTime: 1,
            attributes: { 'tool.name': 'target', [UNRELIABLE_SPAN_ATTRIBUTE]: false },
          },
          {
            spanId: 'grader',
            parentSpanId: 'root',
            name: 'execute_tool grader',
            startTime: 2,
            attributes: { 'tool.name': 'grader', [UNRELIABLE_SPAN_ATTRIBUTE]: true },
          },
        ],
      });
      const result = await runAssertions({
        traceId: mockTraceData.traceId,
        providerResponse: mockProviderResponse,
        test: { assert: [{ type: 'trajectory:tool-used', value: 'target' }] },
      });
      expect(result.pass).toBe(true);
    },
  );

  it('keeps an empty partial local scope from accepting later grader evidence', async () => {
    mockTraceStore.getTrace.mockResolvedValue({
      ...mockTraceData,
      metadata: { promptfooTraceEvidence: 'partial', promptfooTraceSpanIds: [] },
    });
    const result = await runAssertions({
      traceId: mockTraceData.traceId,
      providerResponse: mockProviderResponse,
      test: { assert: [{ type: 'trace-span-count', value: { pattern: '*', min: 1 } }] },
    });
    expect(result.pass).toBe(false);
  });

  it('keeps target-supplied role attributes in traces without a local capture snapshot', async () => {
    const traceData: TraceData = {
      ...mockTraceData,
      spans: mockTraceData.spans.map((span, index) => ({
        ...span,
        attributes: { 'promptfoo.span.role': index === 0 ? 'test_case' : 'grader' },
      })),
    };
    const assertion = {
      type: 'trace-span-count',
      value: { pattern: '*', min: 2, max: 2 },
    } as const;
    const direct = await runAssertion({
      assertion,
      test: mockTest,
      providerResponse: mockProviderResponse,
      traceId: traceData.traceId,
      traceData,
    });
    expect(direct.pass).toBe(true);
    mockTraceStore.getTrace.mockResolvedValue(traceData);
    const replay = await runAssertions({
      test: { assert: [assertion] },
      providerResponse: mockProviderResponse,
      traceId: traceData.traceId,
    });
    expect(replay.pass).toBe(true);
  });

  describe('regrading saved trace evidence', () => {
    const positive = { type: 'trace-span-count', value: { pattern: '*', min: 1 } } as const;
    const absence = { type: 'trace-span-count', value: { pattern: 'missing', max: 0 } } as const;

    it.each(['partial', 'unavailable'])(
      'uses the %s status for direct and bulk grading',
      async (status) => {
        const traceData = { ...mockTraceData, metadata: { promptfooTraceEvidence: status } };
        const choices = [
          positive,
          absence,
          createSpanCountAssertion('context.trace === undefined'),
        ];
        const expected = [status === 'partial', false, status === 'unavailable'];
        const direct = await Promise.all(
          choices.map((assertion) =>
            runAssertion({
              assertion,
              test: mockTest,
              providerResponse: mockProviderResponse,
              traceData,
            }),
          ),
        );
        expect(direct.map((grade) => grade.pass)).toEqual(expected);
        expect(mockTraceStore.getTrace).not.toHaveBeenCalled();

        mockTraceStore.getTrace.mockResolvedValue(traceData);
        const bulk = await runAssertions({
          test: { assert: choices },
          providerResponse: mockProviderResponse,
          traceId: traceData.traceId,
        });
        expect(bulk.componentResults?.map((grade) => grade.pass)).toEqual(expected);
        expect(mockTraceStore.getTrace).toHaveBeenCalledOnce();
      },
    );

    it('uses a successful live capture over the initial partial status', async () => {
      mockTraceStore.getTrace.mockResolvedValue({
        ...mockTraceData,
        metadata: { promptfooTraceEvidence: 'partial' },
      });
      const options = {
        test: { assert: [absence] },
        providerResponse: mockProviderResponse,
        traceId: mockTraceData.traceId,
      };
      expect(
        (await runAssertions({ ...options, traceUnavailable: false, traceIncomplete: false })).pass,
      ).toBe(true);
      expect((await runAssertions({ ...options, traceIncomplete: false })).pass).toBe(false);
    });

    it('preserves the hard failure even if no spans were persisted', async () => {
      mockTraceStore.getTrace.mockResolvedValue({
        ...mockTraceData,
        metadata: { promptfooTraceEvidence: 'unavailable' },
        spans: [],
      });
      const result = await runAssertion({
        assertion: positive,
        test: mockTest,
        providerResponse: mockProviderResponse,
        traceId: mockTraceData.traceId,
      });
      expect(result).toMatchObject({
        pass: false,
        reason: expect.stringContaining('Trace evidence is unavailable or unreliable'),
      });
      expect(mockTraceStore.getTrace).toHaveBeenCalledOnce();
    });
  });

  it('grades only observed positive claims on a partial trace', async () => {
    mockTraceStore.getTrace.mockResolvedValue({
      ...mockTraceData,
      spans: [
        {
          ...mockTraceData.spans[0],
          name: 'execute_tool search',
          attributes: { 'tool.name': 'search', 'tool.arguments': '{"query":"orders"}' },
        },
      ],
    });
    const observed: Assertion[] = [
      { type: 'trace-span-count', value: { pattern: '*', min: 1 } },
      { type: 'trajectory:step-count', value: { min: 1 } },
      { type: 'trajectory:tool-used', value: 'search' },
      { type: 'trajectory:tool-used', value: ['search'] },
      { type: 'trajectory:tool-used', value: { name: 'search' } },
      { type: 'trajectory:tool-sequence', value: ['search'] },
      { type: 'trajectory:tool-sequence', value: { steps: ['search'], mode: 'in_order' } },
      { type: 'trajectory:tool-args-match', value: { name: 'search', args: { query: 'orders' } } },
    ];
    const unobserved: Assertion[] = [
      { type: 'trace-span-count', value: { pattern: '*', min: 2 } },
      { type: 'trajectory:step-count', value: { min: 2 } },
      { type: 'trajectory:tool-used', value: ['search', 'missing'] },
      { type: 'trajectory:tool-args-match', value: { name: 'search', args: { query: 'missing' } } },
      { type: 'trajectory:tool-sequence', value: ['search', 'missing'] },
    ];
    const requiresComplete: Assertion[] = [
      { type: 'trace-span-count', value: { pattern: '*', min: 0 } },
      { type: 'trace-span-count', value: { pattern: '*', min: 1, max: 1 } },
      { type: 'trace-error-spans', value: { max_count: 0 } },
      { type: 'trace-span-duration', value: { pattern: '*', max: 600 } },
      { type: 'trajectory:step-count', value: { max: 1 } },
      { type: 'trajectory:tool-used', value: { name: 'search', min: 0 } },
      { type: 'trajectory:tool-used', value: '' },
      { type: 'not-trajectory:tool-used', value: '' },
      { type: 'not-trajectory:tool-used', value: 'missing' },
      { type: 'trajectory:tool-sequence', value: { steps: ['search'], mode: 'exact' } },
      { type: 'trajectory:goal-success', value: 'Find orders' },
    ];
    const result = await runAssertions({
      test: {
        assert: [
          ...observed,
          ...unobserved,
          ...requiresComplete,
          createSpanCountAssertion('context.trace.spans.length === 1'),
        ],
      },
      providerResponse: mockProviderResponse,
      traceId: mockTraceData.traceId,
      traceIncomplete: true,
    });
    const grades = result.componentResults!;
    expect(grades.slice(0, observed.length).map((grade) => grade.pass)).toEqual(
      observed.map(() => true),
    );
    const afterUnobserved = observed.length + unobserved.length;
    for (const grade of grades.slice(observed.length, afterUnobserved)) {
      expect(grade).toMatchObject({
        pass: false,
        score: 0,
        reason: expect.stringContaining('Additional spans could satisfy'),
      });
    }
    for (const grade of grades.slice(afterUnobserved, -1)) {
      expect(grade).toMatchObject({
        pass: false,
        score: 0,
        reason: expect.stringContaining('requires a complete trace'),
      });
    }
    expect(grades.at(-1)?.pass).toBe(true);
  });

  it.each([
    ['trajectory:tool-used', true],
    ['trajectory:tool-used', false],
    ['not-trajectory:tool-used', true],
    ['not-trajectory:tool-used', false],
  ] as const)(
    'preserves empty-tool validation for %s with traceIncomplete=%s',
    async (type, traceIncomplete) => {
      await expect(
        runAssertion({
          assertion: { type, value: [] },
          test: mockTest,
          providerResponse: mockProviderResponse,
          traceData: mockTraceData,
          traceIncomplete,
        }),
      ).rejects.toThrow('trajectory:tool-used assertion requires at least one expected tool');
    },
  );

  it('preserves validation errors on positive partial-trace assertions', async () => {
    await expect(
      runAssertion({
        assertion: { type: 'trajectory:tool-args-match', value: { name: 'search' } },
        test: mockTest,
        providerResponse: mockProviderResponse,
        traceId: mockTraceData.traceId,
        traceData: mockTraceData,
        traceIncomplete: true,
      }),
    ).rejects.toThrow('must include an args or arguments property');
  });

  describe('deterministic assertions with span attribute filters', () => {
    it.each<{ assertion: Assertion; pass: boolean }>([
      { assertion: { type: 'trace-span-count', value: { max: 2 } }, pass: true },
      { assertion: { type: 'trace-span-count', value: { min: 3 } }, pass: false },
      { assertion: { type: 'trace-span-duration', value: { max: 500 } }, pass: true },
      {
        assertion: { type: 'trace-span-duration', value: { max: 200, percentile: 50 } },
        pass: true,
      },
      {
        assertion: { type: 'trace-span-duration', value: { max: 200, percentile: 95 } },
        pass: false,
      },
      { assertion: { type: 'trace-error-spans', value: { max_count: 1 } }, pass: true },
      {
        assertion: { type: 'trace-error-spans', value: { max_percentage: 49 } },
        pass: false,
      },
      {
        assertion: { type: 'trace-error-spans', value: { max_percentage: 50 } },
        pass: true,
      },
    ])('applies filters before grading $assertion', async ({ assertion, pass }) => {
      const spans = [
        { spanId: 'search-ok', duration: 100, tool: 'search', statusCode: 0 },
        { spanId: 'search-error', duration: 300, tool: 'search', statusCode: 2 },
        { spanId: 'fetch-error', duration: 5000, tool: 'fetch', statusCode: 2 },
        { spanId: 'unknown-error', duration: 9000, tool: undefined, statusCode: 2 },
      ].map(({ spanId, duration, tool, statusCode }) => ({
        spanId,
        name: 'execute_tool',
        startTime: 1000,
        endTime: 1000 + duration,
        attributes: tool ? { 'gen_ai.tool.name': tool } : {},
        statusCode,
      }));
      mockTraceStore.getTrace.mockResolvedValue({ ...mockTraceData, spans });

      const result = await runAssertion({
        assertion: {
          ...assertion,
          value: {
            ...(assertion.value as object),
            pattern: 'execute_*',
            attributes: { 'gen_ai.tool.name': 'search' },
          },
        },
        test: mockTest,
        providerResponse: mockProviderResponse,
        traceId: 'test-trace-id',
      });

      expect(result.pass).toBe(pass);
      expect(result.score).toBe(pass ? 1 : 0);
      expect(result.reason).toContain('Attribute filters applied to keys: ["gen_ai.tool.name"]');
      expect(result.reason).not.toContain('search');
    });

    it.each<{ assertion: Assertion; pass: boolean }>([
      { assertion: { type: 'trace-span-count', value: { min: 1 } }, pass: false },
      { assertion: { type: 'trace-span-duration', value: { max: 500 } }, pass: true },
      { assertion: { type: 'trace-error-spans', value: { max_count: 0 } }, pass: true },
    ])('explains an empty attribute selection for $assertion', async ({ assertion, pass }) => {
      mockTraceStore.getTrace.mockResolvedValue(mockTraceData);
      const result = await runAssertion({
        assertion: {
          ...assertion,
          value: {
            ...(assertion.value as object),
            pattern: '*',
            attributes: { 'gen_ai.tool.name': 'private-tool-value' },
          },
        },
        test: mockTest,
        providerResponse: mockProviderResponse,
        traceId: 'test-trace-id',
      });

      expect(result.pass).toBe(pass);
      expect(result.reason).toContain('Attribute filters applied to keys: ["gen_ai.tool.name"]');
      expect(result.reason).not.toContain('private-tool-value');
    });
  });

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

      const assertion: Assertion = createSpanCountAssertion('context.trace?.spans?.length === 2');

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
        assertion: createSpanCountAssertion('context.trace?.spans?.length === 2'),
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

      const assertion: Assertion = createSpanCountAssertion('context.trace?.spans?.length === 2');

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

      const assertion: Assertion = createSpanCountAssertion();

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
          assert: [createSpanCountAssertion(), createSpanCountAssertion()],
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

      const assertion: Assertion = createSpanCountAssertion();

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
