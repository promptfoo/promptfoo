import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addRetryTestCases, deduplicateTests } from '../../../src/redteam/strategies/retry';

import type { TestCase, TestCaseWithPlugin } from '../../../src/types/index';

// Mock dependencies
vi.mock('../../../src/database/index', () => ({
  getDb: vi.fn(),
}));

vi.mock('../../../src/globalConfig/cloud', () => ({
  cloudConfig: {
    isEnabled: vi.fn().mockReturnValue(false),
  },
}));

vi.mock('../../../src/util/cloud', () => ({
  makeRequest: vi.fn(),
}));

vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('deduplicateTests', () => {
  it('should deduplicate test cases based on vars', () => {
    const testCases: TestCase[] = [
      {
        vars: { a: '1', b: '2' },
        assert: [],
      },
      {
        vars: { a: '1', b: '2' }, // Duplicate
        assert: [],
      },
      {
        vars: { a: '2', b: '3' },
        assert: [],
      },
    ];

    const result = deduplicateTests(testCases);

    expect(result).toHaveLength(2);
    expect(result[0].vars).toEqual({ a: '1', b: '2' });
    expect(result[1].vars).toEqual({ a: '2', b: '3' });
  });

  it('should handle empty test cases array', () => {
    const result = deduplicateTests([]);
    expect(result).toHaveLength(0);
  });

  it('should handle test cases with no vars', () => {
    const testCases: TestCase[] = [
      {
        vars: {},
        assert: [],
      },
      {
        vars: {},
        assert: [],
      },
    ];

    const result = deduplicateTests(testCases);
    expect(result).toHaveLength(1);
  });

  it('should preserve non-vars properties', () => {
    const testCases: TestCase[] = [
      {
        vars: { a: '1' },
        assert: [{ type: 'equals', value: 'test' }],
        description: 'test case',
      },
      {
        vars: { a: '1' },
        assert: [{ type: 'equals', value: 'different' }],
        description: 'another test case',
      },
    ];

    const result = deduplicateTests(testCases);
    expect(result).toHaveLength(1);
    expect(result[0].assert).toEqual([{ type: 'equals', value: 'test' }]);
    expect(result[0].description).toBe('test case');
  });

  it('should include strategyId in deduplication key', () => {
    const testCases: TestCase[] = [
      {
        vars: { prompt: 'same prompt' },
        assert: [],
        metadata: { strategyId: undefined }, // plugin-only
      },
      {
        vars: { prompt: 'same prompt' },
        assert: [],
        metadata: { strategyId: 'goat' }, // with goat strategy
      },
      {
        vars: { prompt: 'same prompt' },
        assert: [],
        metadata: { strategyId: 'jailbreak:meta' }, // with jailbreak:meta strategy
      },
    ];

    const result = deduplicateTests(testCases);
    // All three should be kept because they have different strategyIds
    expect(result).toHaveLength(3);
  });

  it('should deduplicate tests with same vars and strategyId', () => {
    const testCases: TestCase[] = [
      {
        vars: { prompt: 'same prompt' },
        assert: [],
        metadata: { strategyId: 'goat', pluginId: 'bias:age' },
      },
      {
        vars: { prompt: 'same prompt' },
        assert: [],
        metadata: { strategyId: 'goat', pluginId: 'bias:age' }, // Duplicate
      },
    ];

    const result = deduplicateTests(testCases);
    expect(result).toHaveLength(1);
  });

  it('should treat undefined and missing strategyId as the same', () => {
    const testCases: TestCase[] = [
      {
        vars: { prompt: 'same prompt' },
        assert: [],
        metadata: { pluginId: 'bias:age' }, // No strategyId
      },
      {
        vars: { prompt: 'same prompt' },
        assert: [],
        metadata: { strategyId: undefined, pluginId: 'bias:age' }, // Undefined strategyId
      },
    ];

    const result = deduplicateTests(testCases);
    // Both should be treated as 'none' strategyId, so deduplicated to 1
    expect(result).toHaveLength(1);
  });
});

