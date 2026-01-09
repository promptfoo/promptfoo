import { fetchWithCache } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { REQUEST_TIMEOUT_MS } from './shared';

import type { EnvOverrides } from '../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../types/providers';

const QUIVERAI_API_BASE_URL = 'https://api.quiver.ai/v1';

// ============================================
// CHAT PROVIDER (extends OpenAI)
// ============================================

/**
 * QuiverAI chat provider extends OpenAI chat completion provider.
 * QuiverAI's chat API is OpenAI-compatible.
 */
export class QuiverAiChatProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: ProviderOptions = {}) {
    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiBaseUrl: providerOptions.config?.apiBaseUrl || QUIVERAI_API_BASE_URL,
        apiKeyEnvar: 'QUIVERAI_API_KEY',
        passthrough: {
          // QuiverAI-specific: reasoning_effort
          ...(providerOptions.config?.reasoning_effort && {
            reasoning_effort: providerOptions.config.reasoning_effort,
          }),
          ...(providerOptions.config?.passthrough || {}),
        },
      },
    });
  }

  id(): string {
    return `quiverai:${this.modelName}`;
  }

  toString(): string {
    return `[QuiverAI Provider ${this.modelName}]`;
  }

  getApiUrlDefault(): string {
    return QUIVERAI_API_BASE_URL;
  }
}

// ============================================
// SVG PROVIDER (standalone)
// ============================================

type SvgOperation = 'generate' | 'edit';

export interface QuiverAiSvgConfig {
  apiKey?: string;
  apiBaseUrl?: string;
  operation?: SvgOperation;
  // SVG generation options
  svgParams?: {
    mode?: 'icon' | 'illustration' | 'logo';
    style?: 'flat' | 'outline' | 'duotone' | 'gradient';
    complexity?: number;
    viewBox?: { width: number; height: number };
  };
  // For edit operation
  sourceSvg?: string;
  sourceSvgUrl?: string;
  // Common options
  temperature?: number;
  maxOutputTokens?: number;
  n?: number;
}

interface QuiverAiSvgApiResponse {
  data?: Array<{ svg?: string; mime_type?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    input_tokens_details?: { image_tokens?: number };
  };
  error?: string | { message?: string };
}

export class QuiverAiSvgProvider implements ApiProvider {
  modelName: string;
  config: QuiverAiSvgConfig;
  env?: EnvOverrides;

  constructor(
    modelName: string,
    options: { config?: QuiverAiSvgConfig; id?: string; env?: EnvOverrides } = {},
  ) {
    this.modelName = modelName || 'arrow-0.5';
    this.config = options.config || {};
    this.env = options.env;
  }

  id(): string {
    return `quiverai:svg:${this.modelName}`;
  }

  toString(): string {
    return `[QuiverAI SVG Provider ${this.modelName}]`;
  }

  private getApiKey(): string | undefined {
    if (this.config.apiKey) {
      return this.config.apiKey;
    }
    if (this.env?.QUIVERAI_API_KEY) {
      return this.env.QUIVERAI_API_KEY;
    }
    return getEnvString('QUIVERAI_API_KEY');
  }

