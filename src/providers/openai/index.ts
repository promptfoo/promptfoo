import { getEnvString } from '../../envars';

import type { EnvVarKey } from '../../envars';
import type { EnvOverrides } from '../../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { OpenAiSharedOptions } from './types';

export const OPENAI_ORIGINATOR_HEADER = 'X-OpenAI-Originator';
export const OPENAI_ORGANIZATION_HEADER = 'OpenAI-Organization';
export const DEFAULT_OPENAI_ORIGINATOR = 'promptfoo';

/**
 * Whether `customHeaders` contains a case-insensitive override for `headerName`.
 * A differently-cased duplicate would otherwise survive an object spread and be
 * sent as two header values, so callers use this to suppress the default they
 * would otherwise inject (or the SDK option that produces the same header).
 */
export function hasHeaderOverride(
  customHeaders: Record<string, string> | undefined,
  headerName: string,
): boolean {
  const target = headerName.toLowerCase();
  return Object.keys(customHeaders ?? {}).some((key) => key.toLowerCase() === target);
}

export class OpenAiGenericProvider implements ApiProvider {
  modelName: string;

  config: OpenAiSharedOptions;
  env?: EnvOverrides;

  constructor(
    modelName: string,
    options: { config?: OpenAiSharedOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    const { config, id, env } = options;
    this.env = env;
    this.modelName = modelName;
    this.config = config ? { ...config } : {};
    this.id = id ? () => id : this.id;
  }

  id(): string {
    return this.config.apiHost || this.config.apiBaseUrl
      ? this.modelName
      : `openai:${this.modelName}`;
  }

  toString(): string {
    return `[OpenAI Provider ${this.modelName}]`;
  }

  getOrganization(): string | undefined {
    return (
      this.config.organization ||
      this.env?.OPENAI_ORGANIZATION ||
      getEnvString('OPENAI_ORGANIZATION')
    );
  }

  getOpenAiRequestHeaders(
    customHeaders: Record<string, string> | undefined = this.config.headers,
  ): Record<string, string> {
    let sendsToOpenAiApi = false;
    try {
      sendsToOpenAiApi = new URL(this.getApiUrl()).hostname.toLowerCase() === 'api.openai.com';
    } catch {
      // Leave malformed custom URLs to the request path to validate.
    }

    // Custom headers win over both injected defaults. The override checks are
    // case-insensitive because a differently-cased duplicate key would survive
    // the spread and be sent as two header values (e.g. "test-org, custom").
    const hasOriginatorOverride = hasHeaderOverride(customHeaders, OPENAI_ORIGINATOR_HEADER);
    const hasOrganizationOverride = hasHeaderOverride(customHeaders, OPENAI_ORGANIZATION_HEADER);

    const sendOriginatorDefault = !hasOriginatorOverride && sendsToOpenAiApi;
    const organization = hasOrganizationOverride
      ? undefined
      : (this.config.organization ?? (sendsToOpenAiApi ? this.getOrganization() : undefined));

    return {
      ...(sendOriginatorDefault ? { [OPENAI_ORIGINATOR_HEADER]: DEFAULT_OPENAI_ORIGINATOR } : {}),
      ...(organization ? { [OPENAI_ORGANIZATION_HEADER]: organization } : {}),
      ...customHeaders,
    };
  }

  getApiUrlDefault(): string {
    return 'https://api.openai.com/v1';
  }

  getApiUrl(): string {
    if (this.config.apiHost) {
      return `https://${this.config.apiHost}/v1`;
    }
    if (this.config.apiBaseUrl) {
      return this.config.apiBaseUrl;
    }

    const envApiHost = this.env?.OPENAI_API_HOST ?? getEnvString('OPENAI_API_HOST');
    if (envApiHost) {
      return `https://${envApiHost}/v1`;
    }
    return (
      this.env?.OPENAI_API_BASE_URL ||
      this.env?.OPENAI_BASE_URL ||
      getEnvString('OPENAI_API_BASE_URL') ||
      getEnvString('OPENAI_BASE_URL') ||
      this.getApiUrlDefault()
    );
  }

  getApiKey(): string | undefined {
    if (this.config.apiKey !== undefined) {
      return this.config.apiKey;
    }
    if (this.config.apiKeyEnvar) {
      const key = this.config.apiKeyEnvar as EnvVarKey;
      return this.env?.[key as keyof EnvOverrides] ?? getEnvString(key);
    }
    return this.env?.OPENAI_API_KEY ?? getEnvString('OPENAI_API_KEY');
  }

  requiresApiKey(): boolean {
    return this.config.apiKeyRequired ?? true;
  }

  protected getMissingApiKeyErrorMessage(): string {
    return `API key is not set. Set the ${this.config.apiKeyEnvar || 'OPENAI_API_KEY'} environment variable or add \`apiKey\` to the provider config.`;
  }

  // @ts-ignore: Params are not used in this implementation
  async callApi(
    _prompt: string,
    _context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    throw new Error('Not implemented');
  }
}
