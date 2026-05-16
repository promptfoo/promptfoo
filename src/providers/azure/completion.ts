import { fetchWithCache } from '../../cache';
import { getEnvFloat, getEnvInt, getEnvString } from '../../envars';
import logger from '../../logger';
import { normalizeFinishReason } from '../../util/finishReason';
import invariant from '../../util/invariant';
import { getRequestTimeoutMs } from '../shared';
import { DEFAULT_AZURE_API_VERSION } from './defaults';
import { AzureGenericProvider } from './generic';
import { calculateAzureCost } from './util';

import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';

export class AzureCompletionProvider extends AzureGenericProvider {
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

    const stop = getCompletionStop(this.config.stop);
    const body = buildCompletionBody({
      deploymentName: this.deploymentName,
      prompt,
      config: this.config,
      stop,
    });

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
        getRequestTimeoutMs(),
        'json',
        context?.bustCache ?? context?.debug,
      )) as any);
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    try {
      return buildCompletionResponse({
        data,
        cached,
        deploymentName: this.deploymentName,
        config: this.config,
      });
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
        tokenUsage: buildCompletionTokenUsage(data?.usage, cached),
      };
    }
  }
}

function getCompletionStop(configStop: unknown): string {
  try {
    const stopEnvVar = getEnvString('OPENAI_STOP');
    return stopEnvVar ? JSON.parse(stopEnvVar) : ((configStop as string | undefined) ?? '');
  } catch (err) {
    throw new Error(`OPENAI_STOP is not a valid JSON string: ${err}`);
  }
}

function buildCompletionBody({
  deploymentName,
  prompt,
  config,
  stop,
}: {
  deploymentName: string;
  prompt: string;
  config: AzureCompletionProvider['config'];
  stop: string;
}) {
  return {
    model: deploymentName,
    prompt,
    max_tokens: config.max_tokens ?? getEnvInt('OPENAI_MAX_TOKENS', 1024),
    temperature: config.temperature ?? getEnvFloat('OPENAI_TEMPERATURE', 0),
    top_p: config.top_p ?? getEnvFloat('OPENAI_TOP_P', 1),
    presence_penalty: config.presence_penalty ?? getEnvFloat('OPENAI_PRESENCE_PENALTY', 0),
    frequency_penalty: config.frequency_penalty ?? getEnvFloat('OPENAI_FREQUENCY_PENALTY', 0),
    best_of: config.best_of ?? getEnvInt('OPENAI_BEST_OF', 1),
    ...(stop ? { stop } : {}),
    ...(config.passthrough || {}),
  };
}

function buildCompletionResponse({
  data,
  cached,
  deploymentName,
  config,
}: {
  data: any;
  cached: boolean;
  deploymentName: string;
  config: AzureCompletionProvider['config'];
}): ProviderResponse {
  const apiError = getCompletionApiError(data);
  if (apiError) {
    return apiError;
  }

  const choice = data.choices[0];
  const finishReason = normalizeFinishReason(choice?.finish_reason);
  const contentFilterTriggered = finishReason === 'content_filter';
  const output = getCompletionOutput(choice?.text, contentFilterTriggered);
  const contentFilterResults = choice?.content_filter_results;
  const promptFilterResults = data.prompt_filter_results;
  const flaggedInput = hasFlaggedPromptContent(promptFilterResults);
  const flaggedOutput = hasFlaggedOutputContent(contentFilterTriggered, contentFilterResults);

  logContentFilterWarnings({
    deploymentName,
    flaggedInput,
    flaggedOutput,
    contentFilterResults,
    promptFilterResults,
  });

  return {
    output,
    tokenUsage: buildCompletionTokenUsage(data.usage, cached),
    ...(finishReason && { finishReason }),
    cost: calculateAzureCost(
      deploymentName,
      config,
      data.usage?.prompt_tokens,
      data.usage?.completion_tokens,
    ),
    ...(flaggedInput || flaggedOutput
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

function getCompletionApiError(data: any): ProviderResponse | undefined {
  if (!data.error) {
    return undefined;
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

function getCompletionOutput(output: string | null | undefined, contentFilterTriggered: boolean) {
  if (output != null) {
    return output;
  }
  return contentFilterTriggered
    ? "The generated content was filtered due to triggering Azure OpenAI Service's content filtering system."
    : '';
}

function hasFlaggedPromptContent(promptFilterResults: any[] | undefined): boolean {
  return (
    promptFilterResults?.some((result) =>
      Object.values(result.content_filter_results || {}).some((filter: any) => filter.filtered),
    ) ?? false
  );
}

function hasFlaggedOutputContent(
  contentFilterTriggered: boolean,
  contentFilterResults: Record<string, { filtered?: boolean }> | undefined,
): boolean {
  return (
    contentFilterTriggered ||
    Object.values(contentFilterResults || {}).some((filter) => Boolean(filter.filtered))
  );
}

function logContentFilterWarnings({
  deploymentName,
  flaggedInput,
  flaggedOutput,
  contentFilterResults,
  promptFilterResults,
}: {
  deploymentName: string;
  flaggedInput: boolean;
  flaggedOutput: boolean;
  contentFilterResults: unknown;
  promptFilterResults: unknown;
}) {
  if (flaggedOutput) {
    logger.warn(
      `Azure model ${deploymentName} output was flagged by content filter: ${JSON.stringify(
        contentFilterResults,
      )}`,
    );
  }

  if (flaggedInput) {
    logger.warn(
      `Azure model ${deploymentName} input was flagged by content filter: ${JSON.stringify(
        promptFilterResults,
      )}`,
    );
  }
}

function buildCompletionTokenUsage(usage: any, cached: boolean) {
  return cached
    ? {
        cached: usage?.total_tokens,
        total: usage?.total_tokens,
      }
    : {
        total: usage?.total_tokens,
        prompt: usage?.prompt_tokens,
        completion: usage?.completion_tokens,
      };
}
