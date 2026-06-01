import { describe, expect, it } from 'vitest';
import {
  handleTrajectoryStepCount,
  handleTrajectoryToolArgsMatch,
  handleTrajectoryToolSequence,
  handleTrajectoryToolUsed,
} from '../../src/assertions/trajectory';
import {
  extractTrajectorySteps,
  summarizeTrajectoryForJudge,
} from '../../src/assertions/trajectoryUtils';
import { createMockProvider, createProviderResponse } from '../factories/provider';

import type { AssertionParams, AtomicTestCase } from '../../src/types/index';
import type { TraceData } from '../../src/types/tracing';

const mockProvider = createMockProvider({
  id: 'mock',
  response: createProviderResponse({ output: 'mock' }),
});

const mockTraceData: TraceData = {
  traceId: 'test-trace-id',
  evaluationId: 'test-evaluation-id',
  testCaseId: 'test-test-case-id',
  metadata: { test: 'value' },
  spans: [
    {
      spanId: 'span-1',
      name: 'chat gpt-5',
      startTime: 1000,
      endTime: 1800,
      attributes: {
        'promptfoo.provider.id': 'openai:gpt-5',
      },
    },
    {
      spanId: 'span-2',
      name: 'tool.call',
      startTime: 1100,
      endTime: 1200,
      attributes: {
        'tool.name': 'search_orders',
        'tool.arguments': '{"order_id":"123","include_history":false}',
      },
    },
    {
      spanId: 'span-3',
      name: 'mcp inventory/search_inventory',
      startTime: 1250,
      endTime: 1350,
      attributes: {
        'codex.item.type': 'mcp_tool_call',
        'codex.mcp.server': 'inventory',
        'codex.mcp.tool': 'search_inventory',
        'codex.mcp.input': '{"query":"quantum computing","limit":3}',
      },
    },
    {
      spanId: 'span-4',
      name: 'tool.call',
      startTime: 1400,
      endTime: 1500,
      attributes: {
        'tool.name': 'compose_reply',
        'tool.args': {
          tone: 'friendly',
          citations: ['doc_1', 'doc_2'],
        },
      },
    },
    {
      spanId: 'span-5',
      name: 'exec ls',
      startTime: 1550,
      endTime: 1600,
      attributes: {
        'codex.item.type': 'command_execution',
        'codex.command': 'ls -la',
      },
    },
    {
      spanId: 'span-6',
      name: 'reasoning_plan',
      startTime: 1650,
      endTime: 1700,
      attributes: {
        'reasoning.step': 'plan',
      },
    },
  ],
};

const defaultParams = {
  assertionValueContext: {
    vars: {},
    test: {} as AtomicTestCase,
    prompt: 'test prompt',
    logProbs: undefined,
    provider: mockProvider,
    providerResponse: { output: 'test output' },
    trace: mockTraceData,
  },
  output: 'test output',
  outputString: 'test output',
  providerResponse: { output: 'test output' },
  test: {} as AtomicTestCase,
  inverse: false,
};

