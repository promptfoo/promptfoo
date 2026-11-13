// Example from @Codeshark-NET https://github.com/promptfoo/promptfoo/issues/922
// @ts-check
import { createHash } from 'node:crypto';

import { anthropic } from '@ai-sdk/anthropic';
import { generateText, jsonSchema, Output } from 'ai';
import { cache as promptfooCache } from 'promptfoo';

const promptSchema = jsonSchema({
  type: 'object',
  properties: { answer: { type: 'string' } },
  required: ['answer'],
  additionalProperties: false,
});

class CustomProvider {
  constructor(options) {
    // Provider ID can be overridden by the config file (e.g. when using multiple of the same provider)
    this.providerId = options.id || 'custom provider';
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt) {
    const cache = await promptfooCache.getCache();

    const promptHash = createHash('sha256').update(String(prompt)).digest('hex');
    const cacheKey = `vercel-ai-sdk:v6:${this.providerId}:${promptHash}`;

    // Check if the response is already cached
    const cachedResponse = promptfooCache.isCacheEnabled() && (await cache.get(cacheKey));
    if (cachedResponse) {
      return {
        output: JSON.parse(cachedResponse),
        cached: true,
        tokenUsage: {
          total: 0, // No tokens used because it's from the cache
          prompt: 0,
          completion: 0,
        },
      };
    }

    // If not cached, make the function call
    const model = anthropic('claude-haiku-4-5-20251001');
    const { output, usage } = await generateText({
      model,
      messages: JSON.parse(prompt),
      maxOutputTokens: 4096,
      temperature: 0.4,
      maxRetries: 0,
      output: Output.object({ schema: promptSchema }),
    });

    // Store the response in the cache
    if (promptfooCache.isCacheEnabled()) {
      try {
        await cache.set(cacheKey, JSON.stringify(output));
      } catch (error) {
        console.error('Failed to store response in cache:', error);
      }
    }

    return {
      output,
      tokenUsage: {
        total: usage.totalTokens,
        prompt: usage.inputTokens,
        completion: usage.outputTokens,
      },
    };
  }
}

export default CustomProvider;
