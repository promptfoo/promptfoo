import { afterEach, describe, expect, it, vi } from 'vitest';
import { runEval } from '../../../src/evaluator';
import { CrescendoProvider } from '../../../src/redteam/providers/crescendo/index';
import { CustomProvider } from '../../../src/redteam/providers/custom/index';
import GoatProvider from '../../../src/redteam/providers/goat';

import type { ApiProvider, AtomicTestCase } from '../../../src/types/index';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('fatal numeric grading errors', () => {
  it.each(
    ['custom', 'crescendo', 'goat'].flatMap((strategy) =>
      ['source', 'preparation', 'session'].map((failure) => [strategy, failure]),
    ),
  )('%s preserves numeric %s grading across strategy turns', async (strategy, failure) => {
    // These fakes replace attack generation and auxiliary LLM judgments only.
    // The actual numeric grader, target calls, and strategy error handling run.
    const config = {
      injectVar: 'query',
      redteamProvider: undefined,
      maxTurns: 2,
      maxBacktracks: 0,
      strategyText: 'Return an amount as JSON',
      stateful: true,
    };
    const provider =
      strategy === 'custom'
        ? new CustomProvider(config)
        : strategy === 'crescendo'
          ? new CrescendoProvider(config)
          : new GoatProvider(config);
    if (strategy !== 'goat') {
      const generation = provider as unknown as {
        getAttackPrompt: () => Promise<{ generatedQuestion: string }>;
        getRefusalScore: () => Promise<[boolean, string]>;
        getEvalScore: () => Promise<Array<{ value: boolean; metadata: number; rationale: string }>>;
      };
      vi.spyOn(generation, 'getAttackPrompt').mockResolvedValue({
        generatedQuestion: 'Return an amount as JSON',
      });
      vi.spyOn(generation, 'getRefusalScore').mockResolvedValue([false, 'Not a refusal']);
      vi.spyOn(generation, 'getEvalScore').mockResolvedValue([
        { value: false, metadata: 0, rationale: 'Continue probing' },
      ]);
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, options?: RequestInit) => {
        expect(JSON.parse(String(options?.body)).task).toBe('goat');
        return new Response(
          JSON.stringify({ message: { role: 'user', content: 'Return an amount as JSON' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    const seenSessions: unknown[] = [];
    const target: ApiProvider = {
      id: () => 'numeric-target',
      callApi: vi
        .fn()
        .mockResolvedValueOnce({
          output:
            failure === 'source'
              ? { amount: 101 }
              : failure === 'session'
                ? '{"amount":100}'
                : 'Not JSON',
          ...(failure === 'session' ? { sessionId: 'session1' } : {}),
        })
        .mockResolvedValueOnce({
          output:
            failure === 'source'
              ? '{"amount":100}'
              : failure === 'session'
                ? '{"amount":101}'
                : JSON.stringify({ answer: '{"amount":100}' }),
          ...(failure === 'session' ? { sessionId: 'session2' } : {}),
        }),
    };
    const test: AtomicTestCase = {
      provider,
      vars: { query: 'Return an amount as JSON' },
      assert: [
        {
          type: 'promptfoo:redteam:financial:calculation-error',
          value: { type: 'numeric', expected: { amount: 100 } },
          ...(failure === 'preparation'
            ? { transform: 'JSON.parse(output).answer' }
            : failure === 'session'
              ? {
                  transform: (output: unknown, context: { vars?: Record<string, unknown> }) => {
                    seenSessions.push(context.vars?.sessionId);
                    return context.vars?.sessionId ? output : '{"amount":999}';
                  },
                }
              : {}),
        },
      ],
      metadata: {
        purpose: 'A financial calculator',
        pluginId: 'financial:calculation-error',
        strategyId: strategy,
      },
    };
    const [row] = await runEval({
      provider: target,
      prompt: { raw: '{{query}}', label: 'numeric' },
      test,
      testIdx: 0,
      promptIdx: 0,
      evaluateOptions: {},
      delay: 0,
      repeatIndex: 0,
      conversations: {},
      registers: {},
      isRedteam: true,
    });
    expect(row.success).toBe(false);
    if (failure === 'session') {
      expect(row.failureReason).toBe(1);
      expect(target.callApi).toHaveBeenCalledTimes(2);
      expect(seenSessions).toEqual(['session1', 'session2', 'session2']);
    } else {
      expect(row.failureReason).toBe(2);
      expect(row.error).toContain('RedteamGradingConfigError');
      expect(target.callApi).toHaveBeenCalledTimes(1);
    }
  });
});
