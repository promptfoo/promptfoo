import { fetchWithCache } from '../../cache';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import type { CallApiContextParams, CallApiOptionsParams, ProviderResponse } from '../../types';
import type { EnvOverrides } from '../../types/env';
import type { ApiProvider } from '../../types/providers';
import { REQUEST_TIMEOUT_MS } from '../shared';

export type HyperbolicAudioOptions = {
  apiKey?: string;
  apiKeyEnvar?: string;
  apiBaseUrl?: string;
  model?: string;
  voice?: string;
  speed?: number;
  language?: string;
};

export const HYPERBOLIC_AUDIO_MODELS = [
  {
    id: 'Melo-TTS',
    aliases: ['melo-tts', 'melo'],
    cost: 0.001, // $0.001 per 1000 characters
  },
];

export class HyperbolicAudioProvider implements ApiProvider {
  modelName: string;
  config: HyperbolicAudioOptions;
  env?: EnvOverrides;

  constructor(
    modelName: string,
    options: { config?: HyperbolicAudioOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    this.modelName = modelName || 'Melo-TTS';
    this.config = options.config || {};
    this.env = options.env;
  }

  getApiKey(): string | undefined {
    if (this.config?.apiKey) {
      return this.config.apiKey;
    }
    return this.env?.HYPERBOLIC_API_KEY || getEnvString('HYPERBOLIC_API_KEY');
  }

  getApiUrl(): string {
    return this.config?.apiBaseUrl || 'https://api.hyperbolic.xyz/v1';
  }

  id(): string {
    return `hyperbolic:audio:${this.modelName}`;
  }

  toString(): string {
    return `[Hyperbolic Audio Provider ${this.modelName}]`;
  }

  private getApiModelName(): string {
    const model = HYPERBOLIC_AUDIO_MODELS.find(
      (m) => m.id === this.modelName || (m.aliases && m.aliases.includes(this.modelName)),
    );
    return model?.id || this.modelName;
  }

  private calculateAudioCost(textLength: number): number {
    const model = HYPERBOLIC_AUDIO_MODELS.find(
      (m) => m.id === this.modelName || (m.aliases && m.aliases.includes(this.modelName)),
    );
    const costPer1000Chars = model?.cost || 0.001;
    return (textLength / 1000) * costPer1000Chars;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error(
        'Hyperbolic API key is not set. Set the HYPERBOLIC_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    const config = {
      ...this.config,
      ...context?.prompt?.config,
    } as HyperbolicAudioOptions;

    const endpoint = '/audio/generation';

    const body: Record<string, any> = {
      text: prompt,
    };

    // Add optional parameters
    if (config.model) {
      body.model = config.model;
    }
    if (config.voice) {
      body.voice = config.voice;
    }
    if (config.speed !== undefined) {
      body.speed = config.speed;
    }
    if (config.language) {
      body.language = config.language;
    }

    logger.debug(`Calling Hyperbolic Audio API: ${JSON.stringify(body)}`);

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    } as Record<string, string>;

    let data: any, status: number, statusText: string;
    let cached = false;
    try {
      ({ data, cached, status, statusText } = await fetchWithCache(
        `${this.getApiUrl()}${endpoint}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
      ));

      if (status < 200 || status >= 300) {
        return {
          error: `API error: ${status} ${statusText}\n${typeof data === 'string' ? data : JSON.stringify(data)}`,
        };
      }
    } catch (err) {
      logger.error(`API call error: ${String(err)}`);
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    logger.debug(`\tHyperbolic audio API response: ${JSON.stringify(data)}`);

    if (data.error) {
      return {
        error: typeof data.error === 'string' ? data.error : JSON.stringify(data.error),
      };
    }

    try {
      if (!data.audio) {
        return {
          error: 'No audio data returned from API',
        };
      }

      const cost = cached ? 0 : this.calculateAudioCost(prompt.length);

      return {
        output: data.audio,
        cached,
        cost,
        ...(data.audio
          ? {
              isBase64: true,
              audio: {
                data: data.audio,
                format: 'wav',
              },
            }
          : {}),
      };
    } catch (err) {
      return {
        error: `API error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }
}

export function createHyperbolicAudioProvider(
  providerPath: string,
  options: { config?: HyperbolicAudioOptions; id?: string; env?: EnvOverrides } = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const modelName = splits.slice(2).join(':') || 'Melo-TTS';
  return new HyperbolicAudioProvider(modelName, options);
}
