import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiEmbeddingProvider } from './openai/embedding';

import type {
  ApiEmbeddingProvider,
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../types/providers';
import type { OpenAiCompletionOptions } from './openai/types';

type TrueFoundryMetadata = Record<string, any>;

type TrueFoundryLoggingConfig = {
  enabled?: boolean;
  [key: string]: any;
};

type TrueFoundryMCPServer = {
  integration_fqn: string;
  enable_all_tools?: boolean;
  tools?: Array<{ name: string }>;
};

type TrueFoundryCompletionOptions = OpenAiCompletionOptions & {
  metadata?: TrueFoundryMetadata;
  loggingConfig?: TrueFoundryLoggingConfig;
  mcp_servers?: TrueFoundryMCPServer[];
  iteration_limit?: number;
};

type TrueFoundryProviderOptions = ProviderOptions & {
  config?: TrueFoundryCompletionOptions;
};

type JsonRecord = Record<string, unknown>;

const TRUEFOUNDRY_GUARDRAIL_ERROR_TYPE = 'guardrail_checks_failed';
const DOWNSTREAM_GUARDRAIL_ERROR_CODES = new Set(['content_filter', 'content_policy_violation']);
const DOWNSTREAM_GUARDRAIL_MESSAGE_PATTERNS = [
  /\bresponse content blocked by label\b/i,
  /\b(?:prompt|input|response|output|completion) (?:was )?(?:blocked|filtered)\b/i,
  /\bcontent management policy\b/i,
  /\bresponsible\s*ai\s*policy(?:\s*violation)?\b/i,
];

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function hasGuardrailCheck(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (isJsonRecord(value)) {
    return Object.keys(value).length > 0;
  }
  return Boolean(value);
}

function hasFilteredContent(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasFilteredContent);
  }
  if (!isJsonRecord(value)) {
    return false;
  }
  if (value.filtered === true) {
    return true;
  }
  return Object.values(value).some(hasFilteredContent);
}

function parseHttpErrorBody(response: ProviderResponse): JsonRecord | undefined {
  if (response.metadata?.http?.status !== 400 || typeof response.error !== 'string') {
    return undefined;
  }

  const bodyStart = response.error.indexOf('\n');
  if (bodyStart < 0) {
    return undefined;
  }

  try {
    const body = JSON.parse(response.error.slice(bodyStart + 1));
    return isJsonRecord(body) ? body : undefined;
  } catch {
    return undefined;
  }
}

function getInnerError(error: JsonRecord): JsonRecord | undefined {
  const innerError = error.innererror ?? error.inner_error;
  return isJsonRecord(innerError) ? innerError : undefined;
}