  private getApiUrl(): string {
    return (
      this.config.apiBaseUrl ||
      this.env?.QUIVERAI_API_BASE_URL ||
      getEnvString('QUIVERAI_API_BASE_URL') ||
      QUIVERAI_API_BASE_URL
    );
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        error:
          'QuiverAI API key not set. Set QUIVERAI_API_KEY environment variable or add apiKey to provider config.',
      };
    }

    const config: QuiverAiSvgConfig = {
      ...this.config,
      ...(context?.prompt?.config as QuiverAiSvgConfig),
    };
    const operation: SvgOperation = config.operation || 'generate';

    try {
      // Build request body based on operation
      const body = this.buildRequestBody(prompt, config, operation);
      const endpoint = operation === 'edit' ? '/svg/edits' : '/svg/generate';

      logger.debug(`Calling QuiverAI SVG API: ${endpoint}`, { operation, model: this.modelName });
      const { data, cached, status, statusText } = await fetchWithCache<QuiverAiSvgApiResponse>(
        `${this.getApiUrl()}${endpoint}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
      );

      if (status < 200 || status >= 300) {
        return {
          error: `QuiverAI API error: ${status} ${statusText}\n${JSON.stringify(data)}`,
        };
      }

      if (data.error) {
        return {
          error: `QuiverAI API error: ${typeof data.error === 'string' ? data.error : JSON.stringify(data.error)}`,
        };
      }

      return this.formatResponse(data, prompt, cached);
    } catch (err) {
      logger.error(`QuiverAI SVG API error: ${err}`);
      return { error: `QuiverAI API call error: ${String(err)}` };
    }
  }

  private buildRequestBody(
    prompt: string,
    config: QuiverAiSvgConfig,
    operation: SvgOperation,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: this.modelName,
      stream: false,
    };

    if (operation === 'edit') {
      if (!config.sourceSvg && !config.sourceSvgUrl) {
        throw new Error(
          'SVG edit operation requires sourceSvg or sourceSvgUrl in provider config',
        );
      }
      body.input = {
        prompt,
        source: config.sourceSvgUrl ? { svg_url: config.sourceSvgUrl } : { svg: config.sourceSvg },
      };
    } else {
      body.input = { prompt };
    }

    if (config.svgParams) {
      const svgParams: Record<string, unknown> = {};

      if (config.svgParams.mode) {
        svgParams.mode = config.svgParams.mode;
      }

      if (config.svgParams.viewBox) {
        svgParams.canvas = {
          view_box: {
            width: config.svgParams.viewBox.width,
            height: config.svgParams.viewBox.height,
          },
        };
      }

      const design: Record<string, unknown> = {};
      if (config.svgParams.style) {
        design.style_preset = config.svgParams.style;
      }
      if (config.svgParams.complexity !== undefined) {
        design.complexity = config.svgParams.complexity;
      }
      if (Object.keys(design).length > 0) {
        svgParams.design = design;
      }

      if (Object.keys(svgParams).length > 0) {
        body.svg_params = svgParams;
      }
    }

    if (config.temperature !== undefined) {
      body.temperature = config.temperature;
    }
    if (config.maxOutputTokens !== undefined) {
      body.max_output_tokens = config.maxOutputTokens;
    }
    if (config.n !== undefined) {
      body.n = config.n;
    }

    return body;
  }

  private formatResponse(
    data: QuiverAiSvgApiResponse,
    prompt: string,
    cached: boolean,
  ): ProviderResponse {
    const svgContent = data.data?.[0]?.svg;
    if (!svgContent) {
      return { error: `No SVG data in response: ${JSON.stringify(data)}` };
    }

    // Return as markdown image with base64 data URI
    const base64 = Buffer.from(svgContent).toString('base64');
    const sanitizedPrompt = prompt
      .replace(/\[/g, '(')
      .replace(/\]/g, ')')
      .replace(/\r?\n|\r/g, ' ')
      .substring(0, 50);

    return {
      output: `![${sanitizedPrompt}](data:image/svg+xml;base64,${base64})`,
      cached,
      cost: cached ? 0 : this.calculateCost(data),
      tokenUsage: data.usage
        ? {
            prompt: data.usage.input_tokens || 0,
            completion: data.usage.output_tokens || 0,
            total: data.usage.total_tokens || 0,
          }
        : undefined,
    };
  }

  private calculateCost(data: QuiverAiSvgApiResponse): number {
    // QuiverAI pricing: prompt=$0.000001/token, completion=$0.000002/token, image=$0.00001/token
    const usage = data.usage || {};
    const promptCost = (usage.input_tokens || 0) * 0.000001;
    const completionCost = (usage.output_tokens || 0) * 0.000002;
    const imageCost = (usage.input_tokens_details?.image_tokens || 0) * 0.00001;
    return promptCost + completionCost + imageCost;
  }
}

// ============================================
// FACTORY FUNCTION
// ============================================

export function createQuiverAiProvider(
  providerPath: string,
  providerOptions: ProviderOptions = {},
  env?: EnvOverrides,
): ApiProvider {
  const splits = providerPath.split(':');
  const modelType = splits[1]; // 'svg', 'chat', or model name
  const effectiveEnv = env || providerOptions.env;

  if (modelType === 'svg') {
    const modelName = splits.slice(2).join(':') || 'arrow-0.5';
    return new QuiverAiSvgProvider(modelName, {
      config: providerOptions.config as QuiverAiSvgConfig,
      env: effectiveEnv,
    });
  }

  if (modelType === 'chat') {
    const modelName = splits.slice(2).join(':') || 'arrow-0.5';
    return new QuiverAiChatProvider(modelName, { ...providerOptions, env: effectiveEnv });
  }

  // Default: treat as chat with model name
  const modelName = splits.slice(1).join(':') || 'arrow-0.5';
  return new QuiverAiChatProvider(modelName, { ...providerOptions, env: effectiveEnv });
}
