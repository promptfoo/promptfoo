import { fetchWithCache } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import type { CallApiContextParams, CallApiOptionsParams, ProviderResponse } from '../types';
import type { EnvOverrides } from '../types/env';
import type { ApiProvider } from '../types/providers';
import { ellipsize } from '../util/text';
import { sleep } from '../util/time';
import { REQUEST_TIMEOUT_MS } from './shared';

export interface BflImageOptions {
  seed?: number;
  aspect_ratio?: string;
  output_format?: 'jpeg' | 'png';
  prompt_upsampling?: boolean;
  safety_tolerance?: number;
  webhook_url?: string;
  webhook_secret?: string;
  // For kontext models (image-to-image)
  input_image?: string;
  // For flux-pro-1.1
  image_prompt?: string;
  width?: number;
  height?: number;
  // Request options
  max_poll_time_ms?: number;
  poll_interval_ms?: number;
  apiKey?: string;
  headers?: Record<string, string>;
}

export type BflModel =
  | 'flux-kontext-pro'
  | 'flux-kontext-max'
  | 'flux-pro-1.1'
  | 'flux-pro'
  | 'flux-dev'
  | 'flux-fill-pro'
  | 'flux-canny-pro'
  | 'flux-depth-pro';

interface BflSubmissionResponse {
  id: string;
  polling_url: string;
}

interface BflResultResponse {
  id: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  result?: {
    sample?: string; // URL to the generated image
    samples?: string[]; // Multiple images
  };
  error?: string;
}

export class BlackForestLabsProvider implements ApiProvider {
  modelName: BflModel;
  config: BflImageOptions;
  env?: EnvOverrides;