function isGuardrailError(payload: JsonRecord, error: JsonRecord, message: string): boolean {
  if (getString(error.type) === TRUEFOUNDRY_GUARDRAIL_ERROR_TYPE) {
    return true;
  }

  const innerError = getInnerError(error);
  const errorCode = getString(error.code)?.toLowerCase();
  const innerErrorCode = getString(innerError?.code)?.toLowerCase();
  if (
    (errorCode && DOWNSTREAM_GUARDRAIL_ERROR_CODES.has(errorCode)) ||
    innerErrorCode === 'responsibleaipolicyviolation'
  ) {
    return true;
  }

  const contentFilterResults = [
    error.content_filter_result,
    error.content_filter_results,
    innerError?.content_filter_result,
    innerError?.content_filter_results,
    payload.content_filter_result,
    payload.content_filter_results,
  ];
  if (contentFilterResults.some(hasFilteredContent)) {
    return true;
  }

  if (errorCode === 'content_filter_error' || innerErrorCode === 'content_filter_error') {
    return false;
  }

  return DOWNSTREAM_GUARDRAIL_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

function getGuardrailDirection(
  payload: JsonRecord,
  message: string,
): Pick<NonNullable<ProviderResponse['guardrails']>, 'flaggedInput' | 'flaggedOutput'> {
  const checks = payload.guardrail_checks;
  if (isJsonRecord(checks)) {
    const flaggedInput = hasGuardrailCheck(checks.llm_input_guardrails);
    const flaggedOutput = hasGuardrailCheck(checks.llm_output_guardrails);
    if (flaggedInput || flaggedOutput) {
      return { flaggedInput, flaggedOutput };
    }
  }

  if (/\b(prompt|input)\b/i.test(message)) {
    return { flaggedInput: true, flaggedOutput: false };
  }
  if (/\b(response|output|completion)\b/i.test(message)) {
    return { flaggedInput: false, flaggedOutput: true };
  }
  return {};
}

/**
 * Normalize blocked gateway and downstream-model responses into guardrail results.
 *
 * The OpenAI-compatible parent provider returns unrecognized HTTP 400 responses
 * as an error string. TrueFoundry can return its own guardrail envelope or proxy
 * a downstream model's safety envelope, so recover the serialized response body
 * and only convert known safety signals. Other 400s remain ordinary API errors.
 */
function normalizeGuardrailErrorResponse(response: ProviderResponse): ProviderResponse {
  const payload = parseHttpErrorBody(response);
  const error = payload?.error;
  if (!payload || !isJsonRecord(error)) {
    return response;
  }

  const message = getString(error.message) ?? 'Content blocked by provider guardrail';
  if (!isGuardrailError(payload, error, message)) {
    return response;
  }

  const { error: _error, ...responseWithoutError } = response;
  return {
    ...responseWithoutError,
    output: message,
    isRefusal: true,
    guardrails: {
      flagged: true,
      ...getGuardrailDirection(payload, message),
      reason: message,
    },
  };
}

/**
 * TrueFoundry AI Gateway Provider
 *
 * Connects promptfoo to TrueFoundry's enterprise-grade AI Gateway, which
 * encompasses an LLM Gateway, MCP Gateway, and Agent Gateway for connecting,
 * observing, and governing agentic AI applications across providers from a
 * single control plane.
 */
export class TrueFoundryProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: TrueFoundryProviderOptions = {}) {
    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiKeyEnvar: 'TRUEFOUNDRY_API_KEY',
        apiBaseUrl: providerOptions.config?.apiBaseUrl || 'https://llm-gateway.truefoundry.com',
      },
    });
  }

  /**
   * Override isReasoningModel to correctly detect GPT-5 and other reasoning models
   * despite TrueFoundry's provider-account/model-name format
   */
  protected isReasoningModel(modelName = this.modelName): boolean {
    // Extract the actual model name after the provider prefix (e.g., "openai/gpt-5-nano" -> "gpt-5-nano")
    const actualModelName = modelName.split('/').pop() || modelName;
    return (
      actualModelName.startsWith('o1') ||
      actualModelName.startsWith('o3') ||
      actualModelName.startsWith('o4') ||
      actualModelName.startsWith('gpt-5')
    );
  }

  /**
   * Override getOpenAiBody to add TrueFoundry-specific headers and body parameters
   */
  async getOpenAiBody(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ) {
    const { body, config } = await super.getOpenAiBody(prompt, context, callApiOptions);

    // Add TrueFoundry-specific headers
    const headers: Record<string, string> = {
      ...config.headers,
    };

    const tfConfig = this.config as TrueFoundryCompletionOptions;

    // Add metadata header if provided
    if (tfConfig.metadata) {
      headers['X-TFY-METADATA'] = JSON.stringify(tfConfig.metadata);
    }

    // Add logging config header if provided
    if (tfConfig.loggingConfig) {
      headers['X-TFY-LOGGING-CONFIG'] = JSON.stringify(tfConfig.loggingConfig);
    }

    // Add TrueFoundry-specific body parameters (MCP servers, iteration limit)
    const tfBody: Record<string, any> = {
      ...body,
    };

    // Remove metadata from body since it's sent as a header in TrueFoundry
    // The parent OpenAI class adds it to the body, but TrueFoundry uses X-TFY-METADATA header
    if (tfConfig.metadata && tfBody.metadata) {
      delete tfBody.metadata;
    }

    if (tfConfig.mcp_servers) {
      tfBody.mcp_servers = tfConfig.mcp_servers;
    }

    if (tfConfig.iteration_limit !== undefined) {
      tfBody.iteration_limit = tfConfig.iteration_limit;
    }

    return {
      body: tfBody,
      config: {
        ...config,
        headers,
      },
    };
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const response = await super.callApi(prompt, context, callApiOptions);
    return normalizeGuardrailErrorResponse(response);
  }

  id(): string {
    return `truefoundry:${this.modelName}`;
  }

  toString(): string {
    return `[TrueFoundry Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'truefoundry',
      model: this.modelName,
      config: {
        ...this.config,
        ...(this.config.apiKey && { apiKey: undefined }),
      },
    };
  }
}

/**
 * TrueFoundry Embedding Provider
 *
 * Provides embedding capabilities through TrueFoundry's gateway
 */
export class TrueFoundryEmbeddingProvider extends OpenAiEmbeddingProvider {
  constructor(modelName: string, providerOptions: TrueFoundryProviderOptions = {}) {
    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiKeyEnvar: 'TRUEFOUNDRY_API_KEY',
        apiBaseUrl: providerOptions.config?.apiBaseUrl || 'https://llm-gateway.truefoundry.com',
      },
    });
  }

  /**
   * Override callEmbeddingApi to add TrueFoundry-specific headers
   */
  async callEmbeddingApi(text: string): Promise<ProviderResponse> {
    const tfConfig = this.config as TrueFoundryCompletionOptions;

    // Add TrueFoundry-specific headers
    const headers: Record<string, string> = {
      ...(this.config.headers || {}),
    };

    if (tfConfig.metadata) {
      headers['X-TFY-METADATA'] = JSON.stringify(tfConfig.metadata);
    }

    if (tfConfig.loggingConfig) {
      headers['X-TFY-LOGGING-CONFIG'] = JSON.stringify(tfConfig.loggingConfig);
    }

    // Temporarily set headers in config
    const originalHeaders = this.config.headers;
    this.config.headers = headers;

    try {
      // Call parent implementation
      return await super.callEmbeddingApi(text);
    } finally {
      // Restore original headers
      this.config.headers = originalHeaders;
    }
  }

  id(): string {
    return `truefoundry:${this.modelName}`;
  }

  toString(): string {
    return `[TrueFoundry Embedding Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'truefoundry',
      model: this.modelName,
      config: {
        ...this.config,
        ...(this.config.apiKey && { apiKey: undefined }),
      },
    };
  }
}

/**
 * Creates a TrueFoundry provider
 *
 * @param providerPath - Provider path, e.g., "truefoundry:openai/gpt-4"
 * @param options - Provider options
 * @returns A TrueFoundry provider (chat or embedding based on model type)
 */
export function createTrueFoundryProvider(
  providerPath: string,
  options: {
    config?: ProviderOptions;
    id?: string;
    env?: Record<string, string | undefined>;
  } = {},
): ApiProvider | ApiEmbeddingProvider {
  const splits = providerPath.split(':');
  const modelName = splits.slice(1).join(':');

  // Determine if this is an embedding model based on model name
  const isEmbeddingModel = modelName.toLowerCase().includes('embedding');

  const providerOptions: TrueFoundryProviderOptions = {
    ...options.config,
    env: options.env,
  };

  if (isEmbeddingModel) {
    return new TrueFoundryEmbeddingProvider(modelName, providerOptions);
  }

  return new TrueFoundryProvider(modelName, providerOptions);
}
