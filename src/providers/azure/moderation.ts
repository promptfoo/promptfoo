import { getCache, isCacheEnabled } from '../../cache';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import type {
  ApiModerationProvider,
  ModerationFlag,
  ProviderModerationResponse,
} from '../../types';
import type { EnvOverrides } from '../../types/env';
import { AzureGenericProvider } from '../azure';
import { REQUEST_TIMEOUT_MS } from '../shared';

export const AZURE_MODERATION_MODELS = [
  { id: 'text-content-safety', maxTokens: 10000, capabilities: ['text'] },
];

export type AzureModerationModelId = string;
export type AzureModerationCategory = 'Hate' | 'SelfHarm' | 'Sexual' | 'Violence';

interface AzureTextCategoriesAnalysis {
  category: AzureModerationCategory;
  severity: number;
}

interface AzureTextBlocklistMatch {
  blocklistName: string;
  blocklistItemId: string;
  blocklistItemText: string;
}

interface AzureAnalyzeTextResult {
  categoriesAnalysis?: AzureTextCategoriesAnalysis[];
  blocklistsMatch?: AzureTextBlocklistMatch[];
}

export interface AzureModerationConfig {
  apiKey?: string;
  apiKeyEnvar?: string;
  endpoint?: string;
  apiVersion?: string;
  headers?: Record<string, string>;
  blocklistNames?: string[];
  haltOnBlocklistHit?: boolean;
  passthrough?: Record<string, any>;
}

export function parseAzureModerationResponse(
  data: AzureAnalyzeTextResult,
): ProviderModerationResponse {
  try {
    logger.debug(`Azure Content Safety API response: ${JSON.stringify(data)}`);

    if (!data) {
      logger.error('Azure Content Safety API returned invalid response: null or undefined');
      return { flags: [] };
    }

    const categories = data.categoriesAnalysis || [];
    const blocklistMatches =
      data.blocklistsMatch || (data as any).blocklistsMatch || (data as any).blocklists_match || [];

    if (!categories || categories.length === 0) {
      return { flags: [] };
    }

    const flags: ModerationFlag[] = [];

    for (const analysis of categories) {
      if (analysis.severity > 0) {
        const confidence = analysis.severity / 7;

        flags.push({
          code: analysis.category.toLowerCase(),
          description: `Content flagged for ${analysis.category}`,
          confidence,
        });
      }
    }

    for (const match of blocklistMatches || []) {
      flags.push({
        code: `blocklist:${match.blocklistName}`,
        description: `Content matched blocklist item: ${match.blocklistItemText}`,
        confidence: 1.0,
      });
    }

    return { flags };
  } catch (error) {
    logger.error(`Error parsing Azure Content Safety API response: ${error}`);
    return { flags: [], error: 'Failed to parse moderation response' };
  }
}

export function handleApiError(err: any, data?: any): ProviderModerationResponse {
  logger.error(`Azure moderation API error: ${err}${data ? `, ${data}` : ''}`);
  return { error: err.message || 'Unknown error', flags: [] };
}

export function getModerationCacheKey(modelName: string, config: any, content: string): string {
  return `azure-moderation:${modelName}:${JSON.stringify(content)}`;
}

export class AzureModerationProvider extends AzureGenericProvider implements ApiModerationProvider {
  static MODERATION_MODELS = AZURE_MODERATION_MODELS;
  static MODERATION_MODEL_IDS = AZURE_MODERATION_MODELS.map((model) => model.id);

  apiVersion: string;
  endpoint?: string;
  modelName: string;
  configWithHeaders: AzureModerationConfig;

  constructor(
    modelName: AzureModerationModelId = 'text-content-safety',
    options: { config?: AzureModerationConfig; id?: string; env?: any } = {},
  ) {
    super(modelName, options);

    const { config, env } = options;

    this.modelName = modelName;
    this.configWithHeaders = config || {};
    this.apiVersion =
      config?.apiVersion ||
      env?.AZURE_CONTENT_SAFETY_API_VERSION ||
      getEnvString('AZURE_CONTENT_SAFETY_API_VERSION') ||
      '2024-09-01';

    this.endpoint =
      config?.endpoint ||
      env?.AZURE_CONTENT_SAFETY_ENDPOINT ||
      getEnvString('AZURE_CONTENT_SAFETY_ENDPOINT');

    if (!AzureModerationProvider.MODERATION_MODEL_IDS.includes(modelName)) {
      logger.warn(`Using unknown Azure moderation model: ${modelName}`);
    }
  }