describe('trajectory utilities', () => {
  it('treats configured shell tool names as command steps', () => {
    const customShellTrace: TraceData = {
      traceId: 'custom-shell',
      evaluationId: 'eval-1',
      testCaseId: 'tc-1',
      metadata: {},
      spans: [
        {
          spanId: 'span-1',
          name: 'tool.call',
          startTime: 100,
          endTime: 200,
          attributes: {
            'tool.name': 'bash',
            'tool.arguments': JSON.stringify({ cmd: 'pytest tests/' }),
          },
        },
      ],
    };

    // By default, a tool named 'bash' normalizes to type:tool, not type:command.
    expect(extractTrajectorySteps(customShellTrace)[0].type).toBe('tool');

    const steps = extractTrajectorySteps({
      ...customShellTrace,
      metadata: { commandToolNames: ['bash'] },
    });
    expect(steps[0].type).toBe('command');
    // The command argument should also be reflected in the step name.
    expect(steps[0].name).toBe('pytest tests/');
  });

  it('extracts normalized trajectory steps from trace spans', () => {
    const steps = extractTrajectorySteps(mockTraceData);

    expect(steps.map((step) => ({ type: step.type, name: step.name }))).toEqual([
      { type: 'span', name: 'chat gpt-5' },
      { type: 'tool', name: 'search_orders' },
      { type: 'tool', name: 'search_inventory' },
      { type: 'tool', name: 'compose_reply' },
      { type: 'command', name: 'ls -la' },
      { type: 'reasoning', name: 'reasoning_plan' },
    ]);

    expect(steps[4].aliases).toContain('ls');
    expect(steps[2].aliases).toContain('mcp inventory/search_inventory');
    expect(steps[1].args).toEqual({ order_id: '123', include_history: false });
    expect(steps[2].args).toEqual({ query: 'quantum computing', limit: 3 });
    expect(steps[3].args).toEqual({
      tone: 'friendly',
      citations: ['doc_1', 'doc_2'],
    });
  });

  it('does not classify a chat span carrying gen_ai.tool.definitions as a tool', () => {
    // pydantic-ai (and other GenAI-convention tracers) put the list of *available* tools on
    // each chat span as a JSON array under gen_ai.tool.definitions; that must not be read as
    // a tool call. Real tool calls use gen_ai.tool.name. Regression for #9523.
    const toolDefinitions = JSON.stringify([
      { type: 'function', name: 'orders', description: 'List orders' },
      { type: 'function', name: 'order_rows', description: 'List order rows' },
    ]);
    const steps = extractTrajectorySteps({
      ...mockTraceData,
      spans: [
        {
          spanId: 'chat-1',
          name: 'chat gpt-4o-mini',
          startTime: 1000,
          endTime: 1100,
          attributes: { 'gen_ai.tool.definitions': toolDefinitions },
        },
        {
          spanId: 'exec-1',
          name: 'execute_tool',
          startTime: 1200,
          endTime: 1300,
          attributes: { 'gen_ai.tool.name': 'order_rows' },
        },
      ],
    });

    expect(steps.map((step) => ({ type: step.type, name: step.name }))).toEqual([
      { type: 'span', name: 'chat gpt-4o-mini' },
      { type: 'tool', name: 'order_rows' },
    ]);
  });

  it('still reads a plain string tool name from a generic tool attribute', () => {
    // The structured-value guard must not break scalar tool-name fallbacks.
    const steps = extractTrajectorySteps({
      ...mockTraceData,
      spans: [
        {
          spanId: 'custom-tool',
          name: 'invoke',
          startTime: 1000,
          endTime: 1100,
          attributes: { 'app.tool': 'lookup_customer' },
        },
      ],
    });

    expect(steps.map((step) => ({ type: step.type, name: step.name }))).toEqual([
      { type: 'tool', name: 'lookup_customer' },
    ]);
  });

  it('only treats a generic query attribute as search when the span looks search-like', () => {
    const steps = extractTrajectorySteps({
      ...mockTraceData,
      spans: [
        {
          spanId: 'span-sql',
          name: 'sql.query',
          startTime: 1000,
          endTime: 1100,
          attributes: {
            query: 'SELECT * FROM users',
          },
        },
        {
          spanId: 'span-search',
          name: 'document_search',
          startTime: 1200,
          endTime: 1300,
          attributes: {
            query: 'refund policy',
          },
        },
      ],
    });

    expect(steps.map((step) => ({ type: step.type, name: step.name }))).toEqual([
      { type: 'span', name: 'sql.query' },
      { type: 'search', name: 'refund policy' },
    ]);
  });

  it('normalizes OpenAI Agents sandbox exec_command tool spans as commands', () => {
    const steps = extractTrajectorySteps({
      ...mockTraceData,
      spans: [
        {
          spanId: 'sandbox-command',
          name: 'tool exec_command',
          startTime: 1000,
          endTime: 1100,
          attributes: {
            'tool.name': 'exec_command',
            'tool.arguments': '{"cmd":"cat repo/tickets/TICKET-014.md","workdir":"/tmp/ws"}',
          },
        },
      ],
    });

    expect(steps).toHaveLength(1);
    expect(steps[0].type).toBe('command');
    expect(steps[0].name).toBe('cat repo/tickets/TICKET-014.md');
    expect(steps[0].args).toEqual({
      cmd: 'cat repo/tickets/TICKET-014.md',
      workdir: '/tmp/ws',
    });
    expect(steps[0].aliases).toEqual(
      expect.arrayContaining(['tool exec_command', 'exec_command', 'cat']),
    );
  });

  it('normalizes local_shell tool spans as commands using the command arg', () => {
    const steps = extractTrajectorySteps({
      ...mockTraceData,
      spans: [
        {
          spanId: 'local-shell-span',
          name: 'tool local_shell',
          startTime: 1000,
          endTime: 1100,
          attributes: {
            'tool.name': 'local_shell',
            'tool.arguments': '{"command":"ls -la /tmp","timeout":30}',
          },
        },
      ],
    });

    expect(steps).toHaveLength(1);
    expect(steps[0].type).toBe('command');
    expect(steps[0].name).toBe('ls -la /tmp');
    expect(steps[0].aliases).toEqual(
      expect.arrayContaining(['tool local_shell', 'local_shell', 'ls']),
    );
  });

  it('normalizes shell tool spans as commands', () => {
    const steps = extractTrajectorySteps({
      ...mockTraceData,
      spans: [
        {
          spanId: 'shell-span',
          name: 'tool shell',
          startTime: 1000,
          endTime: 1100,
          attributes: {
            'tool.name': 'shell',
            'tool.arguments': '{"cmd":"echo hello"}',
          },
        },
      ],
    });

    expect(steps).toHaveLength(1);
    expect(steps[0].type).toBe('command');
    expect(steps[0].name).toBe('echo hello');
    expect(steps[0].aliases).toEqual(expect.arrayContaining(['shell', 'echo']));
  });

  it('normalizes shell tool command arrays as one command step', () => {
    const steps = extractTrajectorySteps({
      ...mockTraceData,
      spans: [
        {
          spanId: 'shell-command-array',
          name: 'tool shell',
          startTime: 1000,
          endTime: 1100,
          attributes: {
            'tool.name': 'shell',
            'tool.arguments':
              '{"commands":["cat skills/discount-review/SKILL.md","python3 skills/discount-review/scripts/analyze_discount_policy.py skill_fixture/repo"]}',
          },
        },
      ],
    });

    expect(steps).toHaveLength(1);
    expect(steps[0].type).toBe('command');
    expect(steps[0].name).toBe(
      'cat skills/discount-review/SKILL.md; python3 skills/discount-review/scripts/analyze_discount_policy.py skill_fixture/repo',
    );
    expect(steps[0].aliases).toEqual(expect.arrayContaining(['shell', 'cat']));
  });

  it('normalizes array-format command arguments from exec_command', () => {
    const steps = extractTrajectorySteps({
      ...mockTraceData,
      spans: [
        {
          spanId: 'array-cmd',
          name: 'tool exec_command',
          startTime: 1000,
          endTime: 1100,
          attributes: {
            'tool.name': 'exec_command',
            'tool.arguments': '{"cmd":["python","-m","pytest"],"workdir":"/ws"}',
          },
        },
      ],
    });

    expect(steps).toHaveLength(1);
    expect(steps[0].type).toBe('command');
    expect(steps[0].name).toBe('python -m pytest');
    expect(steps[0].aliases).toEqual(
      expect.arrayContaining(['exec_command', 'python -m pytest', 'python']),
    );
  });

  it('falls back to tool type when exec_command has no cmd or command arg', () => {
    const steps = extractTrajectorySteps({
      ...mockTraceData,
      spans: [
        {
          spanId: 'no-cmd',
          name: 'tool exec_command',
          startTime: 1000,
          endTime: 1100,
          attributes: {
            'tool.name': 'exec_command',
            'tool.arguments': '{"workdir":"/tmp"}',
          },
        },
      ],
    });

    expect(steps).toHaveLength(1);
    expect(steps[0].type).toBe('tool');
    expect(steps[0].name).toBe('exec_command');
  });

  it('matches command tool names case-insensitively with whitespace trimming', () => {
    const steps = extractTrajectorySteps({
      ...mockTraceData,
      spans: [
        {
          spanId: 'cased-shell',
          name: 'tool Shell',
          startTime: 1000,
          endTime: 1100,
          attributes: {
            'tool.name': ' Shell ',
            'tool.arguments': '{"cmd":"pwd"}',
          },
        },
      ],
    });

    expect(steps).toHaveLength(1);
    expect(steps[0].type).toBe('command');
    expect(steps[0].name).toBe('pwd');
  });

  it.each([
    ['ai.toolCall.args', '{"order_id":"123","include_history":false}'],
    ['ai.toolCall.arguments', '{"order_id":"123","include_history":false}'],
    ['ai.toolCall.input', '{"order_id":"123","include_history":false}'],
  ])('normalizes Vercel AI SDK tool spans with %s', (argKey, argValue) => {
    const steps = extractTrajectorySteps({
      ...mockTraceData,
      spans: [
        {
          spanId: 'vercel-tool-call',
          name: 'ai.toolCall',
          startTime: 1000,
          endTime: 1100,
          attributes: {
            'ai.toolCall.name': 'search_orders',
            [argKey]: argValue,
            'ai.toolCall.result': '{"status":"ok"}',
          },
        },
      ],
    });

    expect(steps).toHaveLength(1);
    expect(steps[0].type).toBe('tool');
    expect(steps[0].name).toBe('search_orders');
    expect(steps[0].aliases).toEqual(expect.arrayContaining(['ai.toolCall', 'search_orders']));
    expect(steps[0].args).toEqual({
      order_id: '123',
      include_history: false,
    });
  });

  it('preserves original span order when timestamps are tied', () => {
    const steps = extractTrajectorySteps({
      ...mockTraceData,
      spans: [
        {
          spanId: 'tied-1',
          name: 'tool.call',
          startTime: 1000,
          endTime: 1100,
          attributes: {
            'tool.name': 'compose_reply',
          },
        },
        {
          spanId: 'tied-2',
          name: 'tool.call',
          startTime: 1000,
          endTime: 1100,
          attributes: {
            'tool.name': 'search_orders',
          },
        },
        {
          spanId: 'tied-3',
          name: 'tool.call',
          startTime: 1000,
          endTime: 1100,
          attributes: {
            'tool.name': 'finalize',
          },
        },
      ],
    });

    expect(steps.map((step) => step.name)).toEqual(['compose_reply', 'search_orders', 'finalize']);
  });

  it('compacts repeated steps and truncates long judge summaries', () => {
    const trace = {
      ...mockTraceData,
      spans: [
        ...Array.from({ length: 4 }, (_, index) => ({
          spanId: `search-${index}`,
          name: 'document_search',
          startTime: 1000 + index,
          endTime: 1100 + index,
          attributes: {
            query: 'refund policy',
          },
        })),
        ...Array.from({ length: 25 }, (_, index) => ({
          spanId: `tool-${index}`,
          name: 'tool.call',
          startTime: 2000 + index,
          endTime: 2100 + index,
          attributes: {
            'tool.name': `tool_${index + 1}`,
          },
        })),
      ],
    } satisfies TraceData;

    const summary = JSON.parse(summarizeTrajectoryForJudge(trace)) as {
      compactedStepCount: number;
      stepCount: number;
      steps: Array<
        | {
            collapsedCount?: number;
            index?: number;
            name?: string;
            spanName?: string;
            type?: string;
          }
        | { omittedCount: number }
      >;
    };

    expect(summary.stepCount).toBe(29);
    expect(summary.compactedStepCount).toBe(26);
    expect(summary.steps).toHaveLength(25);
    expect(summary.steps[0]).toMatchObject({
      index: 1,
      type: 'search',
      name: 'refund policy',
      spanName: 'document_search',
      collapsedCount: 4,
    });
    expect(summary.steps[12]).toEqual({ omittedCount: 2 });
    expect(summary.steps.at(-1)).toMatchObject({
      index: 29,
      type: 'tool',
      name: 'tool_25',
    });
  });
});