  constructor(
    modelName: BflModel,
    options: { config?: BflImageOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    const { config, id, env } = options;
    this.modelName = modelName;
    this.config = config || {};
    this.env = env;
    this.id = id ? () => id : this.id;
  }

  id(): string {
    return `bfl:${this.modelName}`;
  }

  toString(): string {
    return `[Black Forest Labs Provider ${this.modelName}]`;
  }

  getApiKey(): string | undefined {
    return this.config?.apiKey || this.env?.BFL_API_KEY || getEnvString('BFL_API_KEY');
  }

  getApiUrl(): string {
    return 'https://api.us1.bfl.ai/v1';
  }

  private getEndpoint(): string {
    const endpointMap: Record<BflModel, string> = {
      'flux-kontext-pro': '/flux-kontext-pro',
      'flux-kontext-max': '/flux-kontext-max',
      'flux-pro-1.1': '/flux-pro-1.1',
      'flux-pro': '/flux-pro',
      'flux-dev': '/flux-dev',
      'flux-fill-pro': '/flux-fill-pro',
      'flux-canny-pro': '/flux-canny-pro',
      'flux-depth-pro': '/flux-depth-pro',
    };
    return endpointMap[this.modelName] || '/flux-pro-1.1';
  }

  private async submitImageGeneration(
    prompt: string,
    config: BflImageOptions,
  ): Promise<BflSubmissionResponse> {
    const endpoint = this.getEndpoint();
    const url = `${this.getApiUrl()}${endpoint}`;

    const body: Record<string, any> = {
      prompt,
    };

    // Add optional parameters based on model and config
    if (config.seed !== undefined) {
      body.seed = config.seed;
    }
    if (config.aspect_ratio) {
      body.aspect_ratio = config.aspect_ratio;
    }
    if (config.output_format) {
      body.output_format = config.output_format;
    }
    if (config.prompt_upsampling !== undefined) {
      body.prompt_upsampling = config.prompt_upsampling;
    }
    if (config.safety_tolerance !== undefined) {
      body.safety_tolerance = config.safety_tolerance;
    }
    if (config.webhook_url) {
      body.webhook_url = config.webhook_url;
    }
    if (config.webhook_secret) {
      body.webhook_secret = config.webhook_secret;
    }

    // Kontext-specific parameters (image-to-image)
    if (this.modelName.includes('kontext') && config.input_image) {
      body.input_image = config.input_image;
    }

    // Flux-pro-1.1 specific parameters
    if (this.modelName === 'flux-pro-1.1') {
      if (config.image_prompt) {
        body.image_prompt = config.image_prompt;
      }
      if (config.width) {
        body.width = config.width;
      }
      if (config.height) {
        body.height = config.height;
      }
    }

    const headers = {
      'Content-Type': 'application/json',
      'x-key': this.getApiKey()!,
      ...config.headers,
    };

    logger.debug(
      `Submitting BFL image generation: ${url} ${JSON.stringify({ ...body, prompt: ellipsize(prompt, 50) })}`,
    );

    try {
      const { data, status, statusText } = await fetchWithCache(
        url,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
        'json',
        true, // Don't cache submissions
      );

      if (status < 200 || status >= 300) {
        throw new Error(
          `API error: ${status} ${statusText}\n${typeof data === 'string' ? data : JSON.stringify(data)}`,
        );
      }

      return data as BflSubmissionResponse;
    } catch (err) {
      throw new Error(`Failed to submit image generation: ${String(err)}`);
    }
  }

  private async pollForResult(
    submissionResponse: BflSubmissionResponse,
    config: BflImageOptions,
  ): Promise<BflResultResponse> {
    const maxPollTime = config.max_poll_time_ms || 300000; // 5 minutes
    const pollInterval = config.poll_interval_ms || 2000; // 2 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxPollTime) {
      logger.debug(`Polling BFL result: ${submissionResponse.polling_url}`);

      try {
        const { data, status, statusText } = await fetchWithCache(
          submissionResponse.polling_url,
          {
            method: 'GET',
            headers: {
              'x-key': this.getApiKey()!,
              ...config.headers,
            },
          },
          REQUEST_TIMEOUT_MS,
          'json',
          true, // Don't cache polling requests
        );

        if (status < 200 || status >= 300) {
          throw new Error(
            `Polling error: ${status} ${statusText}\n${typeof data === 'string' ? data : JSON.stringify(data)}`,
          );
        }

        const result = data as BflResultResponse;
        logger.debug(`BFL polling result: ${JSON.stringify(result)}`);

        if (result.status === 'completed') {
          return result;
        }

        if (result.status === 'failed') {
          throw new Error(`Image generation failed: ${result.error || 'Unknown error'}`);
        }

        if (result.status === 'cancelled') {
          throw new Error('Image generation was cancelled');
        }

        // Wait before next poll
        await sleep(pollInterval);
      } catch (err) {
        if (err instanceof Error && err.message.includes('Image generation failed')) {
          throw err;
        }
        // For other errors (network, etc.), wait and retry
        logger.debug(`Polling error, retrying: ${String(err)}`);
        await sleep(pollInterval);
      }
    }

    throw new Error(`Polling timed out after ${maxPollTime}ms`);
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (!this.getApiKey()) {
      throw new Error(
        'Black Forest Labs API key is not set. Set the BFL_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    const config = {
      ...this.config,
      ...context?.prompt?.config,
    } as BflImageOptions;

    try {
      // Submit the image generation request
      const submissionResponse = await this.submitImageGeneration(prompt, config);

      // Poll for the result
      const result = await this.pollForResult(submissionResponse, config);

      if (!result.result) {
        return {
          error: 'No result returned from BFL API',
        };
      }

      // Extract image URL from result
      let imageUrl: string;
      if (result.result.sample) {
        imageUrl = result.result.sample;
      } else if (result.result.samples && result.result.samples.length > 0) {
        imageUrl = result.result.samples[0];
      } else {
        return {
          error: 'No image URL found in result',
        };
      }

      // Return markdown formatted image
      const sanitizedPrompt = prompt
        .replace(/\r?\n|\r/g, ' ')
        .replace(/\[/g, '(')
        .replace(/\]/g, ')');
      const ellipsizedPrompt = ellipsize(sanitizedPrompt, 50);

      return {
        output: `![${ellipsizedPrompt}](${imageUrl})`,
        cached: false,
        cost: this.calculateCost(),
      };
    } catch (err) {
      logger.error(`BFL API error: ${String(err)}`);
      return {
        error: `Black Forest Labs API error: ${String(err)}`,
      };
    }
  }

  private calculateCost(): number {
    // BFL pricing varies by model - these are approximate costs
    const pricing: Record<BflModel, number> = {
      'flux-kontext-pro': 0.05,
      'flux-kontext-max': 0.08,
      'flux-pro-1.1': 0.04,
      'flux-pro': 0.04,
      'flux-dev': 0.02, // May be free tier
      'flux-fill-pro': 0.04,
      'flux-canny-pro': 0.04,
      'flux-depth-pro': 0.04,
    };
    return pricing[this.modelName] || 0.04;
  }
}

export function createBlackForestLabsProvider(
  providerPath: string,
  options: { config?: BflImageOptions; id?: string; env?: EnvOverrides } = {},
): ApiProvider {
  const [, modelName] = providerPath.split(':');
  if (!modelName) {
    throw new Error(`Invalid BFL provider path: ${providerPath}. Use format: bfl:<model-name>`);
  }
  return new BlackForestLabsProvider(modelName as BflModel, options);
}
