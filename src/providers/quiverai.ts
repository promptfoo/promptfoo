import { fetchWithCache } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import { fetchWithProxy } from '../util/fetch';
import { getRequestTimeoutMs } from './shared';

import type { EnvOverrides } from '../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from '../types/providers';

const QUIVERAI_API_BASE_URL = 'https://api.quiver.ai/v1';
const QUIVERAI_DEFAULT_MODEL = 'arrow-1.1';

export type QuiverAiMode = 'generation' | 'vectorize';

// -- Response types per OpenAPI spec --

interface SvgDocument {
  svg: string;
  mime_type: string;
}

// Deprecated by the API; tokens are zeroed but kept for compatibility.
interface SvgUsage {
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
}

interface SvgResponse {
  id: string;
  created: number;
  data: SvgDocument[];
  credits?: number;
  usage?: SvgUsage;
}

interface QuiverAiErrorResponse {
  status: number;
  code: string;
  message: string;
  request_id?: string;
}

type ImageReference = { url: string } | { base64: string };

// -- Config types --

interface QuiverAiSharedOptions {
  apiKey?: string;
  apiBaseUrl?: string;
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  presence_penalty?: number;
  max_output_tokens?: number;
}

export interface QuiverAiProviderOptions extends QuiverAiSharedOptions {
  // Generation
  instructions?: string;
  references?: Array<string | ImageReference>;
  n?: number;

  // Vectorization
  image?: ImageReference;
  auto_crop?: boolean;
  target_size?: number;
}

const SAMPLING_KEYS = ['temperature', 'top_p', 'presence_penalty', 'max_output_tokens'] as const;

const GENERATION_KEYS = ['instructions', 'n'] as const;
const VECTORIZE_KEYS = ['auto_crop', 'target_size'] as const;

// Codes for which retrying within the request lifetime cannot succeed.
const NON_RETRYABLE_429_CODES = new Set(['weekly_limit_exceeded']);

const MAX_RETRY_AFTER_MS = 60_000;
const MAX_RETRIES = 3;

/**
 * QuiverAI provider for SVG vector graphics.
 *
 * Supports two endpoints:
 *  - Text → SVG via `POST /v1/svgs/generations` (mode: 'generation', the default).
 *  - Image → SVG via `POST /v1/svgs/vectorizations` (mode: 'vectorize').
 *
 * Streams by default for faster time-to-first-token; set `stream: false`
 * to enable on-disk response caching.
 */
export class QuiverAiProvider implements ApiProvider {
  config: QuiverAiProviderOptions;
  modelName: string;
  mode: QuiverAiMode;

  private apiKey: string;
  private apiBaseUrl: string;

  constructor(
    modelName: string,
    options: {
      config?: QuiverAiProviderOptions;
      id?: string;
      env?: EnvOverrides;
      mode?: QuiverAiMode;
    } = {},
  ) {
    const { config, id, env, mode = 'generation' } = options;
    this.modelName = modelName;
    this.mode = mode;
    this.apiKey = config?.apiKey || env?.QUIVERAI_API_KEY || getEnvString('QUIVERAI_API_KEY') || '';
    this.apiBaseUrl = config?.apiBaseUrl || QUIVERAI_API_BASE_URL;
    if (id) {
      this.id = () => id;
    }
    this.config = config || {};
  }

  id(): string {
    return this.mode === 'vectorize'
      ? `quiverai:vectorize:${this.modelName}`
      : `quiverai:${this.modelName}`;
  }

  toString(): string {
    const label = this.mode === 'vectorize' ? 'Vectorize ' : '';
    return `[QuiverAI ${label}Provider ${this.modelName}]`;
  }

