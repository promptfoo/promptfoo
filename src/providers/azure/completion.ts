import { fetchWithCache } from '../../cache';
import { getEnvFloat, getEnvInt, getEnvString } from '../../envars';
import logger from '../../logger';
import { normalizeFinishReason } from '../../util/finishReason';
import invariant from '../../util/invariant';
import { REQUEST_TIMEOUT_MS } from '../shared';
import { DEFAULT_AZURE_API_VERSION } from './defaults';
import { AzureGenericProvider } from './generic';
import { calculateAzureCost } from './util';

import type { CallApiContextParams, CallApiOptionsParams, ProviderResponse } from '../../types';

export class AzureCompletionProvider extends AzureGenericProvider {
  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
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
    const body = {
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

    logger.debug(`Calling Azure API: ${JSON.stringify(body)}`);
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

    logger.debug(`Azure API response: ${JSON.stringify(data)}`);
    try {
      // Handle content filter errors (HTTP 400 with content_filter code)
      if (data.error) {
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

      const choice = data.choices[0];
      const finishReason = normalizeFinishReason(choice?.finish_reason);

      // Check if content was filtered based on finish_reason
      const contentFilterTriggered = finishReason === 'content_filter';

      let output = choice.text;
      if (output == null) {
        if (contentFilterTriggered) {
          output =
            "The generated content was filtered due to triggering Azure OpenAI Service's content filtering system.";
        } else {
          output = '';
        }
      }

      // Check for content filter results in the response
      const contentFilterResults = choice?.content_filter_results;
      const promptFilterResults = data.prompt_filter_results;

      // Determine if input was flagged
      const flaggedInput =
        promptFilterResults?.some((result: any) =>
          Object.values(result.content_filter_results || {}).some((filter: any) => filter.filtered),
        ) ?? false;

      // Determine if output was flagged
      const flaggedOutput =
        contentFilterTriggered ||
        Object.values(contentFilterResults || {}).some((filter: any) => filter.filtered);

      if (flaggedOutput) {
        logger.warn(
          `Azure model ${this.deploymentName} output was flagged by content filter: ${JSON.stringify(
            contentFilterResults,
          )}`,
        );
      }

      if (flaggedInput) {
        logger.warn(
          `Azure model ${this.deploymentName} input was flagged by content filter: ${JSON.stringify(
            promptFilterResults,
          )}`,
        );
      }

      const guardrailsTriggered = flaggedInput || flaggedOutput;

      return {
        output,
        tokenUsage: cached
          ? { cached: data.usage.total_tokens, total: data.usage.total_tokens }
          : {
              total: data.usage.total_tokens,
              prompt: data.usage.prompt_tokens,
              completion: data.usage.completion_tokens,
            },
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
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
        tokenUsage: cached
          ? {
              cached: data.usage.total_tokens,
              total: data.usage.total_tokens,
            }
          : {
              total: data?.usage?.total_tokens,
              prompt: data?.usage?.prompt_tokens,
              completion: data?.usage?.completion_tokens,
            },
      };
    }
  }
}
