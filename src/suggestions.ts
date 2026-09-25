import async from 'async';
import logger from './logger';
import { SUGGEST_PROMPTS_SYSTEM_MESSAGE } from './prompts/index';
import { getDefaultProviders } from './providers/defaults';
import { providerRegistry } from './providers/providerRegistry';
import { MAX_SUGGESTIONS_COUNT } from './types/index';
import {
  accumulateTokenUsage,
  createEmptyTokenUsage,
  normalizeTokenUsage,
} from './util/tokenUsageUtils';

import type { TokenUsage } from './types/index';

interface GeneratePromptsOutput {
  prompts?: string[];
  error?: string;
  tokensUsed: TokenUsage;
}

const SUGGESTIONS_CONCURRENCY = 4;

export async function generatePrompts(
  prompt: string,
  num: number,
  abortSignal?: AbortSignal,
): Promise<GeneratePromptsOutput> {
  abortSignal?.throwIfAborted();
  if (!abortSignal) {
    return generatePromptsWithProvider(prompt, num);
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortSignal.reason);
    abortSignal.addEventListener('abort', onAbort, { once: true });
    generatePromptsWithProvider(prompt, num, abortSignal).then(
      (result) => {
        abortSignal.removeEventListener('abort', onAbort);
        resolve(result);
      },
      (error) => {
        abortSignal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

async function generatePromptsWithProvider(
  prompt: string,
  num: number,
  abortSignal?: AbortSignal,
): Promise<GeneratePromptsOutput> {
  if (!Number.isInteger(num) || num < 1 || num > MAX_SUGGESTIONS_COUNT) {
    return {
      error: `generatePrompts: num must be an integer between 1 and ${MAX_SUGGESTIONS_COUNT} (got ${num})`,
      tokensUsed: createEmptyTokenUsage(),
    };
  }
  const provider = (await getDefaultProviders()).suggestionsProvider;
  abortSignal?.throwIfAborted();
  await providerRegistry.useProvider(provider, abortSignal);
  const payload = JSON.stringify([
    SUGGEST_PROMPTS_SYSTEM_MESSAGE,
    { role: 'user', content: 'Generate a variant for the following prompt:' },
    { role: 'user', content: prompt },
  ]);

  const indices = Array.from({ length: num }, (_, i) => i);
  const responses = await async.mapLimit(indices, SUGGESTIONS_CONCURRENCY, async (i: number) => {
    abortSignal?.throwIfAborted();
    try {
      const resp = await providerRegistry.withProvider(
        provider,
        () =>
          abortSignal
            ? provider.callApi(payload, undefined, { abortSignal })
            : provider.callApi(payload),
        abortSignal,
      );
      abortSignal?.throwIfAborted();
      return {
        i,
        resp,
      };
    } catch (err) {
      abortSignal?.throwIfAborted();
      // Convert thrown errors into the same {error} shape as a returned failure
      // so a single rejection doesn't discard already-generated variants.
      return { i, resp: { error: err instanceof Error ? err.message : String(err) } };
    }
  });

  const tokensUsed = createEmptyTokenUsage();
  const prompts: string[] = [];
  const errors: string[] = [];

  for (const { i, resp } of responses) {
    accumulateTokenUsage(tokensUsed, normalizeTokenUsage(resp.tokenUsage));
    if (resp.error || !resp.output) {
      const message = resp.error || 'Unknown error';
      errors.push(`Variant ${i + 1}: ${message}`);
      logger.warn(`[suggestions] Variant ${i + 1}/${num} failed: ${message}`);
      continue;
    }
    prompts.push(String(resp.output));
  }

  if (prompts.length === 0) {
    const error = errors.length > 0 ? errors.join('; ') : 'No prompts generated';
    return { error, tokensUsed };
  }
  if (errors.length > 0) {
    logger.warn(
      `[suggestions] Generated ${prompts.length}/${num} prompt variants; ${errors.length} failed.`,
    );
  }
  return { prompts, tokensUsed };
}
