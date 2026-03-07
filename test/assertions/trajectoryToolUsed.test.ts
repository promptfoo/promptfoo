import { describe, expect, it } from 'vitest';
import { handleTrajectoryToolUsed } from '../../src/assertions/trajectoryToolUsed';

import type { ApiProvider, AssertionParams, AtomicTestCase } from '../../src/types/index';

const mockProvider: ApiProvider = {
  id: () => 'mock',
  callApi: async () => ({ output: 'mock' }),
};

const createParams = (
  output: unknown,
  expectedTools: string | string[],
  options: { inverse?: boolean } = {},
): AssertionParams => ({
  baseType: 'trajectory:tool-used' as const,
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
  assertion: { type: 'trajectory:tool-used', value: expectedTools },
  renderedValue: expectedTools,
  inverse: options.inverse ?? false,
});

describe('handleTrajectoryToolUsed', () => {
  it('should pass when single expected tool is used', () => {
    const output = {
      tool_calls: [
        { function: { name: 'search_orders', arguments: '{}' } },
        { function: { name: 'compose_reply', arguments: '{}' } },
      ],
    };
    const params = createParams(output, 'search_orders');
    const result = handleTrajectoryToolUsed(params);

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
    expect(result.reason).toContain('All expected tools');
  });

  it('should pass when all expected tools are used', () => {
    const output = {
      tool_calls: [
        { function: { name: 'search_orders', arguments: '{}' } },
        { function: { name: 'get_customer', arguments: '{}' } },
        { function: { name: 'compose_reply', arguments: '{}' } },
      ],
    };
    const params = createParams(output, ['search_orders', 'get_customer']);
    const result = handleTrajectoryToolUsed(params);

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });

  it('should fail when expected tool is not used', () => {
    const output = {
      tool_calls: [{ function: { name: 'compose_reply', arguments: '{}' } }],
    };
    const params = createParams(output, 'search_orders');
    const result = handleTrajectoryToolUsed(params);

    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toContain('search_orders');
    expect(result.reason).toContain('were not used');
  });

  it('should fail when some expected tools are missing', () => {
    const output = {
      tool_calls: [{ function: { name: 'search_orders', arguments: '{}' } }],
    };
    const params = createParams(output, ['search_orders', 'get_customer']);
    const result = handleTrajectoryToolUsed(params);

    expect(result.pass).toBe(false);
    expect(result.reason).toContain('get_customer');
  });

  it('should fail when no tools are called', () => {
    const output = 'plain text response';
    const params = createParams(output, 'search_orders');
    const result = handleTrajectoryToolUsed(params);

    expect(result.pass).toBe(false);
    expect(result.reason).toContain('(none)');
  });

  it('should support inverse (not-trajectory:tool-used)', () => {
    const output = {
      tool_calls: [{ function: { name: 'compose_reply', arguments: '{}' } }],
    };
    const params = createParams(output, 'dangerous_tool', { inverse: true });
    const result = handleTrajectoryToolUsed(params);

    expect(result.pass).toBe(true);
    expect(result.reason).toContain('None of the specified tools');
  });

  it('should fail inverse when tool IS used', () => {
    const output = {
      tool_calls: [{ function: { name: 'dangerous_tool', arguments: '{}' } }],
    };
    const params = createParams(output, 'dangerous_tool', { inverse: true });
    const result = handleTrajectoryToolUsed(params);

    expect(result.pass).toBe(false);
    expect(result.reason).toContain('NOT be used');
  });

  it('should work with metadata.toolCalls', () => {
    const output = 'text output';
    const params = createParams(output, 'search');
    params.providerResponse = {
      output: 'text output',
      metadata: {
        toolCalls: [{ id: '1', name: 'search', input: {}, output: '', is_error: false }],
      },
    };
    const result = handleTrajectoryToolUsed(params);

    expect(result.pass).toBe(true);
  });
});
