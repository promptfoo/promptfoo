import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertionUsesTrace, runAssertion, runAssertions } from '../../src/assertions/index';
import cliState from '../../src/cliState';
import { withProviderCallTracingContext } from '../../src/scheduler/providerCallExecutionContext';
import { sanitizeTraceAttributes } from '../../src/tracing/sanitizeAttributes';
import { getTraceStore } from '../../src/tracing/store';
import { mockProcessEnv } from '../util/utils';

import type {
  ApiProvider,
  Assertion,
  AtomicTestCase,
  GradingResult,
  ProviderResponse,
} from '../../src/types/index';
import type { TraceData, TraceSpan } from '../../src/types/tracing';

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

  describe('OpenAI Agents API trace evidence', () => {
    const noErrors: Assertion = { type: 'trace-error-spans', value: { max_count: 0 } };
    const noDelete: Assertion = { type: 'not-trajectory:tool-used', value: 'delete_record' };
    const imported = {
      source: 'openai:agents-api',
      status: 'imported',
      includeToolArguments: false,
      toolArgumentsComplete: false,
      parentSpanId: 'wrapper',
      spanCount: 1,
    };
    const incomplete = { ...imported, includeToolArguments: true };
    const complete = { ...incomplete, toolArgumentsComplete: true };
    const unavailable = { source: 'openai:agents-api', status: 'unavailable' };
    const tool = (name: string, args?: unknown, redacted = false): TraceSpan => ({
      spanId: name,
      parentSpanId: 'wrapper',
      name: `execute_tool ${name}`,
      startTime: 1010,
      endTime: 1050,
      attributes: {
        'promptfoo.openai.hosted_trace': 'wrapper',
        'gen_ai.operation.name': 'execute_tool',
        'tool.name': name,
        ...(args !== undefined && {
          'tool.arguments': JSON.stringify(args),
          'gen_ai.tool.call.arguments': JSON.stringify(args),
        }),
        ...(redacted && { 'promptfoo.tool.arguments_redacted': true }),
      },
    });
    const grade = (
      assertion: Assertion,
      hostedTrace?: object,
      calls = [tool('lookup', { order_id: '123' })],
      provider?: ApiProvider,
    ) =>
      runAssertion({
        assertion,
        provider,
        test: mockTest,
        providerResponse: { output: 'ok', metadata: { hostedTrace } },
        traceId: mockTraceData.traceId,
        traceData: {
          ...mockTraceData,
          spans: [
            { spanId: 'wrapper', name: 'invoke_agent', startTime: 1000, endTime: 1100 },
            {
              spanId: 'sibling',
              name: 'execute_tool other_provider',
              startTime: 1000,
              attributes: { 'tool.name': 'other_provider' },
            },
            ...calls,
          ],
        },
      });

    it.each([noErrors, noDelete])(
      'cannot infer absence for $type after a failed import',
      async (assertion) => {
        await expect(grade(assertion, unavailable)).resolves.toMatchObject({
          pass: false,
          score: 0,
          reason: expect.stringContaining('unavailable'),
        });
        await expect(grade(assertion, imported)).resolves.toMatchObject({ pass: true });
        await expect(grade(assertion)).resolves.toMatchObject({ pass: true });
      },
    );

    it.each<{ assertion: Assertion; pass: boolean }>([
      { assertion: { type: 'trajectory:tool-used', value: ['lookup'] }, pass: true },
      {
        assertion: { type: 'trajectory:tool-used', value: { name: 'lookup', min: 1 } },
        pass: true,
      },
      {
        assertion: {
          type: 'trajectory:tool-args-match',
          value: { name: 'lookup', args: { order_id: '123' } },
        },
        pass: true,
      },
      { assertion: noErrors, pass: false },
      { assertion: noDelete, pass: false },
      {
        assertion: { type: 'trajectory:tool-used', value: { name: 'other', min: 0 } },
        pass: false,
      },
      {
        assertion: { type: 'trajectory:tool-used', value: { name: 'lookup', max: 1 } },
        pass: false,
      },
      { assertion: { type: 'trajectory:tool-sequence', value: ['lookup'] }, pass: false },
    ])(
      'grades only observed tool evidence from a partial trace: $assertion.type',
      async ({ assertion, pass }) => {
        await expect(grade(assertion, { ...incomplete, status: 'partial' })).resolves.toMatchObject(
          { pass },
        );
      },
    );

    it('keeps the local provider wrapper but excludes tools outside this hosted turn', async () => {
      for (const status of [imported, { ...imported, status: 'partial' }]) {
        await expect(
          grade({ type: 'trajectory:tool-used', value: 'other_provider' }, status),
        ).resolves.toMatchObject({ pass: false });
      }
      await expect(
        grade({ type: 'trace-span-count', value: { pattern: 'invoke_agent', min: 1 } }, imported),
      ).resolves.toMatchObject({ pass: true });
      await expect(
        grade(
          { type: 'trace-span-count', value: { pattern: 'execute_tool other_provider', min: 1 } },
          imported,
        ),
      ).resolves.toMatchObject({ pass: false });
    });

    it('cannot grade raw filters on discarded native fields, even with complete argument capture', async () => {
      const value = {
        pattern: 'execute_tool *',
        attributes: { 'gen_ai.tool.call.result': 'private result' },
      };
      for (const assertion of [
        { type: 'trace-span-count', value: { ...value, max: 0 } },
        { type: 'trace-span-duration', value: { ...value, max: 1 } },
        { type: 'trace-error-spans', value: { ...value, pattern: '', max_count: 0 } },
      ] satisfies Assertion[]) {
        await expect(grade(assertion, complete)).resolves.toMatchObject({
          pass: false,
          reason: expect.stringContaining('not retained'),
        });
      }
      await expect(
        grade(
          { type: 'trace-span-count', value: { ...value, pattern: 'invoke_agent', max: 0 } },
          imported,
        ),
      ).resolves.toMatchObject({ pass: true });
    });

    it('requires the local provider wrapper for raw counts and still grades witnessed tool arguments without it', async () => {
      const orphan = tool('lookup', { order_id: '123' });
      orphan.parentSpanId = 'missing-wrapper';
      orphan.attributes!['promptfoo.openai.hosted_trace'] = orphan.parentSpanId;
      const manifest = { ...complete, parentSpanId: orphan.parentSpanId };
      for (const pattern of ['invoke_agent', 'execute_tool *']) {
        await expect(
          grade({ type: 'trace-span-count', value: { pattern, max: 1 } }, manifest, [orphan]),
        ).resolves.toMatchObject({ pass: false, reason: expect.stringContaining('wrapper') });
      }
      await expect(
        grade(
          {
            type: 'trajectory:tool-args-match',
            value: { name: 'lookup', args: { order_id: '123' }, mode: 'exact' },
          },
          manifest,
          [orphan],
        ),
      ).resolves.toMatchObject({ pass: true });
    });

    it('fails if a replay contains only hosted spans belonging to a different provider call', async () => {
      await expect(
        grade(noDelete, { ...imported, parentSpanId: 'other-call' }),
      ).resolves.toMatchObject({
        pass: false,
        score: 0,
        reason: expect.stringContaining('incomplete'),
      });
    });

    it('fails closed when export stripped the target capture metadata, even with no native spans', async () => {
      const wrapper = (role: string): TraceSpan => ({
        name: 'invoke_agent',
        spanId: 'requested-call',
        startTime: 1010,
        attributes: {
          'promptfoo.span.role': role,
          'promptfoo.openai.hosted_trace_requested': true,
        },
      });
      const provider = { id: () => 'custom-agent-id', callApi: async () => ({ output: 'ok' }) };
      await expect(
        grade(noDelete, undefined, [wrapper('target')], provider),
      ).resolves.toMatchObject({
        pass: false,
        reason: expect.stringContaining('capture metadata'),
      });
      await expect(grade(noDelete, undefined, [wrapper('grader')])).resolves.toMatchObject({
        pass: true,
      });
    });

    it('does not attribute a hosted grader or its detached tools to another target on replay', async () => {
      const importedTool = {
        ...tool('read_receipt'),
        parentSpanId: 'hosted-grader',
        attributes: {
          'promptfoo.openai.hosted_trace': 'hosted-grader',
          'tool.name': 'read_receipt',
        },
      };
      const grader: TraceSpan = {
        spanId: 'rubric',
        name: 'llm-rubric',
        startTime: 1000,
        attributes: { 'promptfoo.span.role': 'grader' },
      };
      const graderWrapper: TraceSpan = {
        spanId: 'hosted-grader',
        parentSpanId: grader.spanId,
        name: 'invoke_agent',
        startTime: 1010,
        attributes: { 'promptfoo.openai.hosted_trace_requested': true },
      };
      for (const calls of [[grader, graderWrapper, importedTool], [importedTool]]) {
        await expect(
          grade({ type: 'trajectory:tool-used', value: 'read_receipt' }, undefined, calls),
        ).resolves.toMatchObject({ pass: false });
        await expect(
          grade({ type: 'not-trajectory:tool-used', value: 'read_receipt' }, undefined, calls),
        ).resolves.toMatchObject({ pass: true });
        await expect(
          grade({ type: 'trajectory:tool-used', value: 'other_provider' }, undefined, calls),
        ).resolves.toMatchObject({ pass: true });
        await expect(
          grade(
            { type: 'trace-span-count', value: { pattern: 'invoke_agent', min: 1, max: 1 } },
            undefined,
            calls,
          ),
        ).resolves.toMatchObject({ pass: true });
      }
    });

    it('proves a positive step minimum from stored names without argument capture', async () => {
      const count = (bounds: { min?: number; max?: number }) =>
        grade(
          { type: 'trajectory:step-count', value: { pattern: 'execute_tool *', ...bounds } },
          imported,
          [tool('lookup')],
        );
      await expect(count({ min: 1 })).resolves.toMatchObject({ pass: true });
      await expect(count({ min: 2 })).resolves.toMatchObject({ pass: false });
      await expect(count({ max: 1 })).resolves.toMatchObject({
        pass: false,
        reason: expect.stringContaining('includeToolArguments'),
      });
    });

    it.each<Assertion>([
      { type: 'not-trajectory:tool-args-match', value: { name: 'shell', args: { cmd: 'rm' } } },
      { type: 'trajectory:step-count', value: { type: 'command', max: 0 } },
      { type: 'trajectory:step-count', value: { pattern: 'rm*', max: 0 } },
      {
        type: 'not-trajectory:tool-sequence',
        value: { steps: [{ type: ['command'], name: 'rm' }] },
      },
      {
        type: 'trace-error-spans',
        value: { attributes: { 'gen_ai.tool.call.arguments': '{"cmd":"rm"}' }, max_count: 0 },
      },
      {
        type: 'trace-span-count',
        value: { pattern: '*', attributes: { 'tool.arguments': '{}' }, max: 0 },
      },
    ])('requires captured tool arguments for $type', async (assertion) => {
      await expect(grade(assertion, imported)).resolves.toMatchObject({
        pass: false,
        score: 0,
        reason: expect.stringContaining('includeToolArguments'),
      });
      await expect(grade(assertion, incomplete)).resolves.toMatchObject({
        pass: false,
        score: 0,
        reason: expect.stringContaining('redacted'),
      });
      await expect(grade(assertion, complete)).resolves.toMatchObject({ pass: true });
    });

    it.each(['shell', 'configured-command'])(
      'keeps %s visible as both hosted tool and command',
      async (name) => {
        const cmd = 'rm receipt';
        const gradeTool = (assertion: Assertion, capture: boolean) =>
          runAssertion({
            assertion,
            test: mockTest,
            providerResponse: {
              output: 'ok',
              metadata: { hostedTrace: capture ? complete : imported },
            },
            traceId: mockTraceData.traceId,
            traceData: {
              ...mockTraceData,
              metadata: { commandToolNames: ['configured-command'] },
              spans: [
                {
                  spanId: 'shell',
                  name: 'execute_tool ' + name,
                  startTime: 10,
                  endTime: 20,
                  attributes: {
                    'promptfoo.openai.hosted_trace': 'wrapper',
                    'tool.name': name,
                    ...(capture && { 'tool.arguments': JSON.stringify({ cmd }) }),
                  },
                },
              ],
            },
          });
        for (const capture of [false, true]) {
          await expect(
            gradeTool({ type: 'trajectory:tool-used', value: name }, capture),
          ).resolves.toMatchObject({ pass: true });
          await expect(
            gradeTool({ type: 'not-trajectory:tool-used', value: name }, capture),
          ).resolves.toMatchObject({ pass: false });
          await expect(
            gradeTool({ type: 'trajectory:tool-sequence', value: [name] }, capture),
          ).resolves.toMatchObject({ pass: true });
          await expect(
            gradeTool(
              { type: 'not-trajectory:tool-args-match', value: { name, args: { cmd } } },
              capture,
            ),
          ).resolves.toMatchObject({ pass: false });
        }
        await expect(
          gradeTool({ type: 'trajectory:tool-args-match', value: { name, args: { cmd } } }, true),
        ).resolves.toMatchObject({ pass: true });
        await expect(
          gradeTool(
            { type: 'trajectory:step-count', value: { type: 'command', pattern: 'rm*', min: 1 } },
            true,
          ),
        ).resolves.toMatchObject({ pass: true });
      },
    );

    it('grades preserved fields on a lossy call and requires an intact candidate for exact matching', async () => {
      const lossy = tool('lookup', { order_id: '123' }, true);
      const intact = tool('lookup', { order_id: '123' });
      const check = (args: unknown, mode = 'partial', calls = [lossy]) =>
        grade(
          { type: 'trajectory:tool-args-match', value: { name: 'lookup', args, mode } },
          { ...incomplete, spanCount: calls.length },
          calls,
        );
      await expect(check({ order_id: '123' })).resolves.toMatchObject({ pass: true });
      await expect(check({ order_id: '123' }, 'exact')).resolves.toMatchObject({ pass: false });
      await expect(check({ order_id: '123' }, 'exact', [lossy, intact])).resolves.toMatchObject({
        pass: true,
      });
      await expect(check({ token: '[REDACTED]' })).resolves.toMatchObject({ pass: false });
      await expect(
        check(true, 'partial', [tool('lookup', undefined, true)]),
      ).resolves.toMatchObject({ pass: false });
      const legacy = tool('lookup', { url: 'https://***:***@example.test/' }, true);
      delete legacy.attributes!['gen_ai.tool.call.arguments'];
      await expect(
        check({ url: 'https://***:***@example.test/' }, 'partial', [legacy]),
      ).resolves.toMatchObject({ pass: false });
    });

    it('cannot infer the absence of an argument from a truncated export', async () => {
      const args = { cmd: 'cat ledger.csv', padding: 'a'.repeat(500) };
      const shell = tool('shell', args);
      const replayed = { ...shell, attributes: sanitizeTraceAttributes(shell.attributes) };
      expect(JSON.parse(JSON.stringify(replayed.attributes))['tool.arguments']).toMatch(/…$/);
      const forbidden: Assertion = {
        type: 'not-trajectory:tool-args-match',
        value: { name: 'shell', args: { cmd: args.cmd } },
      };
      await expect(grade(forbidden, complete, [shell])).resolves.toMatchObject({ pass: false });
      await expect(grade(forbidden, complete, [replayed])).resolves.toMatchObject({
        pass: false,
        reason: expect.stringContaining('unavailable'),
      });
      await expect(
        grade(
          {
            type: 'trajectory:tool-args-match',
            value: { name: 'shell', args: replayed.attributes['tool.arguments'] },
          },
          complete,
          [replayed],
        ),
      ).resolves.toMatchObject({ pass: false });
      await expect(
        grade(
          {
            type: 'trace-span-count',
            value: { max: 0, attributes: { 'gen_ai.tool.call.arguments': JSON.stringify(args) } },
          },
          complete,
          [replayed],
        ),
      ).resolves.toMatchObject({ pass: false });
    });

    it('an observed command establishes a positive lower bound despite missing arguments elsewhere', async () => {
      const calls = [tool('shell', { cmd: 'cat /workspace/ledger.csv' }), tool('lookup')];
      const check = (bounds: { min?: number; max?: number }, observed = calls) =>
        grade(
          {
            type: 'trajectory:step-count',
            value: { type: 'command', pattern: '*ledger.csv', ...bounds },
          },
          { ...incomplete, spanCount: observed.length },
          observed,
        );
      await expect(check({ min: 1 })).resolves.toMatchObject({ pass: true });
      await expect(check({ min: 2 })).resolves.toMatchObject({ pass: false });
      await expect(check({ max: 1 })).resolves.toMatchObject({ pass: false });
      // Redaction could have removed a higher-precedence cmd from the same call.
      await expect(
        check({ min: 1 }, [tool('shell', { command: 'cat /workspace/ledger.csv' }, true)]),
      ).resolves.toMatchObject({ pass: false });
    });

    it('preserves output checks, metric-only scoring, and unrelated provider metadata', async () => {
      await expect(
        grade({ type: 'javascript', value: 'output === "ok"' }, unavailable),
      ).resolves.toMatchObject({ pass: true });
      await expect(grade({ ...noErrors, weight: 0 }, unavailable)).resolves.toMatchObject({
        pass: true,
        score: 0,
      });
      await expect(
        grade(noDelete, { status: 'unavailable', source: 'custom' }),
      ).resolves.toMatchObject({ pass: true });
    });
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