  getApiUrl(): string {
    const path = this.mode === 'vectorize' ? '/svgs/vectorizations' : '/svgs/generations';
    return `${this.apiBaseUrl}${path}`;
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    if (!this.apiKey) {
      return {
        error:
          'QuiverAI API key is not set. Set the QUIVERAI_API_KEY environment variable or add apiKey to the provider config. Get a key at https://app.quiver.ai/settings/api-keys',
      };
    }

    const config: QuiverAiProviderOptions = {
      ...this.config,
      ...context?.prompt?.config,
    };

    const useStream = config.stream !== false;

    let body: Record<string, unknown>;
    try {
      body = this.buildRequestBody(prompt, config, useStream);
    } catch (error) {
      return { error: `${(error as Error).message}` };
    }

    try {
      if (useStream) {
        return await this.callApiStreaming(body);
      }
      return await this.callApiNonStreaming(body, context);
    } catch (error) {
      logger.error(`QuiverAI API call error: ${error}`);
      return { error: `QuiverAI API call error: ${error}` };
    }
  }

  private buildRequestBody(
    prompt: string,
    config: QuiverAiProviderOptions,
    useStream: boolean,
  ): Record<string, unknown> {
    const sampling = pickDefined(config as Record<string, unknown>, [...SAMPLING_KEYS]);

    if (this.mode === 'vectorize') {
      const image = getConfiguredVectorizeImage(config.image) ?? parsePromptAsImage(prompt);
      return {
        model: this.modelName,
        image,
        stream: useStream,
        ...sampling,
        ...pickDefined(config as Record<string, unknown>, [...VECTORIZE_KEYS]),
      };
    }

    return {
      model: this.modelName,
      prompt,
      stream: useStream,
      ...sampling,
      ...pickDefined(config as Record<string, unknown>, [...GENERATION_KEYS]),
      ...(config.references && { references: normalizeReferences(config.references) }),
    };
  }

  private async callApiNonStreaming(
    body: Record<string, unknown>,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
    const { data, cached, status, statusText } = await fetchWithCache(
      this.getApiUrl(),
      {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      },
      getRequestTimeoutMs(),
      'json',
      context?.bustCache ?? context?.debug,
    );

    if (status < 200 || status >= 300) {
      if (data && typeof data === 'object' && 'code' in data && 'message' in data) {
        return { error: formatError(data as unknown as QuiverAiErrorResponse) };
      }
      return {
        error: `API error: ${status} ${statusText}\n${typeof data === 'string' ? data : JSON.stringify(data)}`,
      };
    }

    const response = data as unknown as SvgResponse;
    return {
      cached,
      output: extractSvgOutput(response),
      tokenUsage: mapTokenUsage(response.usage, cached ? 0 : 1),
      metadata: buildMetadata({
        responseId: response.id,
        credits: response.credits,
      }),
    };
  }

  private async callApiStreaming(body: Record<string, unknown>): Promise<ProviderResponse> {
    let lastResp: Response | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), getRequestTimeoutMs());
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

      try {
        lastResp = await fetchWithProxy(this.getApiUrl(), {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        // Retry on 429 rate_limit_exceeded. Transient 5xx (502/503/504/524) are
        // handled by fetchWithProxy's built-in retry. Weekly limits cannot be
        // recovered within a single request so we surface them immediately.
        if (
          lastResp.status === 429 &&
          attempt < MAX_RETRIES &&
          !(await isNonRetryable429(lastResp))
        ) {
          const waitMs = getRetryAfterMs(lastResp.headers, attempt);
          logger.debug(
            `QuiverAI: rate limited, retry ${attempt + 1}/${MAX_RETRIES} in ${waitMs}ms`,
          );
          await lastResp.body?.cancel();
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }

        if (!lastResp.ok) {
          return await handleStreamingError(lastResp);
        }

        if (!lastResp.body) {
          return { error: 'QuiverAI streaming response has no body' };
        }

        reader = lastResp.body.getReader();
        return await readSSEStream(reader);
      } finally {
        reader?.cancel().catch(() => {});
        clearTimeout(timeout);
      }
    }

    return handleStreamingError(lastResp!);
  }
}

// -- Helpers --

