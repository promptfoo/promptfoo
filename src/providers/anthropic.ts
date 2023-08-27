import Anthropic from '@anthropic-ai/sdk';
import logger from '../logger';

import type { ApiProvider, ProviderResponse } from '../types.js';

interface AnthropicCompletionOptions {
  apiKey?: string;
  max_tokens_to_sample?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
}

export class AnthropicCompletionProvider implements ApiProvider {
  static ANTHROPIC_COMPLETION_MODELS = [
    'claude-1',
    'claude-1-100k',
    'claude-instant-1',
    'claude-instant-1-100k',
  ];

  modelName: string;
  apiKey?: string;
  anthropic: Anthropic;
  config: AnthropicCompletionOptions;

  constructor(modelName: string, config?: AnthropicCompletionOptions) {
    this.modelName = modelName;
    this.apiKey = config?.apiKey || process.env.ANTHROPIC_API_KEY;
    this.anthropic = new Anthropic({ apiKey: this.apiKey });
    this.config = config || {};
  }

  id(): string {
    return `anthropic:${this.modelName}`;
  }

  toString(): string {
    return `[Anthropic Provider ${this.modelName}]`;
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new Error(
        'Anthropic API key is not set. Set the ANTHROPIC_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    let stop: string[];
    try {
      stop = process.env.ANTHROPIC_STOP
        ? JSON.parse(process.env.ANTHROPIC_STOP)
        : ['<|im_end|>', '<|endoftext|>'];
    } catch (err) {
      throw new Error(`ANTHROPIC_STOP is not a valid JSON string: ${err}`);
    }

    const params: Anthropic.CompletionCreateParams = {
      model: this.modelName,
      prompt: `${Anthropic.HUMAN_PROMPT} ${prompt} ${Anthropic.AI_PROMPT}`,
      max_tokens_to_sample:
        this.config?.max_tokens_to_sample || parseInt(process.env.ANTHROPIC_MAX_TOKENS || '1024'),
      temperature: this.config.temperature ?? parseFloat(process.env.ANTHROPIC_TEMPERATURE || '0'),
      stop_sequences: stop,
    };

    logger.debug(`Calling Anthropic API: ${JSON.stringify(params)}`);
    let response;
    try {
      response = await this.anthropic.completions.create(params);
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }
    logger.debug(`\tAnthropic API response: ${JSON.stringify(response)}`);
    try {
      return {
        output: response.completion,
        tokenUsage: {}, // TODO: add token usage once Anthropic API supports it
      };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(response)}`,
      };
    }
  }
}
