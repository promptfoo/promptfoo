import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDefaultProviders } from '../src/providers/defaults';
import { providerRegistry } from '../src/providers/providerRegistry';
import { generatePrompts } from '../src/suggestions';
import { createEmptyTokenUsage } from '../src/util/tokenUsageUtils';
import { createMockProvider } from './factories/provider';

import type { DefaultProviders } from '../src/types/index';

vi.mock('../src/providers/defaults', () => ({
  getDefaultProviders: vi.fn(),
}));

function useSuggestionProvider(provider: ReturnType<typeof createMockProvider>) {
  vi.mocked(getDefaultProviders).mockResolvedValue({
    embeddingProvider: provider,
    gradingJsonProvider: provider,
    gradingProvider: provider,
    moderationProvider: provider,
    suggestionsProvider: provider,
    synthesizeProvider: provider,
  });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('generatePrompts', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('does not resolve or dispatch a provider for an already-cancelled request', async () => {
    const reason = new Error('stop suggestions');

    await expect(generatePrompts('Original prompt', 1, AbortSignal.abort(reason))).rejects.toBe(
      reason,
    );
    expect(getDefaultProviders).not.toHaveBeenCalled();
  });

  it('stops waiting for a reused provider without dispatching after its cleanup finally settles', async () => {
    const cleanupStarted = deferred();
    const releaseCleanup = deferred();
    const provider = Object.assign(createMockProvider({ id: 'held-suggestions' }), {
      cleanupAfterEvaluation: vi.fn(async () => {
        cleanupStarted.resolve();
        await releaseCleanup.promise;
      }),
    });
    useSuggestionProvider(provider);
    const preceding = providerRegistry.withEvaluation(() =>
      providerRegistry.cleanupWhenIdle([provider]),
    );
    const controller = new AbortController();
    const reason = new Error('stop queued suggestions');
    let generating: ReturnType<typeof generatePrompts> | undefined;
    try {
      await cleanupStarted.promise;
      generating = providerRegistry.withEvaluation(() =>
        generatePrompts('Original prompt', 2, controller.signal),
      );
      const rejection = expect(generating).rejects.toBe(reason);
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(getDefaultProviders).toHaveBeenCalledOnce();

      controller.abort(reason);
      await rejection;
      expect(provider.callApi).not.toHaveBeenCalled();
      releaseCleanup.resolve();
      await preceding;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(provider.callApi).not.toHaveBeenCalled();
    } finally {
      controller.abort(reason);
      releaseCleanup.resolve();
      await Promise.allSettled([preceding, ...(generating ? [generating] : [])]);
    }
  });

  it('passes cancellation to active calls and does not dispatch queued variants if calls ignore it', async () => {
    const firstCallsStarted = deferred();
    const releaseCalls = deferred();
    const provider = createMockProvider({ id: 'active-suggestions' });
    const signals: (AbortSignal | undefined)[] = [];
    vi.mocked(provider.callApi).mockImplementation(async (_prompt, _context, options) => {
      signals.push(options?.abortSignal);
      if (signals.length === 4) {
        firstCallsStarted.resolve();
      }
      await releaseCalls.promise;
      return { output: 'variant' };
    });
    useSuggestionProvider(provider);
    const controller = new AbortController();
    const reason = new Error('stop active suggestions');
    const generating = providerRegistry.withEvaluation(() =>
      generatePrompts('Original prompt', 8, controller.signal),
    );
    const rejection = expect(generating).rejects.toBe(reason);
    try {
      await firstCallsStarted.promise;
      expect(signals).toEqual(Array(4).fill(controller.signal));

      controller.abort(reason);
      await rejection;
      expect(signals.every((signal) => signal?.aborted)).toBe(true);
      expect(provider.callApi).toHaveBeenCalledTimes(4);

      releaseCalls.resolve();
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(provider.callApi).toHaveBeenCalledTimes(4);
    } finally {
      controller.abort(reason);
      releaseCalls.resolve();
      await Promise.allSettled([generating]);
    }
  });

  it.each([
    ['zero', 0],
    ['negative', -2],
    ['fractional', 1.5],
    ['NaN', Number.NaN],
    ['above max', 51],
  ])('rejects invalid num (%s) without calling the provider', async (_label, num) => {
    const provider = createMockProvider({ id: 'openai:codex-sdk' });
    vi.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: provider,
      gradingJsonProvider: provider,
      gradingProvider: provider,
      moderationProvider: provider,
      suggestionsProvider: provider,
      synthesizeProvider: provider,
    } satisfies DefaultProviders);

    const result = await generatePrompts('Original prompt', num);

    expect(provider.callApi).not.toHaveBeenCalled();
    expect(result.prompts).toBeUndefined();
    expect(result.error).toContain('num must be an integer between 1 and 50');
  });

  it('uses the resolved default suggestions provider', async () => {
    const provider = createMockProvider({
      id: 'openai:codex-sdk',
      response: {
        output: 'Variant prompt',
        tokenUsage: { completion: 1, prompt: 2, total: 3 },
      },
    });
    const callApi = provider.callApi;
    vi.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: provider,
      gradingJsonProvider: provider,
      gradingProvider: provider,
      moderationProvider: provider,
      suggestionsProvider: provider,
      synthesizeProvider: provider,
    } satisfies DefaultProviders);

    const result = await generatePrompts('Original prompt', 1);

    expect(callApi).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      prompts: ['Variant prompt'],
      tokensUsed: {
        ...createEmptyTokenUsage(),
        completion: 1,
        prompt: 2,
        total: 3,
      },
    });
  });

  it('returns partial prompts and warns when later iterations fail', async () => {
    const provider = createMockProvider({ id: 'openai:codex-sdk' });
    vi.mocked(provider.callApi)
      .mockResolvedValueOnce({
        output: 'Variant 1',
        tokenUsage: { completion: 1, prompt: 2, total: 3 },
      })
      .mockResolvedValueOnce({
        error: 'rate limit',
        tokenUsage: { completion: 0, prompt: 1, total: 1 },
      });
    vi.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: provider,
      gradingJsonProvider: provider,
      gradingProvider: provider,
      moderationProvider: provider,
      suggestionsProvider: provider,
      synthesizeProvider: provider,
    } satisfies DefaultProviders);

    const result = await generatePrompts('Original prompt', 2);

    expect(provider.callApi).toHaveBeenCalledTimes(2);
    expect(result.error).toBeUndefined();
    expect(result.prompts).toEqual(['Variant 1']);
    expect(result.tokensUsed).toEqual({
      ...createEmptyTokenUsage(),
      completion: 1,
      prompt: 3,
      total: 4,
    });
  });

  it('returns an error only when every iteration fails', async () => {
    const provider = createMockProvider({
      id: 'openai:codex-sdk',
      response: {
        error: 'rate limit',
        tokenUsage: { completion: 0, prompt: 1, total: 1 },
      },
    });
    vi.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: provider,
      gradingJsonProvider: provider,
      gradingProvider: provider,
      moderationProvider: provider,
      suggestionsProvider: provider,
      synthesizeProvider: provider,
    } satisfies DefaultProviders);

    const result = await generatePrompts('Original prompt', 2);

    expect(provider.callApi).toHaveBeenCalledTimes(2);
    expect(result.prompts).toBeUndefined();
    expect(result.error).toBe('Variant 1: rate limit; Variant 2: rate limit');
    expect(result.tokensUsed).toEqual({
      ...createEmptyTokenUsage(),
      prompt: 2,
      total: 2,
    });
  });

  it('preserves partial successes when a provider call throws', async () => {
    const provider = createMockProvider({ id: 'openai:codex-sdk' });
    vi.mocked(provider.callApi)
      .mockResolvedValueOnce({
        output: 'Variant 1',
        tokenUsage: { completion: 1, prompt: 2, total: 3 },
      })
      .mockRejectedValueOnce(new Error('socket hang up'));
    vi.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: provider,
      gradingJsonProvider: provider,
      gradingProvider: provider,
      moderationProvider: provider,
      suggestionsProvider: provider,
      synthesizeProvider: provider,
    } satisfies DefaultProviders);

    const result = await generatePrompts('Original prompt', 2);

    expect(provider.callApi).toHaveBeenCalledTimes(2);
    expect(result.error).toBeUndefined();
    expect(result.prompts).toEqual(['Variant 1']);
  });

  it('returns aggregated error when every iteration throws', async () => {
    const provider = createMockProvider({ id: 'openai:codex-sdk' });
    vi.mocked(provider.callApi)
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'));
    vi.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: provider,
      gradingJsonProvider: provider,
      gradingProvider: provider,
      moderationProvider: provider,
      suggestionsProvider: provider,
      synthesizeProvider: provider,
    } satisfies DefaultProviders);

    const result = await generatePrompts('Original prompt', 2);

    expect(result.prompts).toBeUndefined();
    expect(result.error).toBe('Variant 1: socket hang up; Variant 2: ECONNREFUSED');
  });

  it('aggregates distinct errors when every iteration fails', async () => {
    const provider = createMockProvider({ id: 'openai:codex-sdk' });
    vi.mocked(provider.callApi)
      .mockResolvedValueOnce({ error: 'auth failed' })
      .mockResolvedValueOnce({ error: 'rate limit' });
    vi.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: provider,
      gradingJsonProvider: provider,
      gradingProvider: provider,
      moderationProvider: provider,
      suggestionsProvider: provider,
      synthesizeProvider: provider,
    } satisfies DefaultProviders);

    const result = await generatePrompts('Original prompt', 2);

    expect(result.prompts).toBeUndefined();
    expect(result.error).toBe('Variant 1: auth failed; Variant 2: rate limit');
  });

  it('generates the requested number of prompt variants and accumulates token usage', async () => {
    const provider = createMockProvider({
      id: 'openai:codex-sdk',
      response: {
        output: 'Variant prompt',
        tokenUsage: { completion: 1, prompt: 2, total: 3 },
      },
    });
    vi.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: provider,
      gradingJsonProvider: provider,
      gradingProvider: provider,
      moderationProvider: provider,
      suggestionsProvider: provider,
      synthesizeProvider: provider,
    } satisfies DefaultProviders);

    const result = await generatePrompts('Original prompt', 2);

    expect(provider.callApi).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      prompts: ['Variant prompt', 'Variant prompt'],
      tokensUsed: {
        ...createEmptyTokenUsage(),
        completion: 2,
        prompt: 4,
        total: 6,
      },
    });
  });
});
