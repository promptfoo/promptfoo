import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemorySystem } from '../../../src/redteam/providers/conversationMemory';
import { CrescendoProvider } from '../../../src/redteam/providers/crescendo';
import {
  EVAL_SYSTEM_PROMPT,
  REFUSAL_SYSTEM_PROMPT,
} from '../../../src/redteam/providers/crescendo/prompts';
import { CustomProvider } from '../../../src/redteam/providers/custom';
import { getNunjucksEngine } from '../../../src/util/templates';
import { TokenUsageTracker } from '../../../src/util/tokenUsage';
import { createEmptyTokenUsage } from '../../../src/util/tokenUsageUtils';
import { createMockProvider } from '../../factories/provider';

import type { ApiProvider, CallApiOptionsParams, TokenUsage } from '../../../src/types';

interface ScoringMethods {
  userGoal: string;
  getScoringProvider(): Promise<ApiProvider>;
  getRefusalScore(
    attack: string,
    output: string,
    usage: TokenUsage,
    options?: CallApiOptionsParams,
  ): Promise<[boolean, string]>;
  getEvalScore(output: string, usage: TokenUsage, options?: CallApiOptionsParams): Promise<unknown>;
}

const objective = 'overall objective {{literal}}';
const attack = 'this turn differs from the overall objective';
const output = 'Synthetic target response';
const score = {
  value: false,
  metadata: 42,
  rationale: 'Synthetic rationale',
  description: 'Synthetic description',
};
const reported = { total: 17, prompt: 11, completion: 6, numRequests: 1 };

beforeEach(() => TokenUsageTracker.getInstance().resetAllUsage());
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  TokenUsageTracker.getInstance().resetAllUsage();
});

