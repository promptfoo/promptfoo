import { fetchWithProxy } from '../../util/fetch/index';
import { getRequestTimeoutMs } from '../shared';
import { OpenAiGenericProvider } from './';
import { OPENAI_TTS_MODELS } from './util';

import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { OpenAiSharedOptions } from './types';

const VALID_RESPONSE_FORMATS = new Set(['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm']);
const MAX_INPUT_CHARACTERS = 4096;

export type OpenAiTtsOptions = OpenAiSharedOptions & {
  model?: string;
  voice?: string | { id: string };
  instructions?: string;
  response_format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
  speed?: number;
};

export class OpenAiTtsProvider extends OpenAiGenericProvider {
  static OPENAI_TTS_MODEL_NAMES = OPENAI_TTS_MODELS.map((model) => model.id);

  config: OpenAiTtsOptions;

  constructor(
    modelName: string,
    options: { config?: OpenAiTtsOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(modelName, options);
    this.config = options.config || {};
  }

  id(): string {
    return `openai:tts:${this.modelName}`;
  }

  toString(): string {
    return `[OpenAI TTS Provider ${this.modelName}]`;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error(this.getMissingApiKeyErrorMessage());
    }

    const config = { ...this.config, ...context?.prompt?.config } as OpenAiTtsOptions;
    const model = config.model || this.modelName;

    if (prompt.length > MAX_INPUT_CHARACTERS) {
      return { error: `Speech input exceeds ${MAX_INPUT_CHARACTERS} characters.` };
    }
    if (config.response_format && !VALID_RESPONSE_FORMATS.has(config.response_format)) {
      return { error: `Invalid response_format: ${config.response_format}.` };
    }
    if (
      config.speed !== undefined &&
      (!Number.isFinite(config.speed) || config.speed < 0.25 || config.speed > 4)
    ) {
      return { error: 'Speech speed must be between 0.25 and 4.' };
    }
    if (config.instructions && model.startsWith('tts-1')) {
      return { error: 'Speech instructions are only supported by gpt-4o-mini-tts models.' };
    }

    const body = {
      model,
      input: prompt,
      voice: config.voice || 'alloy',
      ...(config.instructions ? { instructions: config.instructions } : {}),
      ...(config.response_format ? { response_format: config.response_format } : {}),
      ...(config.speed === undefined ? {} : { speed: config.speed }),
    };

    const startedAt = Date.now();
    try {
      const response = await fetchWithProxy(`${this.getApiUrl()}/audio/speech`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          ...this.getOpenAiRequestHeaders(config.headers),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(getRequestTimeoutMs()),
      });

      if (!response.ok) {
        const rawError = await response.text();
        let message = response.statusText;
        try {
          message = JSON.parse(rawError)?.error?.message || message;
        } catch {
          message = rawError || message;
        }
        return { error: `API error ${response.status}: ${message}` };
      }

      const audio = Buffer.from(await response.arrayBuffer()).toString('base64');
      const isHd = model === 'tts-1-hd' || model === 'tts-1-hd-1106';
      const isLegacy = model === 'tts-1' || model === 'tts-1-1106' || isHd;

      return {
        output: `Generated ${prompt.length} characters of speech`,
        audio: { data: audio, format: config.response_format || 'mp3' },
        ...(isLegacy ? { cost: (prompt.length * (isHd ? 30 : 15)) / 1e6 } : {}),
        cached: false,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      return { error: `API call error: ${String(error)}` };
    }
  }
}
