import { getCache, getScopedCacheKey, isCacheEnabled } from '../../cache';
import logger from '../../logger';
import { sha256 } from '../../util/createHash';
import { formatRateLimitErrorMessage, HttpRateLimitError } from '../../util/fetch/errors';
import { fetchWithRetries } from '../../util/fetch/index';
import { isSecretField, sanitizeUrl } from '../../util/sanitizer';
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
const inFlightRequests = new Map<string, Promise<ProviderResponse>>();

export type OpenAiTtsOptions = OpenAiSharedOptions & {
  model?: string;
  voice?: string | { id: string };
  instructions?: string;
  response_format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
  speed?: number;
};

function getValidationError(
  characterCount: number,
  model: string,
  config: OpenAiTtsOptions,
): string | undefined {
  if (characterCount > MAX_INPUT_CHARACTERS) {
    return `Speech input exceeds ${MAX_INPUT_CHARACTERS} characters.`;
  }
  if (config.response_format && !VALID_RESPONSE_FORMATS.has(config.response_format)) {
    return `Invalid response_format: ${config.response_format}.`;
  }
  if (
    config.speed !== undefined &&
    (!Number.isFinite(config.speed) || config.speed < 0.25 || config.speed > 4)
  ) {
    return 'Speech speed must be between 0.25 and 4.';
  }
  if (config.instructions && model.startsWith('tts-1')) {
    return 'Speech instructions are only supported by gpt-4o-mini-tts models.';
  }
  return undefined;
}

async function getCachedResponse(
  cacheKey: string,
  startedAt: number,
): Promise<ProviderResponse | undefined> {
  try {
    const cachedResponse = await getCache().get<string>(cacheKey);
    if (!cachedResponse) {
      return undefined;
    }
    return {
      ...(JSON.parse(cachedResponse) as ProviderResponse),
      cached: true,
      cost: 0,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    logger.debug('[OpenAI TTS] Failed to read cached response', { error });
    return undefined;
  }
}

async function cacheResponse(cacheKey: string, response: ProviderResponse): Promise<void> {
  try {
    await getCache().set(cacheKey, JSON.stringify(response));
  } catch (error) {
    logger.debug('[OpenAI TTS] Failed to cache response', { error });
  }
}

function convertPcm16ToWav(pcmData: Buffer, sampleRate = 24_000): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmData.length, 40);
  return Buffer.concat([header, pcmData]);
}

async function coalesceRequest(
  cacheKey: string,
  request: () => Promise<ProviderResponse>,
): Promise<ProviderResponse> {
  const inFlight = inFlightRequests.get(cacheKey);
  if (inFlight) {
    const result = await inFlight;
    return result.error ? result : { ...result, cached: true, cost: 0 };
  }

  const pending = request();
  inFlightRequests.set(cacheKey, pending);
  try {
    return await pending;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

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
    if (!apiKey && this.requiresApiKey()) {
      throw new Error(this.getMissingApiKeyErrorMessage());
    }

    const config = { ...this.config, ...context?.prompt?.config } as OpenAiTtsOptions;
    const model = config.model || this.modelName;

    const characterCount = Array.from(prompt).length;
    const validationError = getValidationError(characterCount, model, config);
    if (validationError) {
      return { error: validationError };
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
    const url = `${this.getApiUrl()}/audio/speech`;
    const requestHeaders = {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...this.getOpenAiRequestHeaders(config.headers),
    };
    const cacheHeaders = Object.fromEntries(
      Object.entries(requestHeaders)
        .filter(
          ([key]) =>
            !isSecretField(key) &&
            !/(?:authorization|api[-_]?key|token|secret|signature|credential|cookie|password)/i.test(
              key,
            ),
        )
        .sort(([left], [right]) => left.localeCompare(right)),
    );
    const cacheKey = `openai:tts:${sha256(
      JSON.stringify({ url: sanitizeUrl(url), body, headers: cacheHeaders }),
    )}`;
    const hasTenantDiscriminator = Object.entries(cacheHeaders).some(
      ([key, value]) =>
        /(?:^|[-_])(?:organization|org|project|tenant|account)(?:[-_]|$)/i.test(key) &&
        typeof value === 'string' &&
        value.trim().length > 0,
    );
    const cacheEnabled =
      isCacheEnabled() &&
      !(typeof config.voice === 'object' && config.voice !== null && !hasTenantDiscriminator);

    if (cacheEnabled && !this.shouldBustCache(context)) {
      const cachedResponse = await getCachedResponse(cacheKey, startedAt);
      if (cachedResponse) {
        return cachedResponse;
      }
    }

    const requestSpeech = async (): Promise<ProviderResponse> => {
      try {
        const response = await fetchWithRetries(
          url,
          {
            method: 'POST',
            headers: requestHeaders,
            body: JSON.stringify(body),
          },
          getRequestTimeoutMs(),
          config.maxRetries,
        );

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

        const audioBytes = Buffer.from(await response.arrayBuffer());
        const isPcm = config.response_format === 'pcm';
        const audio = (isPcm ? convertPcm16ToWav(audioBytes) : audioBytes).toString('base64');
        const isHd = model === 'tts-1-hd' || model === 'tts-1-hd-1106';
        const isLegacy = model === 'tts-1' || model === 'tts-1-1106' || isHd;

        const result: ProviderResponse = {
          output: `Generated ${characterCount} characters of speech`,
          audio: { data: audio, format: isPcm ? 'wav' : config.response_format || 'mp3' },
          ...(isLegacy ? { cost: (characterCount * (isHd ? 30 : 15)) / 1e6 } : {}),
          cached: false,
          latencyMs: Date.now() - startedAt,
        };

        if (cacheEnabled) {
          await cacheResponse(cacheKey, result);
        }

        return result;
      } catch (error) {
        if (error instanceof HttpRateLimitError) {
          return {
            error: formatRateLimitErrorMessage(error),
            metadata: {
              rateLimitKind: error.kind,
              http: {
                status: error.status,
                statusText: error.statusText,
                headers: error.headers ?? {},
              },
            },
          };
        }
        return { error: `API call error: ${String(error)}` };
      }
    };

    return cacheEnabled && !this.shouldBustCache(context)
      ? coalesceRequest(getScopedCacheKey(cacheKey), requestSpeech)
      : requestSpeech();
  }
}