async function isNonRetryable429(resp: Response): Promise<boolean> {
  // Peek the body without consuming the original response. The retry path
  // would otherwise lose this body, so we clone before reading.
  try {
    const clone = resp.clone();
    const data = (await clone.json()) as Partial<QuiverAiErrorResponse>;
    return typeof data?.code === 'string' && NON_RETRYABLE_429_CODES.has(data.code);
  } catch {
    return false;
  }
}

async function handleStreamingError(resp: Response): Promise<ProviderResponse> {
  try {
    const errData = (await resp.json()) as QuiverAiErrorResponse;
    return { error: formatError(errData) };
  } catch {
    return { error: `QuiverAI API error: HTTP ${resp.status}` };
  }
}

interface StreamEventData {
  type?: 'generating' | 'reasoning' | 'draft' | 'content' | string;
  id?: string;
  index?: number;
  svg?: string;
  text?: string;
  credits?: number;
  usage?: SvgUsage;
}

async function readSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<ProviderResponse> {
  const decoder = new TextDecoder();
  let buffer = '';

  // Per-output state, keyed by the stable id from the `data` payload (or
  // synthetic key when id is missing). For n=1 there will only be one entry.
  const outputs = new Map<string, { index: number; svg: string; credits?: number }>();
  let totalCredits: number | undefined;
  let lastUsage: SvgUsage | undefined;
  let responseId: string | undefined;

  const ingest = (line: string) => {
    const data = parseSSEData(line);
    if (!data) {
      return;
    }
    if (data.type === 'content' && typeof data.svg === 'string') {
      const key = data.id ?? `${data.index ?? outputs.size}`;
      outputs.set(key, {
        index: data.index ?? outputs.size,
        svg: data.svg,
        credits: data.credits,
      });
      if (typeof data.credits === 'number') {
        totalCredits = (totalCredits ?? 0) + data.credits;
      }
      if (!responseId && data.id) {
        responseId = data.id;
      }
    }
    if (data.usage) {
      lastUsage = data.usage;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      ingest(line);
    }
  }
  if (buffer.trim()) {
    ingest(buffer);
  }

  if (outputs.size === 0) {
    return { error: 'QuiverAI streaming response contained no SVG content' };
  }

  const ordered = [...outputs.values()].sort((a, b) => a.index - b.index).map((o) => o.svg);
  const output = ordered.length === 1 ? ordered[0] : ordered.join('\n\n');

  return {
    output,
    tokenUsage: mapTokenUsage(lastUsage, 1),
    metadata: buildMetadata({ responseId, credits: totalCredits }),
  };
}

function pickDefined(
  obj: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(keys.filter((k) => obj[k] != null).map((k) => [k, obj[k]]));
}

function formatError(err: QuiverAiErrorResponse): string {
  const base = `${err.message} [${err.code}]`;
  return err.request_id ? `${base} (request_id: ${err.request_id})` : base;
}

function mapTokenUsage(usage: SvgUsage | undefined, numRequests: number) {
  return {
    total: usage?.total_tokens || 0,
    prompt: usage?.input_tokens || 0,
    completion: usage?.output_tokens || 0,
    numRequests,
  };
}

function buildMetadata(parts: {
  responseId?: string;
  credits?: number;
}): Record<string, any> | undefined {
  const meta: Record<string, unknown> = {};
  if (parts.responseId) {
    meta.responseId = parts.responseId;
  }
  if (typeof parts.credits === 'number') {
    meta.credits = parts.credits;
  }
  return Object.keys(meta).length ? (meta as Record<string, any>) : undefined;
}

function getRetryAfterMs(headers: Headers, attempt: number): number {
  const retryAfter = headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (!Number.isNaN(seconds)) {
      return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
    }
    const date = new Date(retryAfter);
    if (!Number.isNaN(date.getTime())) {
      return Math.min(Math.max(0, date.getTime() - Date.now()), MAX_RETRY_AFTER_MS);
    }
  }
  return Math.pow(2, attempt) * 1000;
}

function parseSSEData(line: string): StreamEventData | null {
  if (!line.startsWith('data:')) {
    return null;
  }
  const payload = line.slice(line.startsWith('data: ') ? 6 : 5).trim();
  if (!payload || payload === '[DONE]') {
    return null;
  }
  try {
    return JSON.parse(payload) as StreamEventData;
  } catch {
    logger.debug(`QuiverAI: failed to parse SSE data: ${payload}`);
    return null;
  }
}

