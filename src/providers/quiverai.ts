import { fetchWithCache } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import { fetchWithProxy } from '../util/fetch';
import { REQUEST_TIMEOUT_MS } from './shared';

import type { EnvOverrides } from '../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from '../types/providers';

const QUIVERAI_API_BASE_URL = 'https://api.quiver.ai/v1';
const QUIVERAI_DEFAULT_MODEL = 'arrow-preview';

// -- Response types per OpenAPI spec --

interface SvgDocument {
  svg: string;
  mime_type: string;
}

interface SvgUsage {
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
}

interface SvgResponse {
  id: string;
  created: number;
  data: SvgDocument[];
  usage?: SvgUsage;
}

interface QuiverAiErrorResponse {
  status: number;
  code: string;
  message: string;
  request_id?: string;
}

// -- Config types --

export interface QuiverAiProviderOptions {
  apiKey?: string;
  apiBaseUrl?: string;
  instructions?: string;
  references?: Array<{ url: string } | { base64: string }>;
  n?: number;
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  presence_penalty?: number;
  max_output_tokens?: number;
}

/**
 * QuiverAI provider for SVG vector graphics generation using the Arrow model.
 * Uses QuiverAI's native SVG generation API (POST /v1/svgs/generations).
 * Streams by default for faster time-to-first-token.
 */
export class QuiverAiProvider implements ApiProvider {
  config: QuiverAiProviderOptions;
  modelName: string;

  private apiKey: string;
  private apiBaseUrl: string;

  constructor(
    modelName: string,
    options: { config?: QuiverAiProviderOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    const { config, id, env } = options;
    this.modelName = modelName;
    this.apiKey = config?.apiKey || env?.QUIVERAI_API_KEY || getEnvString('QUIVERAI_API_KEY') || '';
    this.apiBaseUrl = config?.apiBaseUrl || QUIVERAI_API_BASE_URL;
    if (id) {
      this.id = () => id;
    }
    this.config = config || {};
  }

  id(): string {
    return `quiverai:${this.modelName}`;
  }

  toString(): string {
    return `[QuiverAI Provider ${this.modelName}]`;
  }

  getApiUrl(): string {
    return `${this.apiBaseUrl}/svgs/generations`;
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

    const body: Record<string, unknown> = {
      model: this.modelName,
      prompt,
      stream: useStream,
      ...pickDefined(config as Record<string, unknown>, [
        'instructions',
        'references',
        'n',
        'temperature',
        'top_p',
        'presence_penalty',
        'max_output_tokens',
      ]),
    };

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
      REQUEST_TIMEOUT_MS,
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
    };
  }

  private async callApiStreaming(body: Record<string, unknown>): Promise<ProviderResponse> {
    const maxRetries = 3;
    let lastResp: Response | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

      try {
        lastResp = await fetchWithProxy(this.getApiUrl(), {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        // Retry on 429 rate limit. Transient 5xx (502/503/504/524) are handled by
        // fetchWithProxy's built-in retry which checks statusText to distinguish
        // permanent from transient failures before retrying.
        if (lastResp.status === 429 && attempt < maxRetries) {
          const waitMs = getRetryAfterMs(lastResp.headers, attempt);
          logger.debug(`QuiverAI: rate limited, retry ${attempt + 1}/${maxRetries} in ${waitMs}ms`);
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

    // All retries exhausted — return the last error as a normal error response
    return handleStreamingError(lastResp!);
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

async function readSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<ProviderResponse> {
  const decoder = new TextDecoder();
  let buffer = '';
  let finalSvg = '';
  let usage: SvgUsage | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const parsed = parseSSELine(line);
      if (parsed.svg) {
        finalSvg = parsed.svg;
      }
      if (parsed.usage) {
        usage = parsed.usage;
      }
    }
  }

  // Flush any remaining data in the buffer after the stream ends
  if (buffer.trim()) {
    const parsed = parseSSELine(buffer);
    if (parsed.svg) {
      finalSvg = parsed.svg;
    }
    if (parsed.usage) {
      usage = parsed.usage;
    }
  }

  if (!finalSvg) {
    return { error: 'QuiverAI streaming response contained no SVG content' };
  }

  return {
    output: finalSvg,
    tokenUsage: mapTokenUsage(usage, 1),
  };
}

function pickDefined(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(
    keys
      .filter((k) => obj[k as keyof typeof obj] != null)
      .map((k) => [k, obj[k as keyof typeof obj]]),
  );
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

const MAX_RETRY_AFTER_MS = 60_000;

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
  // Exponential backoff: 1s, 2s, 4s
  return Math.pow(2, attempt) * 1000;
}

function parseSSELine(line: string): { svg?: string; usage?: SvgUsage } {
  // Accept both "data: " and "data:" (with or without trailing space)
  if (!line.startsWith('data:')) {
    return {};
  }
  const payload = line.slice(line.startsWith('data: ') ? 6 : 5).trim();
  if (!payload || payload === '[DONE]') {
    return {};
  }
  try {
    const event = JSON.parse(payload);
    return {
      svg: event.type === 'content' && event.svg ? event.svg : undefined,
      usage: event.usage,
    };
  } catch {
    logger.debug(`QuiverAI: failed to parse SSE data: ${payload}`);
    return {};
  }
}

function extractSvgOutput(response: SvgResponse): string {
  if (Array.isArray(response.data)) {
    const svgs = response.data.map((item) => item.svg).filter(Boolean);
    return svgs.length === 1 ? svgs[0] : svgs.join('\n\n');
  }
  return JSON.stringify(response);
}

export function createQuiverAiProvider(
  providerPath: string,
  providerOptions: ProviderOptions = {},
  env?: EnvOverrides,
): ApiProvider {
  const splits = providerPath.split(':');
  const modelType = splits[1];

  // Support quiverai:model and quiverai:chat:model formats
  const modelName =
    (modelType === 'chat' ? splits.slice(2) : splits.slice(1)).join(':') || QUIVERAI_DEFAULT_MODEL;

  return new QuiverAiProvider(modelName, {
    config: providerOptions.config as QuiverAiProviderOptions,
    id: providerOptions.id,
    env: providerOptions.env ?? env,
  });
}
