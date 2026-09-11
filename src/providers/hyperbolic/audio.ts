import { getEnvString } from '../../envars';
import { requestHyperbolicJson } from './transport';

import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { ApiProvider } from '../../types/providers';

export type HyperbolicAudioOptions = {
  apiKey?: string;
  apiKeyEnvar?: string;
  apiBaseUrl?: string;
  model?: string;
  voice?: string;
  speaker?: string;
  speed?: number;
  language?: string;
  sdp_ratio?: number;
  noise_scale?: number;
  noise_scale_w?: number;
};

const HYPERBOLIC_API_BASE_URL = 'https://api.hyperbolic.xyz/v1';

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
    return this.config?.apiBaseUrl || HYPERBOLIC_API_BASE_URL;
  }

  id(): string {
    return `hyperbolic:audio:${this.modelName}`;
  }

  toString(): string {
    return `[Hyperbolic Audio Provider ${this.modelName}]`;
  }

  private isHyperbolicApi(): boolean {
    try {
      const url = new URL(this.getApiUrl());
      return (
        url.origin === 'https://api.hyperbolic.xyz' && url.pathname.replace(/\/+$/, '') === '/v1'
      );
    } catch {
      return false;
    }
  }

  private calculateAudioCost(textLength: number): number {
    // Hyperbolic documents $5 per million characters. Preserve the legacy estimate
    // for custom endpoints, whose pricing is independent of Hyperbolic's service.
    if (this.isHyperbolicApi()) {
      return (textLength / 1000) * 0.005;
    }
    return (textLength / 1000) * 0.001;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    callApiOptions?.abortSignal?.throwIfAborted();
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

    // The native endpoint uses Melo TTS without a model selector. Keep explicit
    // model/voice passthrough for compatibility with existing custom endpoints.
    if (!this.isHyperbolicApi()) {
      if (config.model) {
        body.model = config.model;
      }
      if (config.voice) {
        body.voice = config.voice;
      }
    }
    if (config.speed !== undefined) {
      body.speed = config.speed;
    }
    if (config.language) {
      body.language = config.language;
    }
    if (config.speaker) {
      body.speaker = config.speaker;
    }
    for (const parameter of ['sdp_ratio', 'noise_scale', 'noise_scale_w'] as const) {
      if (config[parameter] !== undefined) {
        body[parameter] = config[parameter];
      }
    }

    const result = await requestHyperbolicJson<{ audio?: string }>(
      `${this.getApiUrl()}${endpoint}`,
      apiKey,
      body,
      context,
      callApiOptions?.abortSignal,
    );
    if (!result.ok) {
      return { error: result.error };
    }
    const { data, cached, latencyMs } = result;

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
        latencyMs,
        cost,
        isBase64: true,
        audio: {
          data: data.audio,
          format: this.isHyperbolicApi() ? 'mp3' : 'wav',
        },
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