function extractSvgOutput(response: SvgResponse): string {
  if (Array.isArray(response.data)) {
    const svgs = response.data.map((item) => item.svg).filter(Boolean);
    if (svgs.length === 1) {
      return svgs[0];
    }
    if (svgs.length > 1) {
      return svgs.join('\n\n');
    }
  }
  return JSON.stringify(response);
}

function normalizeReferences(refs: Array<string | ImageReference>): ImageReference[] {
  return refs.map((ref) => (typeof ref === 'string' ? { url: ref } : ref));
}

const BASE64_DATA_URL_PATTERN = /^data:image\/[a-zA-Z0-9.+-]+(?:;[^,;]+)*;base64,(.+)$/i;

function normalizeImageReference(value: unknown): ImageReference | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = value as { url?: unknown; base64?: unknown };
  if (typeof candidate.url === 'string' && candidate.url.trim()) {
    return { url: candidate.url };
  }
  if (typeof candidate.base64 === 'string' && candidate.base64.trim()) {
    return { base64: candidate.base64 };
  }
  return null;
}

function getConfiguredVectorizeImage(image: unknown): ImageReference | undefined {
  if (image === undefined) {
    return undefined;
  }

  const normalized = normalizeImageReference(image);
  if (!normalized) {
    throw new Error(
      'QuiverAI vectorize `image` must contain a non-empty `url` or `base64` string.',
    );
  }
  return normalized;
}

function parsePromptAsImage(prompt: string): ImageReference {
  const trimmed = prompt.trim();
  if (!trimmed) {
    throw new Error(
      'QuiverAI vectorize requires an image: pass a URL or base64 string as the prompt, or set `image` in the provider config.',
    );
  }
  const dataUrlMatch = BASE64_DATA_URL_PATTERN.exec(trimmed);
  if (dataUrlMatch) {
    return { base64: dataUrlMatch[1] };
  }
  if (/^data:image\//i.test(trimmed)) {
    throw new Error('QuiverAI vectorize data URLs must be base64-encoded.');
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return { url: trimmed };
  }
  if (trimmed.startsWith('{')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return { base64: trimmed };
    }

    if (parsed && typeof parsed === 'object') {
      const image = normalizeImageReference(parsed);
      if (image) {
        return image;
      }

      if ('image' in parsed) {
        const nestedImage = normalizeImageReference((parsed as { image?: unknown }).image);
        if (nestedImage) {
          return nestedImage;
        }
        throw new Error(
          'QuiverAI vectorize nested `image` must contain a non-empty `url` or `base64` string.',
        );
      }

      throw new Error(
        'QuiverAI vectorize JSON image input must contain a non-empty `url` or `base64` string.',
      );
    }
  }
  return { base64: trimmed };
}

export function createQuiverAiProvider(
  providerPath: string,
  providerOptions: ProviderOptions = {},
  env?: EnvOverrides,
): ApiProvider {
  const splits = providerPath.split(':');
  const modelType = splits[1];

  // Routing:
  //   quiverai:<model>             → generation (default)
  //   quiverai:chat:<model>        → generation (legacy alias)
  //   quiverai:generate:<model>    → generation (explicit)
  //   quiverai:vectorize:<model>   → vectorization
  let mode: QuiverAiMode = 'generation';
  let modelStart = 1;
  if (modelType === 'vectorize') {
    mode = 'vectorize';
    modelStart = 2;
  } else if (modelType === 'generate' || modelType === 'chat') {
    modelStart = 2;
  }

  const modelName = splits.slice(modelStart).join(':') || QUIVERAI_DEFAULT_MODEL;

  return new QuiverAiProvider(modelName, {
    config: providerOptions.config as QuiverAiProviderOptions,
    id: providerOptions.id,
    env: providerOptions.env ?? env,
    mode,
  });
}
