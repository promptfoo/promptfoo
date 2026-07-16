import { getCache, getScopedCacheKey, isCacheEnabled } from '../../cache';
import logger from '../../logger';
import { sha256 } from '../../util/createHash';
import {
  formatRateLimitErrorMessage,
  HttpRateLimitError,
  isAbortError,
} from '../../util/fetch/errors';
import { fetchWithRetries } from '../../util/fetch/index';
import { isSecretField, sanitizeUrl } from '../../util/sanitizer';
import { getRequestTimeoutMs } from '../shared';
import { OpenAiGenericProvider } from './';
import {
  assertOpenAiApiModel,
  hasSensitiveOpenAiCachePath,
  hasSensitiveOpenAiCacheString,
  OPENAI_TTS_MODELS,
} from './util';

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
const abortSignalIds = new WeakMap<AbortSignal, number>();
let nextAbortSignalId = 0;

function isSensitiveCacheHeader(key: string): boolean {
  return (
    isSecretField(key) ||
    /(?:authorization|api[-_]?key|token|secret|signature|credential|cookie|password)/i.test(key)
  );
}

function hasSensitiveCacheValue(value: unknown, fieldName?: string): boolean {
  if (fieldName && isSensitiveCacheHeader(fieldName)) {
    return value !== undefined && value !== null && value !== '';
  }
  if (typeof value === 'string') {
    return hasSensitiveOpenAiCacheString(value);
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasSensitiveCacheValue(item, fieldName));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([key, nestedValue]) =>
      hasSensitiveCacheValue(nestedValue, key),
    );
  }
  return false;
}

function canonicalizeCacheValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeCacheValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, canonicalizeCacheValue(nestedValue)]),
    );
  }
  return value;
}

function getAbortError(signal: AbortSignal): Error {
  const reason = signal.reason;
  if (reason instanceof Error && reason.name === 'AbortError') {
    return reason;
  }
  const error = new Error(reason instanceof Error ? reason.message : 'Request was aborted');
  error.name = 'AbortError';
  return error;
}

