import { describe, expect, it } from 'vitest';
import {
  handleTrajectoryStepCount,
  handleTrajectoryToolArgsMatch,
  handleTrajectoryToolSequence,
  handleTrajectoryToolSet,
  handleTrajectoryToolUsed,
} from '../../src/assertions/trajectory';
import {
  extractTrajectorySteps,
  setCommandToolNames,
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

    try {
      setCommandToolNames(['bash']);
      const steps = extractTrajectorySteps(customShellTrace);
      expect(steps[0].type).toBe('command');
      // The command argument should also be reflected in the step name.
      expect(steps[0].name).toBe('pytest tests/');
    } finally {
      // Reset to defaults so other tests aren't polluted.
      setCommandToolNames([]);
    }
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

  describe('trajectory:tool-set', () => {
    const setTrace: TraceData = {
      traceId: 'set-trace',
      evaluationId: 'eval-1',
      testCaseId: 'tc-1',
      metadata: {},
      spans: [
        {
          spanId: 'a',
          name: 'tool.call',
          startTime: 100,
          endTime: 110,
          attributes: { 'tool.name': 'rerank' },
        },
        {
          spanId: 'b',
          name: 'tool.call',
          startTime: 120,
          endTime: 130,
          attributes: { 'tool.name': 'search_corpus' },
        },
        {
          spanId: 'c',
          name: 'tool.call',
          startTime: 140,
          endTime: 150,
          attributes: { 'tool.name': 'fetch_document' },
        },
      ],
    };

    const baseSetParams = {
      ...defaultParams,
      assertionValueContext: { ...defaultParams.assertionValueContext, trace: setTrace },
      baseType: 'trajectory:tool-set' as const,
    };

    it('passes when all expected tools are present in any order (subset default)', () => {
      const params: AssertionParams = {
        ...baseSetParams,
        assertion: {
          type: 'trajectory:tool-set',
          value: ['fetch_document', 'search_corpus', 'rerank'],
        },
        renderedValue: ['fetch_document', 'search_corpus', 'rerank'],
      };
      const result = handleTrajectoryToolSet(params);
      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
      expect(result.reason).toContain('Observed expected tool set (mode=subset)');
    });

    it('fails when an expected tool is missing', () => {
      const params: AssertionParams = {
        ...baseSetParams,
        assertion: {
          type: 'trajectory:tool-set',
          value: { tools: ['search_corpus', 'rerank', 'web_search'] },
        },
        renderedValue: { tools: ['search_corpus', 'rerank', 'web_search'] },
      };
      const result = handleTrajectoryToolSet(params);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('Missing expected tools: web_search');
    });

    it('fails mode=exact when extra tools are present', () => {
      const params: AssertionParams = {
        ...baseSetParams,
        assertion: {
          type: 'trajectory:tool-set',
          value: { tools: ['search_corpus', 'rerank'], mode: 'exact' },
        },
        renderedValue: { tools: ['search_corpus', 'rerank'], mode: 'exact' },
      };
      const result = handleTrajectoryToolSet(params);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('Unexpected tools observed under mode=exact');
      expect(result.reason).toContain('fetch_document');
    });

    it('inverts the result for not-trajectory:tool-set', () => {
      const params: AssertionParams = {
        ...baseSetParams,
        inverse: true,
        assertion: {
          type: 'not-trajectory:tool-set',
          value: ['rerank', 'search_corpus', 'fetch_document'],
        },
        renderedValue: ['rerank', 'search_corpus', 'fetch_document'],
      };
      const result = handleTrajectoryToolSet(params);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('Forbidden tool set was satisfied');
    });

    it('rejects an empty tools array', () => {
      const params: AssertionParams = {
        ...baseSetParams,
        assertion: { type: 'trajectory:tool-set', value: [] },
        renderedValue: [],
      };
      expect(() => handleTrajectoryToolSet(params)).toThrow(
        'trajectory:tool-set assertion requires at least one expected tool',
      );
    });

    it('rejects an unknown mode', () => {
      const params: AssertionParams = {
        ...baseSetParams,
        assertion: {
          type: 'trajectory:tool-set',
          value: { tools: ['search_corpus'], mode: 'fuzzy' as unknown as 'subset' },
        },
        renderedValue: { tools: ['search_corpus'], mode: 'fuzzy' as unknown as 'subset' },
      };
      expect(() => handleTrajectoryToolSet(params)).toThrow(
        'trajectory:tool-set assertion mode must be "subset" or "exact"',
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

    it('redacts args in failure reasons when redactArgsInFailures is true', () => {
      const params: AssertionParams = {
        ...defaultParams,
        assertionValueContext: {
          ...defaultParams.assertionValueContext,
          trace: {
            traceId: 'sensitive-args',
            evaluationId: 'eval-1',
            testCaseId: 'tc-1',
            metadata: {},
            spans: [
              {
                spanId: 'tool-1',
                name: 'tool.call',
                startTime: 100,
                endTime: 200,
                attributes: {
                  'tool.name': 'lookup_user',
                  'tool.arguments': JSON.stringify({ ssn: '123-45-6789', tenant: 'public' }),
                },
              },
            ],
          },
        },
        baseType: 'trajectory:tool-args-match',
        assertion: {
          type: 'trajectory:tool-args-match',
          value: {
            name: 'lookup_user',
            args: { tenant: 'private' },
            mode: 'partial',
            redactArgsInFailures: true,
          },
        },
        renderedValue: {
          name: 'lookup_user',
          args: { tenant: 'private' },
          mode: 'partial',
          redactArgsInFailures: true,
        },
      };

      const result = handleTrajectoryToolArgsMatch(params);
      expect(result.pass).toBe(false);
      // The expected and observed args must NOT appear verbatim in the reason.
      expect(result.reason).not.toContain('123-45-6789');
      expect(result.reason).not.toContain('private');
      expect(result.reason).not.toContain('public');
      expect(result.reason).toContain('[redacted]');
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
