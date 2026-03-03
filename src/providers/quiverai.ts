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
  request_id: string;
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
    };
    if (config.instructions != null) {
      body.instructions = config.instructions;
    }
    if (config.references != null) {
      body.references = config.references;
    }
    if (config.n != null) {
      body.n = config.n;
    }
    if (config.temperature != null) {
      body.temperature = config.temperature;
    }
    if (config.top_p != null) {
      body.top_p = config.top_p;
    }
    if (config.presence_penalty != null) {
      body.presence_penalty = config.presence_penalty;
    }
    if (config.max_output_tokens != null) {
      body.max_output_tokens = config.max_output_tokens;
    }

    try {
      if (useStream) {
        return await this.callApiStreaming(body);
      }
      return await this.callApiNonStreaming(body);
    } catch (error) {
      logger.error(`QuiverAI API call error: ${error}`);
      return { error: `QuiverAI API call error: ${error}` };
    }
  }

  private async callApiNonStreaming(body: Record<string, unknown>): Promise<ProviderResponse> {
    const { data, cached } = (await fetchWithCache(
      this.getApiUrl(),
      {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      },
      REQUEST_TIMEOUT_MS,
    )) as unknown as { data: SvgResponse | QuiverAiErrorResponse; cached: boolean };

    if ('code' in data && 'message' in data) {
      return { error: formatError(data as QuiverAiErrorResponse) };
    }

    const response = data as SvgResponse;
    return {
      cached,
      output: extractSvgOutput(response),
      tokenUsage: mapTokenUsage(response.usage, cached ? 0 : 1),
    };
  }

  private async callApiStreaming(body: Record<string, unknown>): Promise<ProviderResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    try {
      const resp = await fetchWithProxy(this.getApiUrl(), {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      // Non-2xx responses come back as JSON error envelopes even in streaming mode
      if (!resp.ok) {
        try {
          const errData = (await resp.json()) as QuiverAiErrorResponse;
          return { error: formatError(errData) };
        } catch {
          return { error: `QuiverAI API error: HTTP ${resp.status}` };
        }
      }

      if (!resp.body) {
        return { error: 'QuiverAI streaming response has no body' };
      }

      // Parse SSE stream: events have phases reasoning → draft → content
      // Each data line is JSON: { type, id, svg, text?, usage? }
      // Stream terminates with data: [DONE]
      let finalSvg = '';
      let usage: SvgUsage | undefined;

      reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep the last potentially incomplete line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) {
            continue;
          }
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') {
            continue;
          }
          try {
            const event = JSON.parse(payload);
            // The content phase has the final SVG
            if (event.type === 'content' && event.svg) {
              finalSvg = event.svg;
            }
            if (event.usage) {
              usage = event.usage;
            }
          } catch {
            logger.debug(`QuiverAI: failed to parse SSE data: ${payload}`);
          }
        }
      }

      return {
        output: finalSvg,
        tokenUsage: mapTokenUsage(usage, 1),
      };
    } finally {
      reader?.cancel().catch(() => {});
      clearTimeout(timeout);
    }
  }
}

function formatError(err: QuiverAiErrorResponse): string {
  return `${err.message} [${err.code}] (request_id: ${err.request_id})`;
}

function mapTokenUsage(usage: SvgUsage | undefined, numRequests: number) {
  return {
    total: usage?.total_tokens || 0,
    prompt: usage?.input_tokens || 0,
    completion: usage?.output_tokens || 0,
    numRequests,
  };
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
    env: env || providerOptions.env,
  });
}