  getContentSafetyApiKey(): string | undefined {
    const extendedEnv = this.env as EnvOverrides & { AZURE_CONTENT_SAFETY_API_KEY?: string };

    return (
      this.configWithHeaders.apiKey ||
      (this.configWithHeaders.apiKeyEnvar
        ? process.env[this.configWithHeaders.apiKeyEnvar] ||
          (this.env && this.configWithHeaders.apiKeyEnvar in this.env
            ? (this.env as any)[this.configWithHeaders.apiKeyEnvar]
            : undefined)
        : undefined) ||
      extendedEnv?.AZURE_CONTENT_SAFETY_API_KEY ||
      getEnvString('AZURE_CONTENT_SAFETY_API_KEY') ||
      this.getApiKey()
    );
  }

  async callModerationApi(
    userPrompt: string,
    assistantResponse: string,
  ): Promise<ProviderModerationResponse> {
    await this.ensureInitialized();

    const apiKey =
      this.configWithHeaders.apiKey || this.getContentSafetyApiKey() || this.getApiKeyOrThrow();
    const endpoint = this.endpoint;

    if (!endpoint) {
      return handleApiError(
        new Error(
          'Azure Content Safety endpoint is not set. Set the AZURE_CONTENT_SAFETY_ENDPOINT environment variable or add `endpoint` to the provider config.',
        ),
      );
    }

    if (apiKey) {
      const maskedKey = apiKey.substring(0, 4) + '...' + apiKey.substring(apiKey.length - 4);
      logger.debug(`Using Azure Content Safety API key: ${maskedKey}`);
    } else {
      logger.error('No Azure Content Safety API key found');
      return handleApiError(
        new Error(
          'Azure Content Safety API key is not set. Set the AZURE_CONTENT_SAFETY_API_KEY environment variable or add `apiKey` to the provider config.',
        ),
      );
    }

    const useCache = isCacheEnabled();
    let cacheKey = '';

    if (useCache) {
      cacheKey = getModerationCacheKey(this.modelName, this.configWithHeaders, assistantResponse);
      const cache = await getCache();
      const cachedResponse = await cache.get(cacheKey);

      if (cachedResponse) {
        logger.debug('Returning cached Azure moderation response');
        return cachedResponse;
      }
    }

    try {
      const cleanEndpoint = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
      const url = `${cleanEndpoint}/contentsafety/text:analyze?api-version=${this.apiVersion}`;

      const headers = {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': apiKey,
        ...(this.configWithHeaders.headers || {}),
      };

      const body = {
        text: assistantResponse,
        categories: ['Hate', 'Sexual', 'SelfHarm', 'Violence'],
        blocklistNames: this.configWithHeaders.blocklistNames || [],
        haltOnBlocklistHit: this.configWithHeaders.haltOnBlocklistHit ?? false,
        outputType: 'FourSeverityLevels',
        ...(this.configWithHeaders.passthrough || {}),
      };

      logger.debug(`Making Azure Content Safety API request to: ${url}`);
      logger.debug(`Request body: ${JSON.stringify(body)}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Azure Content Safety API error: ${response.status} ${response.statusText}`);
        logger.error(`Error details: ${errorText}`);

        let errorMessage = `Azure Content Safety API returned ${response.status}: ${response.statusText}`;

        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.error && errorJson.error.message) {
            errorMessage += ` - ${errorJson.error.message}`;
          }
        } catch {
          errorMessage += ` - ${errorText}`;
        }

        return handleApiError(new Error(errorMessage));
      }

      const data = await response.json();
      const result = parseAzureModerationResponse(data);

      if (useCache && cacheKey) {
        const cache = await getCache();
        await cache.set(cacheKey, result);
      }

      return result;
    } catch (err) {
      return handleApiError(err);
    }
  }
}
