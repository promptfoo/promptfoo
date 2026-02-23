import { fetchWithCache } from '../../cache';
import { getEnvFloat, getEnvInt, getEnvString } from '../../envars';
import logger from '../../logger';
import { normalizeFinishReason } from '../../util/finishReason';
import invariant from '../../util/invariant';
import { REQUEST_TIMEOUT_MS } from '../shared';
import { DEFAULT_AZURE_API_VERSION } from './defaults';
import { AzureGenericProvider } from './generic';
import { calculateAzureCost } from './util';

import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';

export class AzureCompletionProvider extends AzureGenericProvider {
  private buildRequestBody(prompt: string, stop: string): Record<string, any> {
    return {
      model: this.deploymentName,
      prompt,
      max_tokens: this.config.max_tokens ?? getEnvInt('OPENAI_MAX_TOKENS', 1024),
      temperature: this.config.temperature ?? getEnvFloat('OPENAI_TEMPERATURE', 0),
      top_p: this.config.top_p ?? getEnvFloat('OPENAI_TOP_P', 1),
      presence_penalty: this.config.presence_penalty ?? getEnvFloat('OPENAI_PRESENCE_PENALTY', 0),
      frequency_penalty:
        this.config.frequency_penalty ?? getEnvFloat('OPENAI_FREQUENCY_PENALTY', 0),
      best_of: this.config.best_of ?? getEnvInt('OPENAI_BEST_OF', 1),
      ...(stop ? { stop } : {}),
      ...(this.config.passthrough || {}),
    };
  }

  private buildTokenUsage(data: any, cached: boolean) {
    if (cached) {
      return { cached: data.usage.total_tokens, total: data.usage.total_tokens };
    }
    return {
      total: data.usage?.total_tokens,
      prompt: data.usage?.prompt_tokens,
      completion: data.usage?.completion_tokens,
    };
  }

  private handleContentFilterError(data: any): ProviderResponse | null {
    if (!data.error) {
      return null;
    }
    if (data.error.code === 'content_filter' && data.error.status === 400) {
      return {
        output: data.error.message,
        guardrails: {
          flagged: true,
          flaggedInput: true,
          flaggedOutput: false,
        },
      };
    }
    return {
      error: `API response error: ${data.error.code} ${data.error.message}`,
    };
  }

  private determineOutputText(choice: any, contentFilterTriggered: boolean): string {
    if (choice.text != null) {
      return choice.text;
    }
    if (contentFilterTriggered) {
      return "The generated content was filtered due to triggering Azure OpenAI Service's content filtering system.";
    }
    return '';
  }

  private evaluateContentFilters(
    data: any,
    choice: any,
    contentFilterTriggered: boolean,
  ): { flaggedInput: boolean; flaggedOutput: boolean } {
    const contentFilterResults = choice?.content_filter_results;
    const promptFilterResults = data.prompt_filter_results;

    const flaggedInput =
      promptFilterResults?.some((result: any) =>
        Object.values(result.content_filter_results || {}).some((filter: any) => filter.filtered),
      ) ?? false;

    const flaggedOutput =
      contentFilterTriggered ||
      Object.values(contentFilterResults || {}).some((filter: any) => filter.filtered);

    if (flaggedOutput) {
      logger.warn(
        `Azure model ${this.deploymentName} output was flagged by content filter: ${JSON.stringify(contentFilterResults)}`,
      );
    }
    if (flaggedInput) {
      logger.warn(
        `Azure model ${this.deploymentName} input was flagged by content filter: ${JSON.stringify(promptFilterResults)}`,
      );
    }

    return { flaggedInput, flaggedOutput };
  }

  private processResponseData(data: any, cached: boolean): ProviderResponse {
    const filterError = this.handleContentFilterError(data);
    if (filterError) {
      return filterError;
    }

    const choice = data.choices[0];
    const finishReason = normalizeFinishReason(choice?.finish_reason);
    const contentFilterTriggered = finishReason === 'content_filter';

    const output = this.determineOutputText(choice, contentFilterTriggered);
    const { flaggedInput, flaggedOutput } = this.evaluateContentFilters(
      data,
      choice,
      contentFilterTriggered,
    );
    const guardrailsTriggered = flaggedInput || flaggedOutput;

    return {
      output,
      tokenUsage: this.buildTokenUsage(data, cached),
      ...(finishReason && { finishReason }),
      cost: calculateAzureCost(
        this.deploymentName,
        this.config,
        data.usage?.prompt_tokens,
        data.usage?.completion_tokens,
      ),
      ...(guardrailsTriggered
        ? {
            guardrails: {
              flagged: true,
              flaggedInput,
              flaggedOutput,
            },
          }
        : {}),
    };
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    await this.ensureInitialized();
    invariant(this.authHeaders, 'auth headers are not initialized');

    if (!this.getApiBaseUrl()) {
      throw new Error('Azure API host must be set.');
    }

    let stop: string;
    try {
      const stopEnvVar = getEnvString('OPENAI_STOP');
      stop = stopEnvVar ? JSON.parse(stopEnvVar) : (this.config.stop ?? '');
    } catch (err) {
      throw new Error(`OPENAI_STOP is not a valid JSON string: ${err}`);
    }

    const body = this.buildRequestBody(prompt, stop);

    let data;
    let cached = false;
    try {
      ({ data, cached } = (await fetchWithCache(
        `${this.getApiBaseUrl()}/openai/deployments/${
          this.deploymentName
        }/completions?api-version=${this.config.apiVersion || DEFAULT_AZURE_API_VERSION}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.authHeaders,
            ...this.config.headers,
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
        'json',
        context?.bustCache ?? context?.debug,
      )) as any);
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    try {
      return this.processResponseData(data, cached);
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
        tokenUsage: this.buildTokenUsage(data, cached),
      };
    }
  }
}