describe.each([
  ['Crescendo', () => new CrescendoProvider({ injectVar: 'query', redteamProvider: undefined })],
  [
    'Custom',
    () =>
      new CustomProvider({
        injectVar: 'query',
        strategyText: 'Synthetic strategy',
        redteamProvider: undefined,
      }),
  ],
] as const)('%s scoring contract', (_name, create) => {
  const setup = () => {
    const provider = create() as unknown as ScoringMethods;
    provider.userGoal = objective;
    const scorer = createMockProvider({ id: 'synthetic-scorer' });
    const resolve = vi.spyOn(provider, 'getScoringProvider').mockResolvedValue(scorer);
    const usage = createEmptyTokenUsage();
    return { provider, scorer, resolve, usage };
  };

  it('returns a basic refusal without resolving a scoring provider or changing usage', async () => {
    const { provider, scorer, resolve, usage } = setup();
    resolve.mockRejectedValue(new Error('Must not resolve credentials on shortcut'));
    const before = structuredClone(usage);
    expect(
      await provider.getRefusalScore(attack, 'I cannot help with that request.', usage),
    ).toEqual([true, 'The output contains a standard refusal.']);
    expect(resolve).not.toHaveBeenCalled();
    expect(scorer.callApi).not.toHaveBeenCalled();
    expect(usage).toEqual(before);
    expect(TokenUsageTracker.getInstance().getProviderUsage(scorer.id())).toBeUndefined();
  });

  describe.each(['refusal', 'eval'] as const)('%s score', (kind) => {
    const invoke = (provider: ScoringMethods, usage: TokenUsage, options?: CallApiOptionsParams) =>
      kind === 'refusal'
        ? provider.getRefusalScore(attack, output, usage, options)
        : provider.getEvalScore(output, usage, options);

    it.each([false, true])(
      'preserves the rendered request, context, options and result (string=%s)',
      async (asString) => {
        const { provider, scorer, usage } = setup();
        scorer.callApi.mockResolvedValue({
          output: asString ? `Some preamble\n${JSON.stringify(score)}` : score,
          tokenUsage: reported,
        });
        const controller = new AbortController();
        const options = { abortSignal: controller.signal };
        const result = await invoke(provider, usage, options);
        const expectedBody = JSON.stringify([
          {
            role: 'system',
            content: getNunjucksEngine().renderString(
              kind === 'refusal' ? REFUSAL_SYSTEM_PROMPT : EVAL_SYSTEM_PROMPT,
              { conversationObjective: objective },
            ),
          },
          {
            role: 'user',
            content: JSON.stringify({
              conversationObjective: kind === 'refusal' ? attack : objective,
              responseToEvaluateInput: output,
            }),
          },
        ]);
        expect(scorer.callApi).toHaveBeenCalledExactlyOnceWith(
          expectedBody,
          { prompt: { raw: expectedBody, label: kind }, vars: {} },
          options,
        );
        expect(result).toEqual(kind === 'refusal' ? [false, score.rationale] : score);
        expect(usage.assertions).toMatchObject(reported);
        expect(TokenUsageTracker.getInstance().getProviderUsage(scorer.id())).toMatchObject(
          reported,
        );
      },
    );

    it('preserves cached logical grading usage and zero incurred requests', async () => {
      const { provider, scorer, usage } = setup();
      scorer.callApi.mockResolvedValue({ output: score, tokenUsage: reported, cached: true });
      await invoke(provider, usage);
      expect(usage.assertions).toMatchObject({ ...reported, cached: 17 });
      expect(usage.incurredTokenUsage?.assertions).toMatchObject({ total: 0, numRequests: 0 });
      expect(TokenUsageTracker.getInstance().getProviderUsage(scorer.id())).toMatchObject({
        total: 0,
        cached: 17,
        numRequests: 0,
      });
      expect(scorer.callApi.mock.calls[0]).toHaveLength(2);
    });

    it('accounts before the configured delay and reports provider errors afterward', async () => {
      vi.useFakeTimers();
      const { provider, scorer, usage } = setup();
      scorer.delay = 25;
      scorer.callApi.mockResolvedValue({ error: 'synthetic scorer failure', tokenUsage: reported });
      let settled = false;
      const pending = invoke(provider, usage).then(
        () => {
          throw new Error('Expected failure');
        },
        (error: unknown) => {
          settled = true;
          return error;
        },
      );
      await vi.advanceTimersByTimeAsync(0);
      expect(usage.assertions).toMatchObject(reported);
      expect(TokenUsageTracker.getInstance().getProviderUsage(scorer.id())).toMatchObject(reported);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(24);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await pending).toEqual(
        new Error(`Error from redteam (${kind}) provider: synthetic scorer failure`),
      );
    });

    it('forwards cancellation to the actual scorer callback without inventing usage', async () => {
      const { provider, scorer, usage } = setup();
      const controller = new AbortController();
      const cancellation = new Error('Synthetic cancellation');
      scorer.callApi.mockImplementation(
        async (_prompt, _context, options) =>
          new Promise((_resolve, reject) => {
            options!.abortSignal!.addEventListener('abort', () => reject(cancellation), {
              once: true,
            });
          }),
      );
      const pending = invoke(provider, usage, { abortSignal: controller.signal });
      const rejection = expect(pending).rejects.toBe(cancellation);
      await Promise.resolve();
      controller.abort();
      await rejection;
      expect(usage).toEqual(createEmptyTokenUsage());
      expect(TokenUsageTracker.getInstance().getProviderUsage(scorer.id())).toBeUndefined();
    });

    it.each([
      [{ ...score, value: 'false' }, 'value to be a boolean'],
      [{ ...score, metadata: '42' }, 'metadata to be a number'],
      ['not JSON', undefined],
      [null, undefined],
    ])('preserves rejection of malformed score %j', async (malformed, message) => {
      const { provider, scorer, usage } = setup();
      scorer.callApi.mockResolvedValue({ output: malformed });
      if (message) {
        await expect(invoke(provider, usage)).rejects.toThrow(message);
      } else {
        await expect(invoke(provider, usage)).rejects.toThrow();
      }
      expect(usage.assertions?.numRequests).toBe(1);
    });
  });
});

describe('conversation memory contract', () => {
  it('retains live conversation and message identities while backtracking only the last pair', () => {
    const memory = new MemorySystem();
    const system = { role: 'system', content: 'setup' } as const;
    memory.addMessage('conversation', system);
    const live = memory.getConversation('conversation');
    memory.addMessage('conversation', { role: 'user', content: 'question' });
    memory.addMessage('conversation', { role: 'assistant', content: 'response' });
    expect(memory.getConversation('conversation')).toBe(live);
    expect(live).toHaveLength(3);
    const duplicate = memory.duplicateConversationExcludingLastTurn('conversation');
    expect(duplicate).not.toBe('conversation');
    expect(memory.getConversation(duplicate)).toEqual([system]);
    expect(memory.getConversation(duplicate)[0]).toBe(system);
    expect(memory.getConversation(duplicate)).not.toBe(live);
    expect(live).toHaveLength(3);
  });

  it('returns fresh empty arrays for unknown IDs and stores independently backtracked empty conversations', () => {
    const memory = new MemorySystem();
    expect(memory.getConversation('missing')).not.toBe(memory.getConversation('missing'));
    const first = memory.duplicateConversationExcludingLastTurn('missing');
    const second = memory.duplicateConversationExcludingLastTurn('missing');
    expect(first).not.toBe(second);
    const empty = memory.getConversation(first);
    expect(memory.getConversation(first)).toBe(empty);
    memory.addMessage(first, { role: 'user', content: 'new branch' });
    expect(empty).toHaveLength(1);
    expect(memory.getConversation(second)).toEqual([]);
  });
});
