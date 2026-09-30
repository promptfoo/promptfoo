/**
 * ModelsLab provider for text-to-image generation.
 *
 * Handles async polling: initial response may return {status: "processing"},
 * in which case we poll the fetch endpoint until completion.
 *
 * API docs: https://docs.modelslab.com
 *
 * NOTE: ModelsLab uses key-in-body authentication (not Bearer header).
 * The API key is sent as the "key" field in the JSON request body.
 */

import { fetchWithCache } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import { ellipsize } from '../util/text';
import { buildSafeStructuredImageOutputs } from './openai/image';
import { getRequestTimeoutMs } from './shared';

import type { EnvOverrides } from '../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../types/index';

const MODELSLAB_BASE_URL = 'https://modelslab.com/api/v6';
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 60;

interface ModelsLabConfig {
  apiKey?: string;
  width?: number;
  height?: number;
  num_inference_steps?: number;
  guidance_scale?: number;
  negative_prompt?: string;
  samples?: number;
  seed?: number;
  safety_checker?: 'yes' | 'no';
  enhance_prompt?: 'yes' | 'no';
}

interface ModelsLabSuccessResponse {
  status: 'success';
  generationTime: number;
  id: number;
  output: string[];
  nsfw_content_detected?: string[] | null;
  meta: Record<string, unknown>;
}

interface ModelsLabProcessingResponse {
  status: 'processing';
  id: number;
  request_id?: string;
  output: string[] | null;
  fetch_result: string;
  eta: number;
  message: string;
}

interface ModelsLabErrorResponse {
  status: 'error';
  message: string;
}

type ModelsLabResponse =
  | ModelsLabSuccessResponse
  | ModelsLabProcessingResponse
  | ModelsLabErrorResponse;

export class ModelsLabImageProvider implements ApiProvider {
  modelName: string;
  apiKey?: string;
  config: ModelsLabConfig;

  constructor(
    modelName: string,
    options: { config?: ModelsLabConfig; id?: string; env?: EnvOverrides } = {},
  ) {
    const { config, id, env } = options;
    this.modelName = modelName;
    this.apiKey = config?.apiKey || env?.MODELSLAB_API_KEY || getEnvString('MODELSLAB_API_KEY');
    const { apiKey: _apiKey, ...restConfig } = config ?? {};
    this.config = restConfig;
    this.id = id ? () => id : this.id;
  }

  id(): string {
    return `modelslab:image:${this.modelName}`;
  }

  toString(): string {
    return `[ModelsLab Image Provider ${this.modelName}]`;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (!this.apiKey) {
      return {
        error:
          'ModelsLab API key is not set. Set the MODELSLAB_API_KEY environment variable or add `apiKey` to the provider config.',
      };
    }

    const config = { ...this.config, ...context?.prompt?.config } as ModelsLabConfig;

    const requestBody: Record<string, unknown> = {
      key: this.apiKey,
      model_id: this.modelName,
      prompt,
      width: config.width ?? 512,
      height: config.height ?? 512,
      num_inference_steps: config.num_inference_steps ?? 30,
      guidance_scale: config.guidance_scale ?? 7.5,
      samples: config.samples ?? 1,
      safety_checker: config.safety_checker ?? 'no',
      enhance_prompt: config.enhance_prompt ?? 'no',
    };

    if (config.negative_prompt) {
      requestBody.negative_prompt = config.negative_prompt;
    }
    if (config.seed !== undefined) {
      requestBody.seed = config.seed;
    }

    try {
      logger.debug('[ModelsLab] Image generation request', {
        model: this.modelName,
        prompt: ellipsize(prompt, 50),
      });

      const response = await fetchWithCache(
        `${MODELSLAB_BASE_URL}/images/text2img`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        },
        getRequestTimeoutMs(),
        'json',
        true,
      );

      let data = response.data as ModelsLabResponse;
      let cached = response.cached;

      if (data.status === 'processing') {
        const requestId = data.request_id ?? String(data.id);
        logger.debug('[ModelsLab] Image is processing, polling for result', {
          model: this.modelName,
          requestId,
        });
        data = await this.pollForCompletion(requestId);
        cached = false;
      }

      if (data.status === 'error') {
        return {
          cached,
          error: `ModelsLab API error: ${data.message || 'Unknown error'}`,
        };
      }

      if (data.status === 'success') {
        if (!data.output || data.output.length === 0) {
          return { error: 'ModelsLab returned no image URLs' };
        }
        const images = await buildSafeStructuredImageOutputs(
          { data: [{ url: data.output[0] }] },
          undefined,
          undefined,
          callApiOptions?.abortSignal,
        );
        if (!images?.[0]?.data) {
          return { error: 'The generated image could not be downloaded safely.' };
        }
        return { output: images[0].data, images, cached };
      }

      return {
        error: `Unexpected ModelsLab response status: ${(data as ModelsLabResponse).status}`,
      };
    } catch (err) {
      return { error: `ModelsLab API call error: ${String(err)}` };
    }
  }

  private async pollForCompletion(
    requestId: string,
  ): Promise<ModelsLabSuccessResponse | ModelsLabErrorResponse> {
    const fetchUrl = `${MODELSLAB_BASE_URL}/images/fetch/${requestId}`;

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      try {
        const pollResponse = await fetchWithCache(
          fetchUrl,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: this.apiKey }),
          },
          getRequestTimeoutMs(),
          'json',
          true,
        );

        const data = pollResponse.data as ModelsLabResponse;

        logger.debug('[ModelsLab] Poll attempt', {
          attempt: attempt + 1,
          requestId,
          status: data.status,
        });

        if (data.status === 'success' || data.status === 'error') {
          return data;
        }
      } catch (error) {
        logger.warn('[ModelsLab] Poll attempt failed', {
          attempt: attempt + 1,
          requestId,
          error: String(error),
        });
      }
    }

    return {
      status: 'error',
      message: `ModelsLab image generation timed out after ${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s`,
    };
  }
}
