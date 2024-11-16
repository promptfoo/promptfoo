import type {
  ApiProvider,
  CallApiContextParams,
  ProviderResponse,
  CallApiOptionsParams,
} from '../..';
import { VERSION } from '../../constants';
import { getEnvString } from '../../envars';
import { fetchWithRetries } from '../../fetch';
import { getUserEmail } from '../../globalConfig/accounts';
import logger from '../../logger';

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
      version: VERSION,
    };

    try {
      logger.debug(`Calling promptfoo generate harmful API with body: ${JSON.stringify(body)}`);
      // We're using the promptfoo API to avoid having users provide their own unaligned model.
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
        2,
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