describe('trajectory assertions', () => {
  describe('trajectory:tool-used', () => {
    it('throws when trace data is not available', () => {
      const params: AssertionParams = {
        ...defaultParams,
        assertionValueContext: {
          ...defaultParams.assertionValueContext,
          trace: undefined,
        },
        baseType: 'trajectory:tool-used',
        assertion: {
          type: 'trajectory:tool-used',
          value: 'search_orders',
        },
        renderedValue: 'search_orders',
      };

      expect(() => handleTrajectoryToolUsed(params)).toThrow(
        'No trace data available for trajectory:tool-used assertion',
      );
    });

    it('passes when a required tool is present', () => {
      const params: AssertionParams = {
        ...defaultParams,
        baseType: 'trajectory:tool-used',
        assertion: {
          type: 'trajectory:tool-used',
          value: 'search_orders',
        },
        renderedValue: 'search_orders',
      };

      const result = handleTrajectoryToolUsed(params);
      expect(result).toEqual({
        pass: true,
        score: 1,
        reason:
          'Observed required tool(s): search_orders. Actual tools: tool:search_orders, tool:search_inventory, tool:compose_reply',
        assertion: params.assertion,
      });
    });

    it('supports count-based matching with patterns', () => {
      const params: AssertionParams = {
        ...defaultParams,
        baseType: 'trajectory:tool-used',
        assertion: {
          type: 'trajectory:tool-used',
          value: {
            pattern: 'search*',
            min: 2,
            max: 2,
          },
        },
        renderedValue: {
          pattern: 'search*',
          min: 2,
          max: 2,
        },
      };

      const result = handleTrajectoryToolUsed(params);
      expect(result).toEqual({
        pass: true,
        score: 1,
        reason:
          'Matched tool "search*" 2 time(s) (expected 2-2). Matches: tool:search_orders, tool:search_inventory',
        assertion: params.assertion,
      });
    });

    it('supports minimum-only count matching with patterns', () => {
      const params: AssertionParams = {
        ...defaultParams,
        baseType: 'trajectory:tool-used',
        assertion: {
          type: 'trajectory:tool-used',
          value: {
            pattern: 'search*',
            min: 1,
          },
        },
        renderedValue: {
          pattern: 'search*',
          min: 1,
        },
      };

      const result = handleTrajectoryToolUsed(params);
      expect(result).toEqual({
        pass: true,
        score: 1,
        reason:
          'Matched tool "search*" 2 time(s) (expected at least 1). Matches: tool:search_orders, tool:search_inventory',
        assertion: params.assertion,
      });
    });

    it('supports inverse assertions', () => {
      const params: AssertionParams = {
        ...defaultParams,
        baseType: 'trajectory:tool-used',
        inverse: true,
        assertion: {
          type: 'not-trajectory:tool-used',
          value: 'compose_reply',
        },
        renderedValue: 'compose_reply',
      };

      const result = handleTrajectoryToolUsed(params);
      expect(result).toEqual({
        pass: false,
        score: 0,
        reason:
          'Forbidden tool(s) were used: compose_reply. Actual tools: tool:search_orders, tool:search_inventory, tool:compose_reply',
        assertion: params.assertion,
      });
    });

    it('fails inverse list assertions when any forbidden tool is present', () => {
      const params: AssertionParams = {
        ...defaultParams,
        baseType: 'trajectory:tool-used',
        inverse: true,
        assertion: {
          type: 'not-trajectory:tool-used',
          value: ['missing_tool', 'compose_reply'],
        },
        renderedValue: ['missing_tool', 'compose_reply'],
      };

      const result = handleTrajectoryToolUsed(params);
      expect(result).toEqual({
        pass: false,
        score: 0,
        reason:
          'Forbidden tool(s) were used: compose_reply. Actual tools: tool:search_orders, tool:search_inventory, tool:compose_reply',
        assertion: params.assertion,
      });
    });

    it('passes inverse list assertions when forbidden tools are absent', () => {
      const params: AssertionParams = {
        ...defaultParams,
        baseType: 'trajectory:tool-used',
        inverse: true,
        assertion: {
          type: 'not-trajectory:tool-used',
          value: ['missing_tool'],
        },
        renderedValue: ['missing_tool'],
      };

      const result = handleTrajectoryToolUsed(params);
      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Forbidden tool(s) were not used: missing_tool',
        assertion: params.assertion,
      });
    });

    it('passes inverse count assertions when the forbidden count is not satisfied', () => {
      const params: AssertionParams = {
        ...defaultParams,
        baseType: 'trajectory:tool-used',
        inverse: true,
        assertion: {
          type: 'not-trajectory:tool-used',
          value: {
            name: 'missing_tool',
            min: 1,
          },
        },
        renderedValue: {
          name: 'missing_tool',
          min: 1,
        },
      };

      const result = handleTrajectoryToolUsed(params);
      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Tool "missing_tool" did not satisfy the forbidden match condition',
        assertion: params.assertion,
      });
    });

    it('fails when required tools are missing', () => {
      const params: AssertionParams = {
        ...defaultParams,
        baseType: 'trajectory:tool-used',
        assertion: {
          type: 'trajectory:tool-used',
          value: ['search_orders', 'missing_tool'],
        },
        renderedValue: ['search_orders', 'missing_tool'],
      };

      const result = handleTrajectoryToolUsed(params);
      expect(result).toEqual({
        pass: false,
        score: 0,
        reason:
          'Missing required tool(s): missing_tool. Actual tools: tool:search_orders, tool:search_inventory, tool:compose_reply',
        assertion: params.assertion,
      });
    });

    it('rejects invalid matcher values', () => {
      const params: AssertionParams = {
        ...defaultParams,
        baseType: 'trajectory:tool-used',
        assertion: {
          type: 'trajectory:tool-used',
          value: 123,
        },
        renderedValue: 123,
      };

      expect(() => handleTrajectoryToolUsed(params)).toThrow(
        'trajectory:tool-used assertion must have a string, string array, or object value',
      );
    });

    it('rejects count objects without a name or pattern', () => {
      const params: AssertionParams = {
        ...defaultParams,
        baseType: 'trajectory:tool-used',
        assertion: {
          type: 'trajectory:tool-used',
          value: {
            min: 1,
          },
        },
        renderedValue: {
          min: 1,
        },
      };

      expect(() => handleTrajectoryToolUsed(params)).toThrow(
        'trajectory:tool-used assertion object must include a name or pattern property',
      );
    });
  });

  describe('trajectory:tool-sequence', () => {
    it('passes when tools are observed in order', () => {
      const params: AssertionParams = {
        ...defaultParams,
        baseType: 'trajectory:tool-sequence',
        assertion: {
          type: 'trajectory:tool-sequence',
          value: ['search_orders', 'compose_reply'],
        },
        renderedValue: ['search_orders', 'compose_reply'],
      };

      const result = handleTrajectoryToolSequence(params);
      expect(result).toEqual({
        pass: true,
        score: 1,
        reason:
          'Observed tool sequence in order: tool:search_orders, tool:compose_reply. Actual tools: tool:search_orders, tool:search_inventory, tool:compose_reply',
        assertion: params.assertion,
      });
    });

    it('fails exact mode when there are additional tools', () => {
      const params: AssertionParams = {
        ...defaultParams,
        baseType: 'trajectory:tool-sequence',
        assertion: {
          type: 'trajectory:tool-sequence',
          value: {
            mode: 'exact',
            steps: ['search_orders', 'compose_reply'],
          },
        },
        renderedValue: {
          mode: 'exact',
          steps: ['search_orders', 'compose_reply'],
        },
      };

      const result = handleTrajectoryToolSequence(params);
      expect(result).toEqual({
        pass: false,
        score: 0,
        reason:
          'Expected exact tool sequence of search_orders, compose_reply, but actual tools were tool:search_orders, tool:search_inventory, tool:compose_reply',
        assertion: params.assertion,
      });
    });

    it('passes exact mode when the sequence exactly matches', () => {
      const params: AssertionParams = {
        ...defaultParams,
        assertionValueContext: {
          ...defaultParams.assertionValueContext,
          trace: {
            ...mockTraceData,
            spans: [
              {
                spanId: 'tool-1',
                name: 'tool.call',
                startTime: 1000,
                endTime: 1100,
                attributes: { 'tool.name': 'search_orders' },
              },
              {
                spanId: 'tool-2',
                name: 'tool.call',
                startTime: 1200,
                endTime: 1300,
                attributes: { 'tool.name': 'compose_reply' },
              },
            ],
          },
        },
        baseType: 'trajectory:tool-sequence',
        assertion: {
          type: 'trajectory:tool-sequence',
          value: {
            mode: 'exact',
            steps: ['search_orders', 'compose_reply'],
          },
        },
        renderedValue: {
          mode: 'exact',
          steps: ['search_orders', 'compose_reply'],
        },
      };

      const result = handleTrajectoryToolSequence(params);
      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Observed exact tool sequence: tool:search_orders, tool:compose_reply',
        assertion: params.assertion,
      });
    });

    it('fails when an in-order sequence is not observed', () => {
      const params: AssertionParams = {
        ...defaultParams,
        baseType: 'trajectory:tool-sequence',
        assertion: {
          type: 'trajectory:tool-sequence',
          value: ['compose_reply', 'search_orders'],
        },
        renderedValue: ['compose_reply', 'search_orders'],
      };

      const result = handleTrajectoryToolSequence(params);
      expect(result).toEqual({
        pass: false,
        score: 0,
        reason:
          'Expected tool "search_orders" was not observed in order. Actual tools: tool:search_orders, tool:search_inventory, tool:compose_reply',
        assertion: params.assertion,
      });
    });

    it('fails inverse sequence assertions when the forbidden sequence is present', () => {
      const params: AssertionParams = {
        ...defaultParams,
        inverse: true,
        baseType: 'trajectory:tool-sequence',
        assertion: {
          type: 'not-trajectory:tool-sequence',
          value: ['search_orders', 'compose_reply'],
        },
        renderedValue: ['search_orders', 'compose_reply'],
      };

      const result = handleTrajectoryToolSequence(params);
      expect(result).toEqual({
        pass: false,
        score: 0,
        reason:
          'Forbidden tool sequence was observed. Actual tools: tool:search_orders, tool:search_inventory, tool:compose_reply',
        assertion: params.assertion,
      });
    });

    it('passes inverse sequence assertions when the sequence is absent', () => {
      const params: AssertionParams = {
        ...defaultParams,
        inverse: true,
        baseType: 'trajectory:tool-sequence',
        assertion: {
          type: 'not-trajectory:tool-sequence',
          value: ['compose_reply', 'search_orders'],
        },
        renderedValue: ['compose_reply', 'search_orders'],
      };

      const result = handleTrajectoryToolSequence(params);
      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Forbidden tool sequence was not observed',
        assertion: params.assertion,
      });
    });

    it('rejects object steps without a name or pattern', () => {
      const params: AssertionParams = {
        ...defaultParams,
        baseType: 'trajectory:tool-sequence',
        assertion: {
          type: 'trajectory:tool-sequence',
          value: [{ type: 'tool' }, 'compose_reply'],
        },
        renderedValue: [{ type: 'tool' }, 'compose_reply'],
      };

      expect(() => handleTrajectoryToolSequence(params)).toThrow(
        'trajectory:tool-sequence assertion step 1 must include a name or pattern property',
      );
    });

    it('rejects invalid sequence values', () => {
      const params: AssertionParams = {
        ...defaultParams,
        baseType: 'trajectory:tool-sequence',
        assertion: {
          type: 'trajectory:tool-sequence',
          value: 'search_orders',
        },
        renderedValue: 'search_orders',
      };

      expect(() => handleTrajectoryToolSequence(params)).toThrow(
        'trajectory:tool-sequence assertion must have an array or object value',
      );
    });

    it('rejects empty sequence objects', () => {
      const params: AssertionParams = {
        ...defaultParams,
        baseType: 'trajectory:tool-sequence',
        assertion: {
          type: 'trajectory:tool-sequence',
          value: {
            steps: [],
          },
        },
        renderedValue: {
          steps: [],
        },
      };

      expect(() => handleTrajectoryToolSequence(params)).toThrow(
        'trajectory:tool-sequence assertion requires at least one expected step',
      );
    });
  });

  describe('trajectory:tool-args-match', () => {
    it('passes when a tool call contains the expected argument subset', () => {
      const params: AssertionParams = {
        ...defaultParams,
        baseType: 'trajectory:tool-args-match',
        assertion: {
          type: 'trajectory:tool-args-match',
          value: {
            name: 'search_orders',
            args: {
              order_id: '123',
            },
          },
        },
        renderedValue: {
          name: 'search_orders',
          args: {
            order_id: '123',
          },
        },
      };

      const result = handleTrajectoryToolArgsMatch(params);
      expect(result).toEqual({
        pass: true,
        score: 1,
        reason:
          'Tool "search_orders" matched expected arguments (partial) on tool:search_orders. Args: {"order_id":"123","include_history":false}',
        assertion: params.assertion,
      });
    });

    it('supports partial array matching for argument subsets', () => {
      const params: AssertionParams = {
        ...defaultParams,
        baseType: 'trajectory:tool-args-match',
        assertion: {
          type: 'trajectory:tool-args-match',
          value: {
            name: 'compose_reply',
            args: {
              citations: ['doc_1', 'doc_2'],
            },
          },
        },
        renderedValue: {
          name: 'compose_reply',
          args: {
            citations: ['doc_1', 'doc_2'],
          },
        },
      };

      const result = handleTrajectoryToolArgsMatch(params);
      expect(result).toEqual({
        pass: true,
        score: 1,
        reason:
          'Tool "compose_reply" matched expected arguments (partial) on tool:compose_reply. Args: {"tone":"friendly","citations":["doc_1","doc_2"]}',
        assertion: params.assertion,
      });
    });

    it('supports exact mode for argument matching', () => {
      const params: AssertionParams = {
        ...defaultParams,
        baseType: 'trajectory:tool-args-match',
        assertion: {
          type: 'trajectory:tool-args-match',
          value: {
            pattern: 'compose_*',
            mode: 'exact',
            arguments: {
              tone: 'friendly',
              citations: ['doc_1', 'doc_2'],
            },
          },
        },
        renderedValue: {
          pattern: 'compose_*',
          mode: 'exact',
          arguments: {
            tone: 'friendly',
            citations: ['doc_1', 'doc_2'],
          },
        },
      };

      const result = handleTrajectoryToolArgsMatch(params);
      expect(result).toEqual({
        pass: true,
        score: 1,
        reason:
          'Tool "compose_*" matched expected arguments (exact) on tool:compose_reply. Args: {"tone":"friendly","citations":["doc_1","doc_2"]}',
        assertion: params.assertion,
      });
    });

    it('matches Vercel AI SDK spans end-to-end against expected args', () => {
      const vercelTrace: TraceData = {
        ...mockTraceData,
        spans: [
          {
            spanId: 'vercel-span',
            name: 'ai.toolCall',
            startTime: 1000,
            endTime: 1100,
            attributes: {
              'ai.toolCall.name': 'lookup_customer',
              'ai.toolCall.args': '{"customer_id":"cust_1234","include_history":true}',
              'ai.toolCall.result': '{"plan":"pro"}',
            },
          },
        ],
      };
      const params: AssertionParams = {
        ...defaultParams,
        assertionValueContext: { ...defaultParams.assertionValueContext, trace: vercelTrace },
        baseType: 'trajectory:tool-args-match',
        assertion: {
          type: 'trajectory:tool-args-match',
          value: {
            name: 'lookup_customer',
            args: { customer_id: 'cust_1234' },
          },
        },
        renderedValue: {
          name: 'lookup_customer',
          args: { customer_id: 'cust_1234' },
        },
      };

      const result = handleTrajectoryToolArgsMatch(params);
      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('fails when no matching tool arguments satisfy the expectation', () => {
      const params: AssertionParams = {
        ...defaultParams,
        baseType: 'trajectory:tool-args-match',
        assertion: {
          type: 'trajectory:tool-args-match',
          value: {
            name: 'search_orders',
            args: {
              order_id: '999',
            },
          },
        },
        renderedValue: {
          name: 'search_orders',
          args: {
            order_id: '999',
          },
        },
      };

      const result = handleTrajectoryToolArgsMatch(params);
      expect(result).toEqual({
        pass: false,
        score: 0,
        reason:
          'No call to tool "search_orders" matched expected arguments (partial): {"order_id":"999"}. Observed args: {"order_id":"123","include_history":false}',
        assertion: params.assertion,
      });
    });

    it('fails when no tool call matches the requested tool', () => {
      const params: AssertionParams = {
        ...defaultParams,
        baseType: 'trajectory:tool-args-match',
        assertion: {
          type: 'trajectory:tool-args-match',
          value: {
            name: 'missing_tool',
            args: {
              order_id: '123',
            },
          },
        },
        renderedValue: {
          name: 'missing_tool',
          args: {
            order_id: '123',
          },
        },
      };

      const result = handleTrajectoryToolArgsMatch(params);
      expect(result).toEqual({
        pass: false,
        score: 0,
        reason:
          'No tool call matched "missing_tool". Actual tools: tool:search_orders, tool:search_inventory, tool:compose_reply',
        assertion: params.assertion,
      });
    });

    it('fails when the tool is present but no arguments were captured', () => {
      const params: AssertionParams = {
        ...defaultParams,
        assertionValueContext: {
          ...defaultParams.assertionValueContext,
          trace: {
            ...mockTraceData,
            spans: [
              {
                spanId: 'tool-without-args',
                name: 'tool.call',
                startTime: 1000,
                endTime: 1100,
                attributes: {
                  'tool.name': 'search_orders',
                },
              },
            ],
          },
        },
        baseType: 'trajectory:tool-args-match',
        assertion: {
          type: 'trajectory:tool-args-match',
          value: {
            name: 'search_orders',
            args: {
              order_id: '123',
            },
          },
        },
        renderedValue: {
          name: 'search_orders',
          args: {
            order_id: '123',
          },
        },
      };

      const result = handleTrajectoryToolArgsMatch(params);
      expect(result).toEqual({
        pass: false,
        score: 0,
        reason:
          'Tool "search_orders" was observed but no arguments were captured. Actual tools: tool:search_orders',
        assertion: params.assertion,
      });
    });

    it('supports inverse assertions', () => {
      const params: AssertionParams = {
        ...defaultParams,
        inverse: true,
        baseType: 'trajectory:tool-args-match',
        assertion: {
          type: 'not-trajectory:tool-args-match',
          value: {
            name: 'search_orders',
            args: {
              order_id: '123',
            },
          },
        },
        renderedValue: {
          name: 'search_orders',
          args: {
            order_id: '123',
          },
        },
      };

      const result = handleTrajectoryToolArgsMatch(params);
      expect(result).toEqual({
        pass: false,
        score: 0,
        reason:
          'Forbidden argument match for tool "search_orders" was observed on tool:search_orders. Args: {"order_id":"123","include_history":false}',
        assertion: params.assertion,
      });
    });

    it('passes inverse assertions when no tool call matches the requested tool', () => {
      const params: AssertionParams = {
        ...defaultParams,
        inverse: true,
        baseType: 'trajectory:tool-args-match',
        assertion: {
          type: 'not-trajectory:tool-args-match',
          value: {
            name: 'missing_tool',
            args: {
              order_id: '123',
            },
          },
        },
        renderedValue: {
          name: 'missing_tool',
          args: {
            order_id: '123',
          },
        },
      };

      const result = handleTrajectoryToolArgsMatch(params);
      expect(result).toEqual({
        pass: true,
        score: 1,
        reason:
          'Forbidden argument match for tool "missing_tool" was not observed because no tool call matched it',
        assertion: params.assertion,
      });
    });

    it('rejects values without args', () => {
      const params: AssertionParams = {
        ...defaultParams,
        baseType: 'trajectory:tool-args-match',
        assertion: {
          type: 'trajectory:tool-args-match',
          value: {
            name: 'search_orders',
          },
        },
        renderedValue: {
          name: 'search_orders',
        },
      };

      expect(() => handleTrajectoryToolArgsMatch(params)).toThrow(
        'trajectory:tool-args-match assertion must include an args or arguments property',
      );
    });

    it('rejects invalid mode values', () => {
      const params: AssertionParams = {
        ...defaultParams,
        baseType: 'trajectory:tool-args-match',
        assertion: {
          type: 'trajectory:tool-args-match',
          value: {
            name: 'search_orders',
            mode: 'excat',
            args: {
              order_id: '123',
            },
          },
        },
        renderedValue: {
          name: 'search_orders',
          mode: 'excat',
          args: {
            order_id: '123',
          },
        },
      };

      expect(() => handleTrajectoryToolArgsMatch(params)).toThrow(
        'trajectory:tool-args-match assertion mode must be "partial" or "exact"',
      );
    });

    it('rejects non-object argument match values', () => {
      const params: AssertionParams = {
        ...defaultParams,
        baseType: 'trajectory:tool-args-match',
        assertion: {
          type: 'trajectory:tool-args-match',
          value: 'search_orders',
        },
        renderedValue: 'search_orders',
      };

      expect(() => handleTrajectoryToolArgsMatch(params)).toThrow(
        'trajectory:tool-args-match assertion must have an object value',
      );
    });

    it('rejects argument matchers without a name or pattern', () => {
      const params: AssertionParams = {
        ...defaultParams,
        baseType: 'trajectory:tool-args-match',
        assertion: {
          type: 'trajectory:tool-args-match',
          value: {
            args: {
              order_id: '123',
            },
          },
        },
        renderedValue: {
          args: {
            order_id: '123',
          },
        },
      };

      expect(() => handleTrajectoryToolArgsMatch(params)).toThrow(
        'trajectory:tool-args-match assertion object must include a name or pattern property',
      );
    });

    describe('defaults', () => {
      it('passes in exact mode when an unexpected actual key matches a declared default', () => {
        const params: AssertionParams = {
          ...defaultParams,
          baseType: 'trajectory:tool-args-match',
          assertion: {
            type: 'trajectory:tool-args-match',
            value: {
              name: 'search_orders',
              mode: 'exact',
              args: { order_id: '123' },
              defaults: { include_history: false },
            },
          },
          renderedValue: {
            name: 'search_orders',
            mode: 'exact',
            args: { order_id: '123' },
            defaults: { include_history: false },
          },
        };

        const result = handleTrajectoryToolArgsMatch(params);
        expect(result).toEqual({
          pass: true,
          score: 1,
          reason:
            'Tool "search_orders" matched expected arguments (exact) on tool:search_orders. Args: {"order_id":"123","include_history":false}. Ignored default argument(s): include_history',
          assertion: params.assertion,
        });
      });

      it('fails in exact mode when an actual key value differs from the declared default', () => {
        const params: AssertionParams = {
          ...defaultParams,
          baseType: 'trajectory:tool-args-match',
          assertion: {
            type: 'trajectory:tool-args-match',
            value: {
              name: 'search_orders',
              mode: 'exact',
              args: { order_id: '123' },
              defaults: { include_history: true },
            },
          },
          renderedValue: {
            name: 'search_orders',
            mode: 'exact',
            args: { order_id: '123' },
            defaults: { include_history: true },
          },
        };

        const result = handleTrajectoryToolArgsMatch(params);
        expect(result.pass).toBe(false);
        expect(result.score).toBe(0);
        expect(result.reason).toContain(
          'No call to tool "search_orders" matched expected arguments',
        );
      });

      it('passes in exact mode when actual contains multiple keys all matching declared defaults', () => {
        const allDefaultsTrace: TraceData = {
          ...mockTraceData,
          spans: [
            {
              spanId: 'span-all-defaults',
              name: 'tool.call',
              startTime: 1000,
              endTime: 1100,
              attributes: {
                'tool.name': 'orders',
                'tool.arguments': '{"status":"Q","page":1,"page_size":5}',
              },
            },
          ],
        };
        const params: AssertionParams = {
          ...defaultParams,
          assertionValueContext: {
            ...defaultParams.assertionValueContext,
            trace: allDefaultsTrace,
          },
          baseType: 'trajectory:tool-args-match',
          assertion: {
            type: 'trajectory:tool-args-match',
            value: {
              name: 'orders',
              mode: 'exact',
              args: { status: 'Q' },
              defaults: { page: 1, page_size: 5 },
            },
          },
          renderedValue: {
            name: 'orders',
            mode: 'exact',
            args: { status: 'Q' },
            defaults: { page: 1, page_size: 5 },
          },
        };

        const result = handleTrajectoryToolArgsMatch(params);
        expect(result.pass).toBe(true);
      });

      it('passes in exact mode when actual omits a key listed in defaults', () => {
        const traceWithoutDefault: TraceData = {
          ...mockTraceData,
          spans: [
            {
              spanId: 'span-no-default',
              name: 'tool.call',
              startTime: 1000,
              endTime: 1100,
              attributes: {
                'tool.name': 'orders',
                'tool.arguments': '{"status":"Q"}',
              },
            },
          ],
        };
        const params: AssertionParams = {
          ...defaultParams,
          assertionValueContext: {
            ...defaultParams.assertionValueContext,
            trace: traceWithoutDefault,
          },
          baseType: 'trajectory:tool-args-match',
          assertion: {
            type: 'trajectory:tool-args-match',
            value: {
              name: 'orders',
              mode: 'exact',
              args: { status: 'Q' },
              defaults: { page: 1, page_size: 5 },
            },
          },
          renderedValue: {
            name: 'orders',
            mode: 'exact',
            args: { status: 'Q' },
            defaults: { page: 1, page_size: 5 },
          },
        };

        const result = handleTrajectoryToolArgsMatch(params);
        expect(result.pass).toBe(true);
      });

      it('fails in exact mode when actual contains a hallucinated key not in args or defaults', () => {
        const hallucinatedTrace: TraceData = {
          ...mockTraceData,
          spans: [
            {
              spanId: 'span-hallucinated',
              name: 'tool.call',
              startTime: 1000,
              endTime: 1100,
              attributes: {
                'tool.name': 'orders',
                'tool.arguments': '{"status":"Q","page":1,"delete_database":true}',
              },
            },
          ],
        };
        const params: AssertionParams = {
          ...defaultParams,
          assertionValueContext: {
            ...defaultParams.assertionValueContext,
            trace: hallucinatedTrace,
          },
          baseType: 'trajectory:tool-args-match',
          assertion: {
            type: 'trajectory:tool-args-match',
            value: {
              name: 'orders',
              mode: 'exact',
              args: { status: 'Q' },
              defaults: { page: 1 },
            },
          },
          renderedValue: {
            name: 'orders',
            mode: 'exact',
            args: { status: 'Q' },
            defaults: { page: 1 },
          },
        };

        const result = handleTrajectoryToolArgsMatch(params);
        expect(result.pass).toBe(false);
        expect(result.score).toBe(0);
        expect(result.reason).toContain('delete_database');
      });

      it('treats empty defaults the same as no defaults', () => {
        const params: AssertionParams = {
          ...defaultParams,
          baseType: 'trajectory:tool-args-match',
          assertion: {
            type: 'trajectory:tool-args-match',
            value: {
              name: 'search_orders',
              mode: 'exact',
              args: { order_id: '123' },
              defaults: {},
            },
          },
          renderedValue: {
            name: 'search_orders',
            mode: 'exact',
            args: { order_id: '123' },
            defaults: {},
          },
        };

        const result = handleTrajectoryToolArgsMatch(params);
        expect(result.pass).toBe(false);
      });

      it('supports defaults with structured values via deep equality', () => {
        const structuredTrace: TraceData = {
          ...mockTraceData,
          spans: [
            {
              spanId: 'span-structured',
              name: 'tool.call',
              startTime: 1000,
              endTime: 1100,
              attributes: {
                'tool.name': 'orders',
                'tool.arguments': '{"status":"Q","sort":{"field":"created","order":"desc"}}',
              },
            },
          ],
        };
        const params: AssertionParams = {
          ...defaultParams,
          assertionValueContext: {
            ...defaultParams.assertionValueContext,
            trace: structuredTrace,
          },
          baseType: 'trajectory:tool-args-match',
          assertion: {
            type: 'trajectory:tool-args-match',
            value: {
              name: 'orders',
              mode: 'exact',
              args: { status: 'Q' },
              defaults: { sort: { field: 'created', order: 'desc' } },
            },
          },
          renderedValue: {
            name: 'orders',
            mode: 'exact',
            args: { status: 'Q' },
            defaults: { sort: { field: 'created', order: 'desc' } },
          },
        };

        const result = handleTrajectoryToolArgsMatch(params);
        expect(result.pass).toBe(true);
      });

      it('still passes in partial mode when defaults are set', () => {
        const params: AssertionParams = {
          ...defaultParams,
          baseType: 'trajectory:tool-args-match',
          assertion: {
            type: 'trajectory:tool-args-match',
            value: {
              name: 'search_orders',
              args: { order_id: '123' },
              defaults: { include_history: false },
            },
          },
          renderedValue: {
            name: 'search_orders',
            args: { order_id: '123' },
            defaults: { include_history: false },
          },
        };

        const result = handleTrajectoryToolArgsMatch(params);
        expect(result.pass).toBe(true);
      });

      it('rejects malformed defaults (array)', () => {
        const params: AssertionParams = {
          ...defaultParams,
          baseType: 'trajectory:tool-args-match',
          assertion: {
            type: 'trajectory:tool-args-match',
            value: {
              name: 'search_orders',
              args: { order_id: '123' },
              defaults: ['include_history'] as unknown as Record<string, unknown>,
            },
          },
          renderedValue: {
            name: 'search_orders',
            args: { order_id: '123' },
            defaults: ['include_history'] as unknown as Record<string, unknown>,
          },
        };

        expect(() => handleTrajectoryToolArgsMatch(params)).toThrow(
          'trajectory:tool-args-match assertion defaults must be an object mapping argument names to default values',
        );
      });

      it('matches the documented outcome table row "status:Q, page:1" using the example config', () => {
        const docsTrace: TraceData = {
          ...mockTraceData,
          spans: [
            {
              spanId: 'span-docs-row-2',
              name: 'tool.call',
              startTime: 1000,
              endTime: 1100,
              attributes: {
                'tool.name': 'orders',
                'tool.arguments': '{"status":"Q","page":1}',
              },
            },
          ],
        };
        const params: AssertionParams = {
          ...defaultParams,
          assertionValueContext: { ...defaultParams.assertionValueContext, trace: docsTrace },
          baseType: 'trajectory:tool-args-match',
          assertion: {
            type: 'trajectory:tool-args-match',
            value: {
              name: 'orders',
              mode: 'exact',
              args: { status: 'Q' },
              defaults: { page: 1, page_size: 5 },
            },
          },
          renderedValue: {
            name: 'orders',
            mode: 'exact',
            args: { status: 'Q' },
            defaults: { page: 1, page_size: 5 },
          },
        };

        const result = handleTrajectoryToolArgsMatch(params);
        expect(result.pass).toBe(true);
      });

      it('matches the documented outcome table row "status:Q, page:2" using the example config', () => {
        const docsTrace: TraceData = {
          ...mockTraceData,
          spans: [
            {
              spanId: 'span-docs-row-4',
              name: 'tool.call',
              startTime: 1000,
              endTime: 1100,
              attributes: {
                'tool.name': 'orders',
                'tool.arguments': '{"status":"Q","page":2}',
              },
            },
          ],
        };
        const params: AssertionParams = {
          ...defaultParams,
          assertionValueContext: { ...defaultParams.assertionValueContext, trace: docsTrace },
          baseType: 'trajectory:tool-args-match',
          assertion: {
            type: 'trajectory:tool-args-match',
            value: {
              name: 'orders',
              mode: 'exact',
              args: { status: 'Q' },
              defaults: { page: 1, page_size: 5 },
            },
          },
          renderedValue: {
            name: 'orders',
            mode: 'exact',
            args: { status: 'Q' },
            defaults: { page: 1, page_size: 5 },
          },
        };

        const result = handleTrajectoryToolArgsMatch(params);
        expect(result.pass).toBe(false);
      });

      it('strips a null default value when actual emits null for that key', () => {
        const nullTrace: TraceData = {
          ...mockTraceData,
          spans: [
            {
              spanId: 'span-null-default',
              name: 'tool.call',
              startTime: 1000,
              endTime: 1100,
              attributes: {
                'tool.name': 'orders',
                'tool.arguments': '{"status":"Q","cursor":null}',
              },
            },
          ],
        };
        const params: AssertionParams = {
          ...defaultParams,
          assertionValueContext: { ...defaultParams.assertionValueContext, trace: nullTrace },
          baseType: 'trajectory:tool-args-match',
          assertion: {
            type: 'trajectory:tool-args-match',
            value: {
              name: 'orders',
              mode: 'exact',
              args: { status: 'Q' },
              defaults: { cursor: null },
            },
          },
          renderedValue: {
            name: 'orders',
            mode: 'exact',
            args: { status: 'Q' },
            defaults: { cursor: null },
          },
        };

        const result = handleTrajectoryToolArgsMatch(params);
        expect(result.pass).toBe(true);
      });

      it('strips a key listed in defaults even when args also declares it (defaults applied first)', () => {
        const collisionTrace: TraceData = {
          ...mockTraceData,
          spans: [
            {
              spanId: 'span-collision',
              name: 'tool.call',
              startTime: 1000,
              endTime: 1100,
              attributes: {
                'tool.name': 'orders',
                'tool.arguments': '{"status":"Q","page":1}',
              },
            },
          ],
        };
        const params: AssertionParams = {
          ...defaultParams,
          assertionValueContext: {
            ...defaultParams.assertionValueContext,
            trace: collisionTrace,
          },
          baseType: 'trajectory:tool-args-match',
          assertion: {
            type: 'trajectory:tool-args-match',
            value: {
              name: 'orders',
              mode: 'exact',
              args: { status: 'Q', page: 2 },
              defaults: { page: 1 },
            },
          },
          renderedValue: {
            name: 'orders',
            mode: 'exact',
            args: { status: 'Q', page: 2 },
            defaults: { page: 1 },
          },
        };

        const result = handleTrajectoryToolArgsMatch(params);
        expect(result.pass).toBe(false);
      });

      it('does not recurse into nested objects when stripping defaults (top-level only)', () => {
        const nestedTrace: TraceData = {
          ...mockTraceData,
          spans: [
            {
              spanId: 'span-nested-default',
              name: 'tool.call',
              startTime: 1000,
              endTime: 1100,
              attributes: {
                'tool.name': 'orders',
                'tool.arguments': '{"status":"Q","pagination":{"page":1}}',
              },
            },
          ],
        };
        const params: AssertionParams = {
          ...defaultParams,
          assertionValueContext: { ...defaultParams.assertionValueContext, trace: nestedTrace },
          baseType: 'trajectory:tool-args-match',
          assertion: {
            type: 'trajectory:tool-args-match',
            value: {
              name: 'orders',
              mode: 'exact',
              args: { status: 'Q' },
              defaults: { page: 1 },
            },
          },
          renderedValue: {
            name: 'orders',
            mode: 'exact',
            args: { status: 'Q' },
            defaults: { page: 1 },
          },
        };

        const result = handleTrajectoryToolArgsMatch(params);
        expect(result.pass).toBe(false);
      });

      it('inverts correctly when defaults allow an otherwise-forbidden match', () => {
        const params: AssertionParams = {
          ...defaultParams,
          inverse: true,
          baseType: 'trajectory:tool-args-match',
          assertion: {
            type: 'not-trajectory:tool-args-match',
            value: {
              name: 'search_orders',
              mode: 'exact',
              args: { order_id: '123' },
              defaults: { include_history: false },
            },
          },
          renderedValue: {
            name: 'search_orders',
            mode: 'exact',
            args: { order_id: '123' },
            defaults: { include_history: false },
          },
        };

        const result = handleTrajectoryToolArgsMatch(params);
        expect(result.pass).toBe(false);
        expect(result.reason).toContain('Forbidden argument match');
      });

      it('surfaces the stripped keys in the pass reason when multiple defaults are tolerated', () => {
        const allDefaultsTrace: TraceData = {
          ...mockTraceData,
          spans: [
            {
              spanId: 'span-reason-defaults',
              name: 'tool.call',
              startTime: 1000,
              endTime: 1100,
              attributes: {
                'tool.name': 'orders',
                'tool.arguments': '{"status":"Q","page":1,"page_size":5}',
              },
            },
          ],
        };
        const params: AssertionParams = {
          ...defaultParams,
          assertionValueContext: {
            ...defaultParams.assertionValueContext,
            trace: allDefaultsTrace,
          },
          baseType: 'trajectory:tool-args-match',
          assertion: {
            type: 'trajectory:tool-args-match',
            value: {
              name: 'orders',
              mode: 'exact',
              args: { status: 'Q' },
              defaults: { page: 1, page_size: 5 },
            },
          },
          renderedValue: {
            name: 'orders',
            mode: 'exact',
            args: { status: 'Q' },
            defaults: { page: 1, page_size: 5 },
          },
        };

        const result = handleTrajectoryToolArgsMatch(params);
        expect(result.pass).toBe(true);
        expect(result.reason).toContain('Ignored default argument(s): page, page_size');
      });

      it('does not append the ignored-defaults note when nothing was stripped', () => {
        const params: AssertionParams = {
          ...defaultParams,
          baseType: 'trajectory:tool-args-match',
          assertion: {
            type: 'trajectory:tool-args-match',
            value: {
              name: 'search_orders',
              mode: 'partial',
              args: { order_id: '123' },
              defaults: { include_history: true },
            },
          },
          renderedValue: {
            name: 'search_orders',
            mode: 'partial',
            args: { order_id: '123' },
            defaults: { include_history: true },
          },
        };

        // The observed call has include_history:false, which does not equal the
        // declared default (true), so nothing is stripped and no note is added.
        const result = handleTrajectoryToolArgsMatch(params);
        expect(result.pass).toBe(true);
        expect(result.reason).not.toContain('Ignored default');
      });

      it('does not let a hallucinated __proto__ argument escape exact matching when defaults are set', () => {
        const protoTrace: TraceData = {
          ...mockTraceData,
          spans: [
            {
              spanId: 'span-proto-default',
              name: 'tool.call',
              startTime: 1000,
              endTime: 1100,
              attributes: {
                'tool.name': 'orders',
                'tool.arguments': '{"status":"Q","__proto__":{"polluted":true}}',
              },
            },
          ],
        };
        const params: AssertionParams = {
          ...defaultParams,
          assertionValueContext: { ...defaultParams.assertionValueContext, trace: protoTrace },
          baseType: 'trajectory:tool-args-match',
          assertion: {
            type: 'trajectory:tool-args-match',
            value: {
              name: 'orders',
              mode: 'exact',
              args: { status: 'Q' },
              defaults: { page: 1 },
            },
          },
          renderedValue: {
            name: 'orders',
            mode: 'exact',
            args: { status: 'Q' },
            defaults: { page: 1 },
          },
        };

        // A non-default __proto__ key must be preserved through stripping so exact
        // mode still rejects it as a hallucinated extra (matching no-defaults behavior).
        const result = handleTrajectoryToolArgsMatch(params);
        expect(result.pass).toBe(false);
        // The prototype must not have been mutated by the stripping rebuild.
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      });

      it('fails in partial mode when a key in both args and defaults is stripped to nothing', () => {
        const collisionTrace: TraceData = {
          ...mockTraceData,
          spans: [
            {
              spanId: 'span-partial-collision',
              name: 'tool.call',
              startTime: 1000,
              endTime: 1100,
              attributes: {
                'tool.name': 'orders',
                'tool.arguments': '{"status":"Q","page":1}',
              },
            },
          ],
        };
        const params: AssertionParams = {
          ...defaultParams,
          assertionValueContext: { ...defaultParams.assertionValueContext, trace: collisionTrace },
          baseType: 'trajectory:tool-args-match',
          assertion: {
            type: 'trajectory:tool-args-match',
            value: {
              name: 'orders',
              // partial (default) mode; page is listed in BOTH args and defaults
              args: { status: 'Q', page: 1 },
              defaults: { page: 1 },
            },
          },
          renderedValue: {
            name: 'orders',
            args: { status: 'Q', page: 1 },
            defaults: { page: 1 },
          },
        };

        // Documented footgun: stripping removes page before the subset check, so the
        // explicitly-asserted page:1 can no longer be satisfied.
        const result = handleTrajectoryToolArgsMatch(params);
        expect(result.pass).toBe(false);
      });

      it('applies defaults when the expected payload uses the arguments alias', () => {
        const params: AssertionParams = {
          ...defaultParams,
          baseType: 'trajectory:tool-args-match',
          assertion: {
            type: 'trajectory:tool-args-match',
            value: {
              name: 'search_orders',
              mode: 'exact',
              arguments: { order_id: '123' },
              defaults: { include_history: false },
            },
          },
          renderedValue: {
            name: 'search_orders',
            mode: 'exact',
            arguments: { order_id: '123' },
            defaults: { include_history: false },
          },
        };

        const result = handleTrajectoryToolArgsMatch(params);
        expect(result.pass).toBe(true);
      });

      it('treats defaults as a no-op when the actual payload is a top-level array', () => {
        const arrayTrace: TraceData = {
          ...mockTraceData,
          spans: [
            {
              spanId: 'span-array-args',
              name: 'tool.call',
              startTime: 1000,
              endTime: 1100,
              attributes: {
                'tool.name': 'orders',
                'tool.arguments': '[1,2,3]',
              },
            },
          ],
        };
        const params: AssertionParams = {
          ...defaultParams,
          assertionValueContext: { ...defaultParams.assertionValueContext, trace: arrayTrace },
          baseType: 'trajectory:tool-args-match',
          assertion: {
            type: 'trajectory:tool-args-match',
            value: {
              name: 'orders',
              mode: 'exact',
              args: [1, 2, 3],
              defaults: { page: 1 },
            },
          },
          renderedValue: {
            name: 'orders',
            mode: 'exact',
            args: [1, 2, 3],
            defaults: { page: 1 },
          },
        };

        const result = handleTrajectoryToolArgsMatch(params);
        expect(result.pass).toBe(true);
      });

      it.each([
        ['null', null],
        ['string', 'include_history'],
        ['number', 1],
      ])('rejects malformed defaults (%s)', (_label, malformed) => {
        const params: AssertionParams = {
          ...defaultParams,
          baseType: 'trajectory:tool-args-match',
          assertion: {
            type: 'trajectory:tool-args-match',
            value: {
              name: 'search_orders',
              args: { order_id: '123' },
              defaults: malformed as unknown as Record<string, unknown>,
            },
          },
          renderedValue: {
            name: 'search_orders',
            args: { order_id: '123' },
            defaults: malformed as unknown as Record<string, unknown>,
          },
        };

        expect(() => handleTrajectoryToolArgsMatch(params)).toThrow(
          'trajectory:tool-args-match assertion defaults must be an object mapping argument names to default values',
        );
      });
    });

    describe('ignore', () => {
      const makeIgnoreParams = (
        toolArgs: Record<string, unknown> | unknown[] | string,
        value: Record<string, unknown>,
        inverse = false,
      ): AssertionParams => {
        const argsJson = typeof toolArgs === 'string' ? toolArgs : JSON.stringify(toolArgs);
        const trace: TraceData = {
          ...mockTraceData,
          spans: [
            {
              spanId: 'ignore-tool-call',
              name: 'tool.call',
              startTime: 1000,
              endTime: 1100,
              attributes: { 'tool.name': 'search_orders', 'tool.arguments': argsJson },
            },
          ],
        };
        return {
          ...defaultParams,
          inverse,
          assertionValueContext: { ...defaultParams.assertionValueContext, trace },
          baseType: 'trajectory:tool-args-match',
          assertion: { type: 'trajectory:tool-args-match', value },
          renderedValue: value,
        } as AssertionParams;
      };

      it('drops an ignored key regardless of value in exact mode', () => {
        const value = {
          name: 'search_orders',
          mode: 'exact',
          args: { status: 'Q' },
          ignore: ['request_id'],
        };

        expect(
          handleTrajectoryToolArgsMatch(makeIgnoreParams({ status: 'Q', request_id: 'a' }, value))
            .pass,
        ).toBe(true);
        expect(
          handleTrajectoryToolArgsMatch(makeIgnoreParams({ status: 'Q', request_id: 'z' }, value))
            .pass,
        ).toBe(true);
      });

      it('accepts a bare string ignore value', () => {
        const result = handleTrajectoryToolArgsMatch(
          makeIgnoreParams(
            { status: 'Q', request_id: 'abc' },
            { name: 'search_orders', mode: 'exact', args: { status: 'Q' }, ignore: 'request_id' },
          ),
        );
        expect(result.pass).toBe(true);
      });

      it('still fails on a non-ignored hallucinated argument', () => {
        const result = handleTrajectoryToolArgsMatch(
          makeIgnoreParams(
            { status: 'Q', request_id: 'abc', delete_database: true },
            { name: 'search_orders', mode: 'exact', args: { status: 'Q' }, ignore: ['request_id'] },
          ),
        );
        expect(result.pass).toBe(false);
      });

      it('strips the ignored key from the expected payload too', () => {
        // request_id is declared in args but ignored, so the agent omitting it still passes.
        const result = handleTrajectoryToolArgsMatch(
          makeIgnoreParams(
            { status: 'Q' },
            {
              name: 'search_orders',
              mode: 'exact',
              args: { status: 'Q', request_id: 'expected' },
              ignore: ['request_id'],
            },
          ),
        );
        expect(result.pass).toBe(true);
      });

      it('composes with defaults and reports both in the pass reason', () => {
        const result = handleTrajectoryToolArgsMatch(
          makeIgnoreParams(
            { status: 'Q', page: 1, request_id: 'abc' },
            {
              name: 'search_orders',
              mode: 'exact',
              args: { status: 'Q' },
              defaults: { page: 1 },
              ignore: ['request_id'],
            },
          ),
        );
        expect(result.pass).toBe(true);
        expect(result.reason).toContain('Ignored argument(s): request_id');
        expect(result.reason).toContain('Ignored default argument(s): page');
      });

      it('works in partial mode', () => {
        const result = handleTrajectoryToolArgsMatch(
          makeIgnoreParams(
            { status: 'Q', request_id: 'abc' },
            {
              name: 'search_orders',
              mode: 'partial',
              args: { status: 'Q' },
              ignore: ['request_id'],
            },
          ),
        );
        expect(result.pass).toBe(true);
      });

      it('inverts correctly', () => {
        const result = handleTrajectoryToolArgsMatch(
          makeIgnoreParams(
            { status: 'Q', request_id: 'abc' },
            { name: 'search_orders', mode: 'exact', args: { status: 'Q' }, ignore: ['request_id'] },
            true,
          ),
        );
        expect(result.pass).toBe(false);
      });

      it('does not let a hallucinated __proto__ argument escape exact matching', () => {
        const result = handleTrajectoryToolArgsMatch(
          makeIgnoreParams('{"status":"Q","__proto__":{"polluted":true},"request_id":"abc"}', {
            name: 'search_orders',
            mode: 'exact',
            args: { status: 'Q' },
            ignore: ['request_id'],
          }),
        );
        expect(result.pass).toBe(false);
      });

      it('treats ignore as a no-op when the actual payload is a top-level array', () => {
        const result = handleTrajectoryToolArgsMatch(
          makeIgnoreParams('["a","b"]', {
            name: 'search_orders',
            mode: 'exact',
            args: ['a', 'b'],
            ignore: ['request_id'],
          }),
        );
        expect(result.pass).toBe(true);
      });

      it('treats entries containing glob characters as key patterns', () => {
        const result = handleTrajectoryToolArgsMatch(
          makeIgnoreParams(
            { status: 'Q', request_id: 'a1', order_id: 'b2' },
            { name: 'search_orders', mode: 'exact', args: { status: 'Q' }, ignore: ['*_id'] },
          ),
        );
        expect(result.pass).toBe(true);
        expect(result.reason).toContain('Ignored argument(s): request_id, order_id');
      });

      it('still fails when a glob pattern does not cover a hallucinated key', () => {
        const result = handleTrajectoryToolArgsMatch(
          makeIgnoreParams(
            { status: 'Q', request_id: 'a1', delete_database: true },
            { name: 'search_orders', mode: 'exact', args: { status: 'Q' }, ignore: ['*_id'] },
          ),
        );
        expect(result.pass).toBe(false);
      });

      it('supports single-character ? glob patterns', () => {
        const result = handleTrajectoryToolArgsMatch(
          makeIgnoreParams(
            { status: 'Q', v1: 'x' },
            { name: 'search_orders', mode: 'exact', args: { status: 'Q' }, ignore: ['v?'] },
          ),
        );
        expect(result.pass).toBe(true);
      });

      it('treats a plain entry as an exact match, not a substring or pattern', () => {
        // "request" must not strip "request_id"; only an exact key or glob does.
        const result = handleTrajectoryToolArgsMatch(
          makeIgnoreParams(
            { status: 'Q', request_id: 'a1' },
            { name: 'search_orders', mode: 'exact', args: { status: 'Q' }, ignore: ['request'] },
          ),
        );
        expect(result.pass).toBe(false);
      });

      it.each([
        ['number', [5]],
        ['empty string', ['']],
        ['null', [null]],
        ['object', [{ request_id: true }]],
      ])('rejects malformed ignore entries (%s)', (_label, malformed) => {
        const params = makeIgnoreParams(
          { status: 'Q' },
          {
            name: 'search_orders',
            mode: 'exact',
            args: { status: 'Q' },
            ignore: malformed as unknown as string[],
          },
        );
        expect(() => handleTrajectoryToolArgsMatch(params)).toThrow(
          'trajectory:tool-args-match assertion ignore must be a non-empty string or an array of non-empty strings',
        );
      });
    });
  });

  describe('trajectory:step-count', () => {
    it('counts steps by type', () => {
      const params: AssertionParams = {
        ...defaultParams,
        baseType: 'trajectory:step-count',
        assertion: {
          type: 'trajectory:step-count',
          value: {
            type: 'command',
            min: 1,
            max: 1,
          },
        },
        renderedValue: {
          type: 'command',
          min: 1,
          max: 1,
        },
      };

      const result = handleTrajectoryStepCount(params);
      expect(result).toEqual({
        pass: true,
        score: 1,
        reason:
          'Matched 1 trajectory step(s) for type=command (expected 1-1). Matches: command:ls -la',
        assertion: params.assertion,
      });
    });

    it('counts steps by pattern', () => {
      const params: AssertionParams = {
        ...defaultParams,
        baseType: 'trajectory:step-count',
        assertion: {
          type: 'trajectory:step-count',
          value: {
            pattern: 'reasoning*',
            min: 1,
          },
        },
        renderedValue: {
          pattern: 'reasoning*',
          min: 1,
        },
      };

      const result = handleTrajectoryStepCount(params);
      expect(result).toEqual({
        pass: true,
        score: 1,
        reason:
          'Matched 1 trajectory step(s) for pattern=reasoning* (expected at least 1). Matches: reasoning:reasoning_plan',
        assertion: params.assertion,
      });
    });

    it('supports max-only count assertions', () => {
      const params: AssertionParams = {
        ...defaultParams,
        baseType: 'trajectory:step-count',
        assertion: {
          type: 'trajectory:step-count',
          value: {
            type: 'tool',
            max: 3,
          },
        },
        renderedValue: {
          type: 'tool',
          max: 3,
        },
      };

      const result = handleTrajectoryStepCount(params);
      expect(result).toEqual({
        pass: true,
        score: 1,
        reason:
          'Matched 3 trajectory step(s) for type=tool (expected at most 3). Matches: tool:search_orders, tool:search_inventory, tool:compose_reply',
        assertion: params.assertion,
      });
    });

    it('supports inverse count assertions', () => {
      const params: AssertionParams = {
        ...defaultParams,
        inverse: true,
        baseType: 'trajectory:step-count',
        assertion: {
          type: 'not-trajectory:step-count',
          value: {
            type: 'tool',
            min: 4,
          },
        },
        renderedValue: {
          type: 'tool',
          min: 4,
        },
      };

      const result = handleTrajectoryStepCount(params);
      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Trajectory step count did not satisfy the forbidden range',
        assertion: params.assertion,
      });
    });

    it('rejects count assertions without min or max', () => {
      const params: AssertionParams = {
        ...defaultParams,
        baseType: 'trajectory:step-count',
        assertion: {
          type: 'trajectory:step-count',
          value: {
            type: 'tool',
          },
        },
        renderedValue: {
          type: 'tool',
        },
      };

      expect(() => handleTrajectoryStepCount(params)).toThrow(
        'trajectory:step-count assertion must include a min or max property',
      );
    });

    it('rejects non-object count assertions', () => {
      const params: AssertionParams = {
        ...defaultParams,
        baseType: 'trajectory:step-count',
        assertion: {
          type: 'trajectory:step-count',
          value: 'tool',
        },
        renderedValue: 'tool',
      };

      expect(() => handleTrajectoryStepCount(params)).toThrow(
        'trajectory:step-count assertion must have an object value',
      );
    });
  });
});
