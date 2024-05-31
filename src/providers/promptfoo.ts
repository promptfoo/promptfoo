import fetch from 'node-fetch';

import type {
  ApiProvider,
  ProviderResponse,
  CallApiContextParams,
  CallApiOptionsParams,
} from '../types';
import logger from '../logger';

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
      const response = await fetch('https://api.promptfoo.dev/redteam/generateHarmful', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`API call failed with status ${response.status}`);
      }

      const data = await response.json();
      const dataIsObject = typeof data === 'object' && !Array.isArray(data) && data !== null;

      logger.debug(`promptfoo API call response: ${JSON.stringify(data)}`);
      if (!dataIsObject) {
        throw new Error('Response data is not a valid JSON object');
      }

      if (!data || !('output' in data) || typeof data.output !== 'string') {
        throw new Error('Response data output field is not a string, which was expected');
      }
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
