import { getEnvString } from '../../envars';
import logger from '../../logger';
import invariant from '../../util/invariant';
import { callOpenAiImageApi, formatOutput, OpenAiImageProvider } from '../openai/image';
import { REQUEST_TIMEOUT_MS } from '../shared';

import type { CallApiContextParams, CallApiOptionsParams, ProviderResponse } from '../../types';
import type { EnvOverrides } from '../../types/env';
import type { ApiProvider } from '../../types/providers';
import type { OpenAiSharedOptions } from '../openai/types';

type XaiImageOptions = OpenAiSharedOptions & {
  n?: number;
  response_format?: 'url' | 'b64_json';
  user?: string;
};

export class XAIImageProvider extends OpenAiImageProvider {
  config: XaiImageOptions;

  constructor(
    modelName: string,
    options: { config?: XaiImageOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(modelName, {
      ...options,
      config: {
        ...options.config,
        apiKeyEnvar: 'XAI_API_KEY',
        apiBaseUrl: 'https://api.x.ai/v1',
      },
    });
    this.config = options.config || {};
  }

  getApiKey(): string | undefined {
    if (this.config?.apiKey) {
      return this.config.apiKey;
    }
    return getEnvString('XAI_API_KEY');
  }

  getApiUrlDefault(): string {
    return 'https://api.x.ai/v1';
  }

  id(): string {
    return `xai:image:${this.modelName}`;
  }

  toString(): string {
    return `[xAI Image Provider ${this.modelName}]`;
  }

  private getApiModelName(): string {
    const modelMap: Record<string, string> = {
      'grok-2-image': 'grok-2-image',
      'grok-image': 'grok-2-image',
    };
    return modelMap[this.modelName] || 'grok-2-image';
  }

  private calculateImageCost(n: number = 1): number {
    // xAI pricing: $0.07 per generated image for grok-2-image
    return 0.07 * n;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (this.requiresApiKey() && !this.getApiKey()) {
      throw new Error(
        'xAI API key is not set. Set the XAI_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    const config = {
      ...this.config,
      ...context?.prompt?.config,
    } as XaiImageOptions;

    const model = this.getApiModelName();
    const responseFormat = config.response_format || 'url';
    const endpoint = '/images/generations';

    const body: Record<string, any> = {
      model,
      prompt,
      n: config.n || 1,
      response_format: responseFormat,
    };
    if (config.user) {
      body.user = config.user;
    }

    logger.debug(`Calling xAI Image API: ${JSON.stringify(body)}`);

    const headers = {
      'Content-Type': 'application/json',
      ...(this.getApiKey() ? { Authorization: `Bearer ${this.getApiKey()}` } : {}),
      ...config.headers,
    } as Record<string, string>;

    let data: any, status: number, statusText: string;
    let cached = false;
    try {
      ({ data, cached, status, statusText } = await callOpenAiImageApi(
        `${this.getApiUrl()}${endpoint}`,
        body,
        headers,
        REQUEST_TIMEOUT_MS,
      ));
      if (status < 200 || status >= 300) {
        return {
          error: `API error: ${status} ${statusText}\n${typeof data === 'string' ? data : JSON.stringify(data)}`,
        };
      }
    } catch (err) {
      logger.error(`API call error: ${String(err)}`);
      await data?.deleteFromCache?.();
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    logger.debug(`\txAI image API response: ${JSON.stringify(data)}`);

    if (data.error) {
      await data?.deleteFromCache?.();
      return {
        error: typeof data.error === 'string' ? data.error : JSON.stringify(data.error),
      };
    }

    try {
      const formattedOutput = formatOutput(data, prompt, responseFormat);
      if (typeof formattedOutput === 'object') {
        return formattedOutput;
      }

      const cost = cached ? 0 : this.calculateImageCost(config.n || 1);

      return {
        output: formattedOutput,
        cached,
        cost,
        ...(responseFormat === 'b64_json' ? { isBase64: true, format: 'json' } : {}),
      };
    } catch (err) {
      await data?.deleteFromCache?.();
      return {
        error: `API error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }
}

export function createXAIImageProvider(
  providerPath: string,
  options: { config?: XaiImageOptions; id?: string; env?: EnvOverrides } = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const modelName = splits.slice(2).join(':');
  invariant(modelName, 'Model name is required');
  return new XAIImageProvider(modelName, options);
}
