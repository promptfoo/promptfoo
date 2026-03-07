import { describe, expect, it, vi } from 'vitest';
import { handleTrajectoryGoalAchieved } from '../../src/assertions/trajectoryGoalAchieved';

import type { ApiProvider, AssertionParams, AtomicTestCase } from '../../src/types/index';

// Mock the matchers module
vi.mock('../../src/matchers', () => ({
  matchesLlmRubric: vi.fn(),
}));

import { matchesLlmRubric } from '../../src/matchers';

const mockProvider: ApiProvider = {
  id: () => 'mock',
  callApi: async () => ({ output: 'mock' }),
};

const createParams = (output: unknown, goal: string): AssertionParams => ({
  baseType: 'trajectory:goal-achieved' as const,
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
  assertion: { type: 'trajectory:goal-achieved', value: goal },
  renderedValue: goal,
  inverse: false,
});

describe('handleTrajectoryGoalAchieved', () => {
  it('should call matchesLlmRubric with trajectory summary including tool calls', async () => {
    const mockedMatchesLlmRubric = vi.mocked(matchesLlmRubric);
    mockedMatchesLlmRubric.mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'Goal achieved',
    });

    const output = {
      tool_calls: [
        { function: { name: 'search_orders', arguments: '{"order_id":"123"}' } },
        { function: { name: 'compose_reply', arguments: '{"text":"found"}' } },
      ],
    };
    const params = createParams(output, 'Agent found the order and replied');

    const result = await handleTrajectoryGoalAchieved(params);

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);

    // Verify the rubric passed to matchesLlmRubric contains trajectory info
    const rubricArg = mockedMatchesLlmRubric.mock.calls[0][0];
    expect(rubricArg).toContain('Agent found the order and replied');
    expect(rubricArg).toContain('search_orders');
    expect(rubricArg).toContain('compose_reply');
    expect(rubricArg).toContain('Tool Calls');
  });

  it('should include "No tools were called" when output has no tool calls', async () => {
    const mockedMatchesLlmRubric = vi.mocked(matchesLlmRubric);
    mockedMatchesLlmRubric.mockResolvedValue({
      pass: false,
      score: 0,
      reason: 'Goal not achieved',
    });

    const params = createParams('Just a text response', 'Agent should use tools');

    await handleTrajectoryGoalAchieved(params);

    const rubricArg = mockedMatchesLlmRubric.mock.calls[0][0];
    expect(rubricArg).toContain('No tools were called');
  });

  it('should pass output string to matchesLlmRubric', async () => {
    const mockedMatchesLlmRubric = vi.mocked(matchesLlmRubric);
    mockedMatchesLlmRubric.mockResolvedValue({
      pass: true,
      score: 0.8,
      reason: 'Partially achieved',
    });

    const params = createParams('The order status is shipped', 'Agent provided order status');

    const result = await handleTrajectoryGoalAchieved(params);

    expect(result.score).toBe(0.8);
    // Second argument to matchesLlmRubric is the output
    expect(mockedMatchesLlmRubric.mock.calls[0][1]).toBe('The order status is shipped');
  });

  it('should work with metadata.toolCalls', async () => {
    const mockedMatchesLlmRubric = vi.mocked(matchesLlmRubric);
    mockedMatchesLlmRubric.mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'Goal achieved',
    });

    const params = createParams('text output', 'Agent used search tool');
    params.providerResponse = {
      output: 'text output',
      metadata: {
        toolCalls: [
          { id: '1', name: 'search', input: { query: 'test' }, output: '', is_error: false },
        ],
      },
    };

    await handleTrajectoryGoalAchieved(params);

    const rubricArg = mockedMatchesLlmRubric.mock.calls[0][0];
    expect(rubricArg).toContain('search');
    expect(rubricArg).toContain('query');
  });
});
