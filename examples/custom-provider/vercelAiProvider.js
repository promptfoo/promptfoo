import { anthropic } from '@ai-sdk/anthropic';
import { generateText, Output } from 'ai';
import promptfoo from 'promptfoo';
import { promptSchema } from './schemaValidation.js';

class CustomProvider {
  constructor(options) {
    // Provider ID can be overridden by the config file (e.g. when using multiple of the same provider)
    this.providerId = options.id || 'custom provider';

    // options.config contains any custom options passed to the provider
    this.config = options.config;
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt, context) {
    const cache = await promptfoo.cache.getCache();

    // Create a unique cache key based on the prompt and context
    const cacheKey = `api:${this.providerId}:${prompt}}`; // :${JSON.stringify(context)

    // Check if the response is already cached
    const cachedResponse = await cache.get(cacheKey);
    if (cachedResponse) {
      return {
        // Required
        output: JSON.parse(cachedResponse),

        // Optional
        tokenUsage: {
          total: 0, // No tokens used because it's from the cache
          prompt: 0,
          completion: 0,
        },

        cost: 0, // No cost because it's from the cache
      };
    }

    // If not cached, make the function call using modern Vercel AI SDK approach
    // Note: generateObject is deprecated, use generateText with Output.object() instead
    const model = anthropic('claude-haiku-4-5-20251001');
    const result = await generateText({
      model,
      messages: JSON.parse(prompt),
      maxTokens: 4096,
      temperature: 0.4,
      maxRetries: 0,
      output: Output.object({ schema: promptSchema }),
    });

    // With generateText + Output.object(), the structured data is in result.output
    const { output: object, usage } = result;

    // Vercel AI SDK uses inputTokens/outputTokens instead of promptTokens/completionTokens
    const inputCost = 1.0 / 1_000_000; // Claude Haiku 4.5: $1 per million input tokens
    const outputCost = 5.0 / 1_000_000; // Claude Haiku 4.5: $5 per million output tokens
    const totalCost = inputCost * usage.inputTokens + outputCost * usage.outputTokens || undefined;

    // Store the response in the cache
    try {
      await cache.set(cacheKey, JSON.stringify(object));
    } catch (error) {
      console.error('Failed to store response in cache:', error);
    }

    return {
      // Required
      output: object,

      // Optional
      tokenUsage: {
        total: usage.totalTokens,
        prompt: usage.inputTokens,
        completion: usage.outputTokens,
      },

      cost: totalCost,
    };
  }
}

export default CustomProvider;
