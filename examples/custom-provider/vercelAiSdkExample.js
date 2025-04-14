// Example from @Codeshark-NET https://github.com/promptfoo/promptfoo/issues/922
// @ts-check
import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import promptfoo from 'promptfoo';
import { promptSchema } from './schemaValidation.mjs';

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
    const cache = await promptfoo.default.cache.getCache();

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

    // If not cached, make the function call
    const model = anthropic('claude-3-5-haiku-20241022');
    const { object, usage } = await generateObject({
      model,
      messages: JSON.parse(prompt),
      maxTokens: 4096,
      temperature: 0.4,
      maxRetries: 0,
      schema: promptSchema,
      mode: 'tool',
    });

    const inputCost = 0.00025 / 1000; //config.cost ?? model.cost.input;
    const outputCost = 0.00125 / 1000; // config.cost ?? model.cost.output;
    const totalCost =
      inputCost * usage.promptTokens + outputCost * usage.completionTokens || undefined;

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
        prompt: usage.promptTokens,
        completion: usage.completionTokens,
      },

      cost: totalCost,
    };
  }
}

export default CustomProvider;
