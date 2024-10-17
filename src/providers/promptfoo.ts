import { fetchWithCache } from '../cache';
import { getEnvString } from '../envars';
import { fetchWithRetries } from '../fetch';
import { getUserEmail } from '../globalConfig/accounts';
import logger from '../logger';
import { REMOTE_GENERATION_URL } from '../redteam/constants';
import type {
  ApiProvider,
  ProviderResponse,
  CallApiContextParams,
  CallApiOptionsParams,
  EnvOverrides,
} from '../types';
import { REQUEST_TIMEOUT_MS } from './shared';

interface PromptfooHarmfulCompletionOptions {
  purpose: string;
  harmCategory: string;
}

export class PromptfooHarmfulCompletionProvider implements ApiProvider {
  purpose: string;
  harmCategory: string;

  constructor(options: PromptfooHarmfulCompletionOptions) {
    this.purpose = options.purpose;
    this.harmCategory = options.harmCategory;
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
  ): Promise<ProviderResponse> {
    const body = {
      purpose: this.purpose,
      harmCategory: this.harmCategory,
      email: getUserEmail(),
    };

    try {
      logger.debug(`Calling promptfoo generate harmful API with body: ${JSON.stringify(body)}`);
      // We're using the promptfoo API to avoid having users provide their own unaligned model.
      // See here for a prompt you can use with Llama 3 base to host your own inference endpoint:
      // https://gist.github.com/typpo/3815d97a638f1a41d28634293aff33a0
      const response = await fetchWithRetries(
        getEnvString('PROMPTFOO_UNALIGNED_INFERENCE_ENDPOINT') ||
          'https://api.promptfoo.dev/redteam/generateHarmful',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        10000,
      );

      if (!response.ok) {
        throw new Error(`API call failed with status ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      logger.debug(`promptfoo API call response: ${JSON.stringify(data)}`);
      return {
        output: data.output,
      };
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }
  }
}

interface PromptfooChatCompletionOptions {
  env?: EnvOverrides;
  id?: string;
  jsonOnly: boolean;
  preferSmallModel: boolean;
  task: 'crescendo' | 'iterative' | 'iterative:image' | 'iterative:tree';
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
      const { data } = await fetchWithCache(
        REMOTE_GENERATION_URL,
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
        throw new Error('No choices returned from API');
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