export type OpenAiTtsOptions = OpenAiSharedOptions & {
  model?: string;
  voice?: string | { id: string };
  instructions?: string;
  language?: string;
  format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
  response_format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
  speed?: number;
  passthrough?: object;
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
  if (config.format && !VALID_RESPONSE_FORMATS.has(config.format)) {
    return `Invalid format: ${config.format}.`;
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

function getInFlightCacheKey(cacheKey: string, signal?: AbortSignal): string {
  if (!signal) {
    return cacheKey;
  }

  let signalId = abortSignalIds.get(signal);
  if (signalId === undefined) {
    signalId = ++nextAbortSignalId;
    abortSignalIds.set(signal, signalId);
  }
  return `${cacheKey}:signal:${signalId}`;
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
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const abortSignal = callApiOptions?.abortSignal;
    if (abortSignal?.aborted) {
      throw getAbortError(abortSignal);
    }
    const config = { ...this.config, ...context?.prompt?.config } as OpenAiTtsOptions;
    const customHeaders = this.getOpenAiRequestHeaders(config.headers);
    const apiKey = this.getApiKey();
    const hasHeaderCredential = Object.entries(customHeaders).some(
      ([key, value]) => isSensitiveCacheHeader(key) && value.trim().length > 0,
    );
    if (!apiKey && this.requiresApiKey() && !hasHeaderCredential) {
      throw new Error(this.getMissingApiKeyErrorMessage());
    }

    const body = {
      model: config.model || this.modelName,
      input: prompt,
      voice: config.voice || 'alloy',
      ...(config.instructions ? { instructions: config.instructions } : {}),
      ...(config.language ? { language: config.language } : {}),
      ...(config.format ? { format: config.format } : {}),
      ...(config.response_format ? { response_format: config.response_format } : {}),
      ...(config.speed === undefined ? {} : { speed: config.speed }),
      ...(config.passthrough || {}),
    };
    const model = body.model;
    assertOpenAiApiModel(model);
    const characterCount = Array.from(body.input).length;
    const validationError = getValidationError(characterCount, model, { ...config, ...body });
    if (validationError) {
      return { error: validationError };
    }

    const startedAt = Date.now();
    const url = `${this.getApiUrl()}/audio/speech`;
    const hasCustomHeader = (name: string) =>
      Object.keys(customHeaders).some((key) => key.toLowerCase() === name);
    const requestHeaders = {
      ...(hasCustomHeader('content-type') ? {} : { 'Content-Type': 'application/json' }),
      ...(apiKey && !hasCustomHeader('authorization') ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...customHeaders,
    };
    const cacheHeaders = Object.fromEntries(
      Object.entries(requestHeaders)
        .filter(
          ([key, value]) => !isSensitiveCacheHeader(key) && !hasSensitiveCacheValue(value, key),
        )
        .map(([key, value]) => [key.toLowerCase(), value])
        .sort(([left], [right]) => left.localeCompare(right)),
    );
    const hasSensitiveHeaderValue = Object.entries(requestHeaders).some(
      ([key, value]) => !isSensitiveCacheHeader(key) && hasSensitiveCacheValue(value, key),
    );
    const hasSensitiveBody = hasSensitiveCacheValue(body);
    const hasTenantDiscriminator = Object.entries(cacheHeaders).some(
      ([key, value]) =>
        /(?:^|[-_])(?:project|tenant|account)(?:[-_]|$)/i.test(key) &&
        typeof value === 'string' &&
        value.trim().length > 0,
    );
    let sendsToOpenAiApi = false;
    try {
      sendsToOpenAiApi = new URL(url).hostname.toLowerCase() === 'api.openai.com';
    } catch {
      // Leave malformed custom URLs to the request path to validate.
    }
    let hasSensitiveUrlCredentials = false;
    let hasSensitiveUrlPath = false;
    try {
      const parsedUrl = new URL(url);
      const normalizedUrl = parsedUrl.toString();
      hasSensitiveUrlCredentials = sanitizeUrl(normalizedUrl) !== normalizedUrl;
      hasSensitiveUrlPath = hasSensitiveOpenAiCachePath(decodeURIComponent(parsedUrl.pathname));
    } catch {
      hasSensitiveUrlCredentials = true;
      hasSensitiveUrlPath = true;
    }
    const usesAuthenticatedCustomEndpoint =
      !sendsToOpenAiApi &&
      (hasSensitiveUrlCredentials || Object.keys(requestHeaders).some(isSensitiveCacheHeader));
    const cacheEnabled =
      isCacheEnabled() &&
      !hasSensitiveBody &&
      !hasSensitiveHeaderValue &&
      !hasSensitiveUrlPath &&
      !usesAuthenticatedCustomEndpoint &&
      !(typeof body.voice === 'object' && body.voice !== null && !hasTenantDiscriminator);
    const cacheKey = `openai:tts:${sha256(
      JSON.stringify(
        canonicalizeCacheValue({
          url: hasSensitiveUrlPath ? '[sensitive]' : sanitizeUrl(url),
          body: hasSensitiveBody ? '[sensitive]' : body,
          headers: cacheHeaders,
        }),
      ),
    )}`;

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
            ...(callApiOptions?.abortSignal ? { signal: callApiOptions.abortSignal } : {}),
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
        const audioFormat = body.format || body.response_format || 'mp3';
        const isPcm = audioFormat === 'pcm';
        const audio = (isPcm ? convertPcm16ToWav(audioBytes) : audioBytes).toString('base64');
        const isHd = model === 'tts-1-hd' || model === 'tts-1-hd-1106';
        const isLegacy = model === 'tts-1' || model === 'tts-1-1106' || isHd;

        const result: ProviderResponse = {
          output: `Generated ${characterCount} characters of speech`,
          audio: { data: audio, format: isPcm ? 'wav' : audioFormat },
          ...(isLegacy ? { cost: (characterCount * (isHd ? 30 : 15)) / 1e6 } : {}),
          cached: false,
          latencyMs: Date.now() - startedAt,
        };

        if (cacheEnabled && !this.shouldBustCache(context)) {
          await cacheResponse(cacheKey, result);
        }

        return result;
      } catch (error) {
        if (callApiOptions?.abortSignal?.aborted) {
          throw getAbortError(callApiOptions.abortSignal);
        }
        if (isAbortError(error)) {
          throw error;
        }
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
      ? coalesceRequest(
          getInFlightCacheKey(getScopedCacheKey(cacheKey), callApiOptions?.abortSignal),
          requestSpeech,
        )
      : requestSpeech();
  }
}
