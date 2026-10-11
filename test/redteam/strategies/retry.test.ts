const { createWarningLoggerModule } = await vi.hoisted(
  async () => import('../../factories/logger'),
);

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addRetryTestCases } from '../../../src/redteam/strategies/retry';

import type { TestCaseWithPlugin } from '../../../src/types/index';

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

vi.mock('../../../src/logger', () => createWarningLoggerModule());

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
      numTests: 7,
    });

    expect(mockDb.limit).toHaveBeenLastCalledWith(7);
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
    expect(result[0].metadata?.strategyId).toBeUndefined();
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

    testCases.push(testCases[0]);
    const result = await addRetryTestCases(testCases, 'prompt', {
      targetIds: ['openai:gpt-4o-mini', 'openai:gpt-4o'],
    });

    expect(mockDb.limit.mock.calls).toEqual([[1], [2], [1], [2]]);
    // Should be deduplicated to 1 test case
    expect(result).toHaveLength(1);
  });

  it.each(['mixed', 'empty', 'http-error', 'network-error'])(
    'combines real SQLite history with %s cloud results',
    async (scenario) => {
      const actualDatabase = await vi.importActual<typeof import('../../../src/database/index')>(
        '../../../src/database/index',
      );
      const db = await actualDatabase.getDb();
      const getDb = await getMockDb();
      getDb.mockResolvedValue(db);
      const { runDbMigrations } = await import('../../../src/migrate');
      await runDbMigrations();
      const { evalsTable, evalResultsTable } = await import('../../../src/database/tables');
      const { eq } = await import('drizzle-orm');
      const { cloudConfig } = await import('../../../src/globalConfig/cloud');
      const { makeRequest } = await import('../../../src/util/cloud');
      vi.mocked(cloudConfig.isEnabled).mockReturnValue(true);
      const evalId = `retry-${scenario}`;
      const targetId = `target-${scenario}`;
      const cloudCase: TestCaseWithPlugin = {
        vars: { prompt: 'same attack', sessionId: 'cloud-session', _conversation: ['cloud turn'] },
        description: 'first occurrence',
        assert: [{ type: 'equals', value: 'expected', metric: 'Bias/base64' }],
        metadata: { pluginId: 'bias:age', strategyConfig: { stale: true } },
      };
      const cloudRows = [{ testCase: cloudCase, response: {}, evalId: 'cloud-eval' }];
      if (scenario === 'network-error') {
        vi.mocked(makeRequest).mockRejectedValue(new Error('cloud unavailable'));
      } else {
        vi.mocked(makeRequest).mockResolvedValue(
          new Response(JSON.stringify({ results: scenario === 'empty' ? [] : cloudRows }), {
            status: scenario === 'http-error' ? 503 : 200,
          }),
        );
      }
      await db.insert(evalsTable).values({ id: evalId, config: {}, results: {} }).run();
      try {
        const rows = [
          {
            prompt: 'same attack',
            strategyId: undefined,
            pluginId: 'bias:age',
            targetId,
            success: false,
          },
          {
            prompt: 'different attack',
            strategyId: undefined,
            pluginId: 'bias:age',
            targetId,
            success: false,
          },
          {
            prompt: 'same attack',
            strategyId: 'base64',
            pluginId: 'bias:age',
            targetId,
            success: false,
          },
          { prompt: 'wrong target', pluginId: 'bias:age', targetId: 'other', success: false },
          { prompt: 'wrong plugin', pluginId: 'pii', targetId, success: false },
          { prompt: 'passed', pluginId: 'bias:age', targetId, success: true },
        ];
        await db
          .insert(evalResultsTable)
          .values(
            rows.map((row, index) => ({
              id: `${evalId}-${index}`,
              evalId,
              promptIdx: 0,
              testIdx: index,
              updatedAt: 100 - index,
              prompt: { raw: '{{prompt}}', label: 'fixture' },
              provider: { id: row.targetId },
              testCase: {
                vars: {
                  prompt: row.prompt,
                  sessionId: 'local-session',
                  _conversation: ['local turn'],
                },
                metadata: { pluginId: row.pluginId, strategyId: row.strategyId },
              },
              response: {},
              success: row.success,
              score: row.success ? 1 : 0,
            })),
          )
          .run();
        const result = await addRetryTestCases(
          [{ vars: { prompt: 'seed' }, metadata: { pluginId: 'bias:age' } }],
          'prompt',
          { targetIds: [targetId], numTests: 10 },
        );
        expect(makeRequest).toHaveBeenCalledExactlyOnceWith(
          `results/failed-tests?pluginId=bias%3Aage&targetId=${targetId}&limit=10`,
          'GET',
        );
        expect(result.map((test) => [test.vars?.prompt, test.metadata?.strategyId])).toEqual([
          ['same attack', undefined],
          ['different attack', undefined],
          ['same attack', 'base64'],
        ]);
        expect(result.every((test) => test.metadata?.retry === true)).toBe(true);
        if (scenario === 'mixed') {
          expect(result[0]).toMatchObject({
            vars: cloudCase.vars,
            description: 'first occurrence',
            assert: [{ type: 'equals', value: 'expected', metric: 'Bias' }],
            metadata: { originalEvalId: 'cloud-eval' },
          });
          expect(result[0].metadata?.strategyConfig).toBeUndefined();
          expect(cloudCase.metadata?.strategyConfig).toEqual({ stale: true });
        } else {
          expect(result[0].metadata?.originalEvalId).toBe(evalId);
        }
      } finally {
        await db.delete(evalResultsTable).where(eq(evalResultsTable.evalId, evalId)).run();
        await db.delete(evalsTable).where(eq(evalsTable.id, evalId)).run();
      }
    },
  );
});