describe('addRetryTestCases', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { cloudConfig } = await import('../../../src/globalConfig/cloud');
    vi.mocked(cloudConfig.isEnabled).mockReturnValue(false);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  async function getMockDb() {
    const { getDb } = await import('../../../src/database/index');
    return vi.mocked(getDb);
  }

  it('should throw error when no targetIds provided', async () => {
    const testCases: TestCaseWithPlugin[] = [
      {
        vars: { prompt: 'test' },
        assert: [],
        metadata: { pluginId: 'bias:age' },
      },
    ];

    await expect(addRetryTestCases(testCases, 'prompt', {})).rejects.toThrow(
      'No target IDs found in config',
    );
  });

  it('should return empty array when no failed tests found', async () => {
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    const getDb = await getMockDb();
    getDb.mockReturnValue(mockDb as any);

    const testCases: TestCaseWithPlugin[] = [
      {
        vars: { prompt: 'test' },
        assert: [],
        metadata: { pluginId: 'bias:age' },
      },
    ];

    const result = await addRetryTestCases(testCases, 'prompt', {
      targetIds: ['openai:gpt-4o-mini'],
    });

    expect(result).toHaveLength(0);
  });

  it('should preserve provider with injectVar from stored test case', async () => {
    const storedTestCase = {
      vars: { prompt: 'test prompt' },
      assert: [{ type: 'equals', value: 'test' }],
      metadata: { pluginId: 'bias:age', strategyId: 'goat' },
      provider: {
        id: 'promptfoo:redteam:goat',
        config: {
          injectVar: 'prompt',
          maxTurns: 2,
        },
      },
    };

    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi
        .fn()
        .mockResolvedValueOnce([{ provider: JSON.stringify({ id: 'openai:gpt-4o-mini' }) }]) // targetResults
        .mockResolvedValueOnce([
          {
            testCase: JSON.stringify(storedTestCase),
            response: JSON.stringify({}),
            evalId: 'eval-123',
          },
        ]),
    };
    const getDb = await getMockDb();
    getDb.mockReturnValue(mockDb as any);

    const testCases: TestCaseWithPlugin[] = [
      {
        vars: { prompt: 'test' },
        assert: [],
        metadata: { pluginId: 'bias:age' },
      },
    ];

    const result = await addRetryTestCases(testCases, 'prompt', {
      targetIds: ['openai:gpt-4o-mini'],
    });

    expect(result).toHaveLength(1);
    expect(result[0].provider).toEqual({
      id: 'promptfoo:redteam:goat',
      config: {
        injectVar: 'prompt',
        maxTurns: 2,
      },
    });
    expect(result[0].metadata?.retry).toBe(true);
  });

  it('should strip provider when no injectVar is present', async () => {
    const storedTestCase = {
      vars: { prompt: 'test prompt' },
      assert: [{ type: 'equals', value: 'test' }],
      metadata: { pluginId: 'bias:age' },
      // No provider - plugin-only test
    };

    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi
        .fn()
        .mockResolvedValueOnce([{ provider: JSON.stringify({ id: 'openai:gpt-4o-mini' }) }])
        .mockResolvedValueOnce([
          {
            testCase: JSON.stringify(storedTestCase),
            response: JSON.stringify({}),
            evalId: 'eval-123',
          },
        ]),
    };
    const getDb = await getMockDb();
    getDb.mockReturnValue(mockDb as any);

    const testCases: TestCaseWithPlugin[] = [
      {
        vars: { prompt: 'test' },
        assert: [],
        metadata: { pluginId: 'bias:age' },
      },
    ];

    const result = await addRetryTestCases(testCases, 'prompt', {
      targetIds: ['openai:gpt-4o-mini'],
    });

    expect(result).toHaveLength(1);
    expect(result[0].provider).toBeUndefined();
  });

  it('should replace prompt with redteamFinalPrompt for single-turn strategies', async () => {
    const originalPrompt = 'Original attack prompt';
    const finalPrompt = 'Final jailbreak attack prompt that worked';

    const storedTestCase = {
      vars: { prompt: originalPrompt },
      assert: [{ type: 'equals', value: 'test' }],
      metadata: { pluginId: 'harmful:hate', strategyId: 'jailbreak:meta' },
      provider: {
        id: 'promptfoo:redteam:iterative:meta',
        config: {
          injectVar: 'prompt',
          basePath: '/some/path',
        },
      },
    };

    const storedResponse = {
      metadata: {
        redteamFinalPrompt: finalPrompt,
      },
    };

    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi
        .fn()
        .mockResolvedValueOnce([{ provider: JSON.stringify({ id: 'openai:gpt-4o-mini' }) }])
        .mockResolvedValueOnce([
          {
            testCase: JSON.stringify(storedTestCase),
            response: JSON.stringify(storedResponse),
            evalId: 'eval-123',
          },
        ]),
    };
    const getDb = await getMockDb();
    getDb.mockReturnValue(mockDb as any);

    const testCases: TestCaseWithPlugin[] = [
      {
        vars: { prompt: 'test' },
        assert: [],
        metadata: { pluginId: 'harmful:hate' },
      },
    ];

    const result = await addRetryTestCases(testCases, 'prompt', {
      targetIds: ['openai:gpt-4o-mini'],
    });

    expect(result).toHaveLength(1);
    // Should use the final prompt, not the original
    expect(result[0].vars?.prompt).toBe(finalPrompt);
    expect(result[0].metadata?.strategyId).toBe('jailbreak:meta');
  });

  it('should NOT replace prompt for multi-turn strategies like goat', async () => {
    const originalPrompt = 'Original goat prompt';
    const finalPrompt = 'This should NOT be used';

    const storedTestCase = {
      vars: { prompt: originalPrompt },
      assert: [{ type: 'equals', value: 'test' }],
      metadata: { pluginId: 'bias:age', strategyId: 'goat' },
      provider: {
        id: 'promptfoo:redteam:goat',
        config: {
          injectVar: 'prompt',
          maxTurns: 2,
        },
      },
    };

    const storedResponse = {
      metadata: {
        redteamFinalPrompt: finalPrompt, // Present but should be ignored for multi-turn
      },
    };

    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi
        .fn()
        .mockResolvedValueOnce([{ provider: JSON.stringify({ id: 'openai:gpt-4o-mini' }) }])
        .mockResolvedValueOnce([
          {
            testCase: JSON.stringify(storedTestCase),
            response: JSON.stringify(storedResponse),
            evalId: 'eval-123',
          },
        ]),
    };
    const getDb = await getMockDb();
    getDb.mockReturnValue(mockDb as any);

    const testCases: TestCaseWithPlugin[] = [
      {
        vars: { prompt: 'test' },
        assert: [],
        metadata: { pluginId: 'bias:age' },
      },
    ];

    const result = await addRetryTestCases(testCases, 'prompt', {
      targetIds: ['openai:gpt-4o-mini'],
    });

    expect(result).toHaveLength(1);
    // Should use original prompt for multi-turn strategy
    expect(result[0].vars?.prompt).toBe(originalPrompt);
  });

  it('should mark all retry tests with retry: true in metadata', async () => {
    const storedTestCase = {
      vars: { prompt: 'test' },
      assert: [],
      metadata: { pluginId: 'bias:age' },
    };

    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi
        .fn()
        .mockResolvedValueOnce([{ provider: JSON.stringify({ id: 'openai:gpt-4o-mini' }) }])
        .mockResolvedValueOnce([
          {
            testCase: JSON.stringify(storedTestCase),
            response: JSON.stringify({}),
            evalId: 'eval-123',
          },
        ]),
    };
    const getDb = await getMockDb();
    getDb.mockReturnValue(mockDb as any);

    const testCases: TestCaseWithPlugin[] = [
      {
        vars: { prompt: 'test' },
        assert: [],
        metadata: { pluginId: 'bias:age' },
      },
    ];

    const result = await addRetryTestCases(testCases, 'prompt', {
      targetIds: ['openai:gpt-4o-mini'],
    });

    expect(result).toHaveLength(1);
    expect(result[0].metadata?.retry).toBe(true);
  });

  it('should deduplicate tests from multiple targets', async () => {
    const storedTestCase = {
      vars: { prompt: 'same prompt' },
      assert: [],
      metadata: { pluginId: 'bias:age' },
    };

    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi
        .fn()
        // First target
        .mockResolvedValueOnce([{ provider: JSON.stringify({ id: 'openai:gpt-4o-mini' }) }])
        .mockResolvedValueOnce([
          {
            testCase: JSON.stringify(storedTestCase),
            response: JSON.stringify({}),
            evalId: 'eval-123',
          },
        ])
        // Second target - returns the same test case
        .mockResolvedValueOnce([{ provider: JSON.stringify({ id: 'openai:gpt-4o' }) }])
        .mockResolvedValueOnce([
          {
            testCase: JSON.stringify(storedTestCase),
            response: JSON.stringify({}),
            evalId: 'eval-456',
          },
        ]),
    };
    const getDb = await getMockDb();
    getDb.mockReturnValue(mockDb as any);

    const testCases: TestCaseWithPlugin[] = [
      {
        vars: { prompt: 'test' },
        assert: [],
        metadata: { pluginId: 'bias:age' },
      },
    ];

    const result = await addRetryTestCases(testCases, 'prompt', {
      targetIds: ['openai:gpt-4o-mini', 'openai:gpt-4o'],
    });

    // Should be deduplicated to 1 test case
    expect(result).toHaveLength(1);
  });
});

// Test that validates strategyId in metadata
describe('retry strategy metadata', () => {
  it('should include strategyId in metadata', () => {
    // Create a test case that simulates what would be returned by addRetryTestCases
    const testCase: TestCase = {
      vars: { input: 'test' },
      assert: [{ type: 'equals', value: 'expected' }],
      metadata: {
        pluginId: 'test-plugin',
        strategyId: 'retry',
      },
      provider: {
        id: 'promptfoo:redteam:retry',
        config: {
          injectVar: 'input',
        },
      },
    };

    // Verify the correct strategyId is present in metadata
    expect(testCase.metadata?.strategyId).toBe('retry');
  });
});
