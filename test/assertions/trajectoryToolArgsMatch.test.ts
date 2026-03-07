import { describe, expect, it } from 'vitest';
import { handleTrajectoryToolArgsMatch } from '../../src/assertions/trajectoryToolArgsMatch';

import type { ApiProvider, AssertionParams, AtomicTestCase } from '../../src/types/index';

const mockProvider: ApiProvider = {
  id: () => 'mock',
  callApi: async () => ({ output: 'mock' }),
};

const createParams = (
  output: unknown,
  value: unknown,
  options: { inverse?: boolean } = {},
): AssertionParams => ({
  baseType: 'trajectory:tool-args-match' as const,
  assertionValueContext: {
    vars: {},
    test: {} as AtomicTestCase,
    prompt: 'test prompt',
    logProbs: undefined,
    provider: mockProvider,
    providerResponse: { output: output as string | object },
  },
  output: output as string | object,
  outputString: typeof output === 'string' ? output : JSON.stringify(output),
  providerResponse: { output: output as string | object },
  test: {} as AtomicTestCase,
  assertion: { type: 'trajectory:tool-args-match', value: value as any },
  renderedValue: value as any,
  inverse: options.inverse ?? false,
});

describe('handleTrajectoryToolArgsMatch', () => {
  it('should pass when tool args match exactly', () => {
    const output = {
      tool_calls: [
        { function: { name: 'search_orders', arguments: '{"order_id":"123","customer":"alice"}' } },
      ],
    };
    const params = createParams(output, {
      tool: 'search_orders',
      args: { order_id: '123', customer: 'alice' },
    });
    const result = handleTrajectoryToolArgsMatch(params);

    expect(result.pass).toBe(true);
    expect(result.reason).toContain('matching args');
  });

  it('should pass with partial arg match (extra args allowed)', () => {
    const output = {
      tool_calls: [
        {
          function: {
            name: 'search_orders',
            arguments: '{"order_id":"123","customer":"alice","limit":10}',
          },
        },
      ],
    };
    const params = createParams(output, {
      tool: 'search_orders',
      args: { order_id: '123' },
    });
    const result = handleTrajectoryToolArgsMatch(params);

    expect(result.pass).toBe(true);
  });

  it('should fail when args do not match', () => {
    const output = {
      tool_calls: [{ function: { name: 'search_orders', arguments: '{"order_id":"456"}' } }],
    };
    const params = createParams(output, {
      tool: 'search_orders',
      args: { order_id: '123' },
    });
    const result = handleTrajectoryToolArgsMatch(params);

    expect(result.pass).toBe(false);
    expect(result.reason).toContain('Closest call mismatched');
    expect(result.reason).toContain('order_id');
  });

  it('should fail when tool is not called', () => {
    const output = {
      tool_calls: [{ function: { name: 'other_tool', arguments: '{}' } }],
    };
    const params = createParams(output, {
      tool: 'search_orders',
      args: { order_id: '123' },
    });
    const result = handleTrajectoryToolArgsMatch(params);

    expect(result.pass).toBe(false);
    expect(result.reason).toContain('was not called');
  });

  it('should match any call when tool is called multiple times', () => {
    const output = {
      tool_calls: [
        { function: { name: 'search', arguments: '{"query":"wrong"}' } },
        { function: { name: 'search', arguments: '{"query":"right"}' } },
      ],
    };
    const params = createParams(output, {
      tool: 'search',
      args: { query: 'right' },
    });
    const result = handleTrajectoryToolArgsMatch(params);

    expect(result.pass).toBe(true);
  });

  it('should support inverse assertion', () => {
    const output = {
      tool_calls: [{ function: { name: 'search', arguments: '{"query":"test"}' } }],
    };
    const params = createParams(
      output,
      { tool: 'search', args: { query: 'dangerous' } },
      { inverse: true },
    );
    const result = handleTrajectoryToolArgsMatch(params);

    expect(result.pass).toBe(true);
  });

  it('should handle nested object args', () => {
    const output = {
      tool_calls: [
        {
          function: {
            name: 'api_call',
            arguments: '{"config":{"timeout":30,"retries":3}}',
          },
        },
      ],
    };
    const params = createParams(output, {
      tool: 'api_call',
      args: { config: { timeout: 30, retries: 3 } },
    });
    const result = handleTrajectoryToolArgsMatch(params);

    expect(result.pass).toBe(true);
  });

  it('should handle array args', () => {
    const output = {
      tool_calls: [{ function: { name: 'batch', arguments: '{"ids":["a","b","c"]}' } }],
    };
    const params = createParams(output, {
      tool: 'batch',
      args: { ids: ['a', 'b', 'c'] },
    });
    const result = handleTrajectoryToolArgsMatch(params);

    expect(result.pass).toBe(true);
  });

  it('should work with metadata.toolCalls', () => {
    const output = 'text output';
    const params = createParams(output, {
      tool: 'search',
      args: { query: 'test' },
    });
    params.providerResponse = {
      output: 'text output',
      metadata: {
        toolCalls: [
          { id: '1', name: 'search', input: { query: 'test' }, output: '', is_error: false },
        ],
      },
    };
    const result = handleTrajectoryToolArgsMatch(params);

    expect(result.pass).toBe(true);
  });
});
