import logger from '../logger';
import type {
  ApiProvider,
  ProviderResponse,
  CallApiContextParams,
  CallApiOptionsParams,
} from '../types';
import fetch from 'node-fetch';

interface PromptfooHarmfulCompletionOptions {
  purpose: string;
  harmCategory: string;
}

class PromptfooHarmfulCompletionProvider implements ApiProvider {
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
    };

    try {
      logger.debug(`Calling promptfoo generate harmful API with body: ${JSON.stringify(body)}`);
      // We're using the promptfoo API to avoid having users provide their own unaligned model.
      // See here for a prompt you can use with Llama 3 base to host your own inference endpoint:
      // https://gist.github.com/typpo/3815d97a638f1a41d28634293aff33a0
      const response = await fetch(
        process.env.PROMPTFOO_UNALIGNED_INFERENCE_ENDPOINT ||
          'https://api.promptfoo.dev/redteam/generateHarmful',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        throw new Error(`API call failed with status ${response.status}`);
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

export default PromptfooHarmfulCompletionProvider;
