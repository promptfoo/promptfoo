import { fetchWithCache } from '../cache';
import { VERSION } from '../constants';
import { fetchWithRetries } from '../fetch';
import { getUserEmail } from '../globalConfig/accounts';
import logger from '../logger';
import {
  getRemoteGenerationUrl,
  getRemoteGenerationUrlForUnaligned,
} from '../redteam/remoteGeneration';
import type {
  ApiProvider,
  ProviderResponse,
  CallApiContextParams,
  CallApiOptionsParams,
  TokenUsage,
} from '../types';
import type { EnvOverrides } from '../types/env';
import { REQUEST_TIMEOUT_MS } from './shared';

interface PromptfooHarmfulCompletionOptions {
  harmCategory: string;
  n: number;
  purpose: string;
}

export class PromptfooHarmfulCompletionProvider implements ApiProvider {
  harmCategory: string;
  n: number;
  purpose: string;

  constructor(options: PromptfooHarmfulCompletionOptions) {
    this.harmCategory = options.harmCategory;
    this.n = options.n;
    this.purpose = options.purpose;
  }

  id(): string {
    return `promptfoo:redteam:${this.harmCategory}`;
  }

  toString(): string {
    return `[Promptfoo Harmful Completion Provider ${this.purpose} - ${this.harmCategory}]`;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse & { output?: string[] }> {
    const body = {
      email: getUserEmail(),
      harmCategory: this.harmCategory,
      n: this.n,
      purpose: this.purpose,
      version: VERSION,
    };

    try {
      logger.debug(
        `[HarmfulCompletionProvider] Calling generate harmful API (${getRemoteGenerationUrlForUnaligned()}) with body: ${JSON.stringify(body)}`,
      );
      // We're using the promptfoo API to avoid having users provide their own unaligned model.
      const response = await fetchWithRetries(
        getRemoteGenerationUrlForUnaligned(),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        580000,
        2,
      );

      if (!response.ok) {
        throw new Error(`API call failed with status ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      logger.debug(`[HarmfulCompletionProvider] API call response: ${JSON.stringify(data)}`);
      return {
        output: [data.output].flat(),
      };
    } catch (err) {
      logger.info(`[HarmfulCompletionProvider] ${err}`);
      return {
        error: `[HarmfulCompletionProvider] ${err}`,
      };
    }
  }
}

interface PromptfooChatCompletionOptions {
  env?: EnvOverrides;
  id?: string;
  jsonOnly: boolean;
  preferSmallModel: boolean;
  task: 'crescendo' | 'goat' | 'iterative' | 'iterative:image' | 'iterative:tree';
}

export class PromptfooChatCompletionProvider implements ApiProvider {
  private options: PromptfooChatCompletionOptions;

  constructor(options: PromptfooChatCompletionOptions) {
    this.options = options;
  }

  id(): string {
    return this.options.id || 'promptfoo:chatcompletion';
  }

  toString(): string {
    return `[Promptfoo Chat Completion Provider]`;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const body = {
      jsonOnly: this.options.jsonOnly,
      preferSmallModel: this.options.preferSmallModel,
      prompt,
      step: context?.prompt.label,
      task: this.options.task,
      email: getUserEmail(),
    };

    try {
      const { data, status, statusText } = await fetchWithCache(
        getRemoteGenerationUrl(),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
      );

      const { result, tokenUsage } = data;

      if (!result) {
        logger.error(
          `Error from promptfoo completion provider. Status: ${status} ${statusText} ${JSON.stringify(data)} `,
        );
        return {
          error: 'LLM did not return a result, likely refusal',
        };
      }

      return {
        output: result,
        tokenUsage,
      };
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }
  }
}

interface PromptfooAgentOptions {
  env?: EnvOverrides;
  id?: string;
  instructions?: string;
}

export class PromptfooSimulatedUserProvider implements ApiProvider {
  private options: PromptfooAgentOptions;

  constructor(options: PromptfooAgentOptions = {}) {
    this.options = options;
  }

  id(): string {
    return this.options.id || 'promptfoo:agent';
  }

  toString(): string {
    return '[Promptfoo Agent Provider]';
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const messages = JSON.parse(prompt);
    const body = {
      task: 'tau',
      instructions: this.options.instructions,
      history: messages,
      email: getUserEmail(),
      version: VERSION,
    };

    logger.debug(`Calling promptfoo agent API with body: ${JSON.stringify(body)}`);
    try {
      const response = await fetchWithRetries(
        getRemoteGenerationUrl(),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
      );

      if (!response.ok) {
        throw new Error(`API call failed with status ${response.status}: ${await response.text()}`);
      }

      const data = (await response.json()) as {
        result: string;
        task: string;
        tokenUsage: TokenUsage;
      };
      return {
        output: data.result,
        tokenUsage: data.tokenUsage,
      };
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }
  }
}
