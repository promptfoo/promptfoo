/**
 * ModelsLab provider for promptfoo.
 *
 * Supports text-to-image generation via the ModelsLab API.
 * Handles the async pattern: initial response may be {status: "processing"},
 * in which case the provider polls the fetch endpoint until completion.
 *
 * API docs: https://docs.modelslab.com
 *
 * NOTE: ModelsLab uses key-in-body authentication (not Bearer header).
 * The API key appears in the request body as the "key" field.
 */

import { fetchWithCache } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import { REQUEST_TIMEOUT_MS } from '../providers/shared';
import { ellipsize } from '../util/text';

import type { EnvOverrides } from '../types/env';
import type { ApiProvider, CallApiContextParams, CallApiOptionsParams, ProviderResponse } from '../types/index';

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
  [key: string]: any;
}

interface ModelsLabSuccessResponse {
  status: 'success';
  generationTime: number;
  id: number;
  output: string[];
  nsfw_content_detected?: string[] | null;
  meta: Record<string, any>;
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
    this.apiKey =
      config?.apiKey ||
      env?.MODELSLAB_API_KEY ||
      getEnvString('MODELSLAB_API_KEY');
    const { apiKey: _apiKey, ...restConfig } = config ?? {};
    this.config = restConfig;
    if (id) {
      this.id = () => id;
    }
  }

  id(): string {
    return 'modelslab:image:' + this.modelName;
  }

  toString(): string {
    return '[ModelsLab Image Provider ' + this.modelName + ']';
  }

  async callApi(
    prompt: string,
    _context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (!this.apiKey) {
      return {
        error:
          'ModelsLab API key is not set. Set the MODELSLAB_API_KEY environment variable or add `apiKey` to the provider config.',
      };
    }

    const requestBody: Record<string, any> = {
      key: this.apiKey,
      model_id: this.modelName,
      prompt,
      width: this.config.width ?? 512,
      height: this.config.height ?? 512,
      num_inference_steps: this.config.num_inference_steps ?? 30,
      guidance_scale: this.config.guidance_scale ?? 7.5,
      samples: this.config.samples ?? 1,
      safety_checker: this.config.safety_checker ?? 'no',
      enhance_prompt: this.config.enhance_prompt ?? 'no',
    };

    if (this.config.negative_prompt) {
      requestBody.negative_prompt = this.config.negative_prompt;
    }
    if (this.config.seed !== undefined) {
      requestBody.seed = this.config.seed;
    }
    for (const [key, val] of Object.entries(this.config)) {
      if (!(key in requestBody)) {
        requestBody[key] = val;
      }
    }

    try {
      logger.debug('ModelsLab image generation request: model=' + this.modelName + ', prompt="' + ellipsize(prompt, 50) + '"');

      const response = await fetchWithCache(
        MODELSLAB_BASE_URL + '/images/text2img',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        },
        REQUEST_TIMEOUT_MS,
        'json',
        false,
      );

      let data = response.data as ModelsLabSuccessResponse | ModelsLabProcessingResponse | ModelsLabErrorResponse;

      if (data.status === 'processing') {
        const requestId = (data as ModelsLabProcessingResponse).request_id
          ?? String((data as ModelsLabProcessingResponse).id);
        logger.debug('ModelsLab image is processing (id=' + requestId + '). Polling for result...');
        data = await this.pollForCompletion(requestId);
      }

      if (data.status === 'error') {
        const message = (data as ModelsLabErrorResponse).message || 'Unknown error';
        return { error: 'ModelsLab API error: ' + message };
      }

      if (data.status === 'success') {
        const output = (data as ModelsLabSuccessResponse).output;
        if (!output || output.length === 0) {
          return { error: 'ModelsLab returned no image URLs' };
        }
        const imageUrl = output[0];
        const sanitizedPrompt = prompt
          .replace(/\r?\n|\r/g, ' ')
          .replace(/\[/g, '(')
          .replace(/\]/g, ')');
        return {
          output: '![' + ellipsize(sanitizedPrompt, 50) + '](' + imageUrl + ')',
        };
      }

      return { error: 'Unexpected ModelsLab response status: ' + (data as any).status };
    } catch (err) {
      return { error: 'ModelsLab API call error: ' + String(err) };
    }
  }

  private async pollForCompletion(requestId: string): Promise<ModelsLabSuccessResponse | ModelsLabErrorResponse> {
    const fetchUrl = MODELSLAB_BASE_URL + '/images/fetch/' + requestId;

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const pollResponse = await fetchWithCache(
        fetchUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: this.apiKey }),
        },
        REQUEST_TIMEOUT_MS,
        'json',
        false,
      );

      const data = pollResponse.data as ModelsLabSuccessResponse | ModelsLabProcessingResponse | ModelsLabErrorResponse;
      logger.debug('ModelsLab poll attempt ' + (attempt + 1) + ': status=' + data.status);

      if (data.status === 'success' || data.status === 'error') {
        return data;
      }
    }

    return {
      status: 'error',
      message: 'ModelsLab image generation timed out after ' + ((MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000) + 's',
    };
  }
}
