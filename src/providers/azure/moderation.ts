import { getCache, isCacheEnabled } from '../../cache';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import { fetchWithProxy } from '../../util/fetch/index';
import { REQUEST_TIMEOUT_MS } from '../shared';
import { AzureGenericProvider } from './generic';

import type { EnvVarKey } from '../../envars';
import type { EnvOverrides } from '../../types/env';
import type {
  ApiModerationProvider,
  ModerationFlag,
  ProviderModerationResponse,
} from '../../types/index';

const AZURE_MODERATION_MODELS = [
  { id: 'text-content-safety', maxTokens: 10000, capabilities: ['text'] },
  { id: 'image-content-safety', maxTokens: 0, capabilities: ['image'] },
];

type AzureModerationModelId = string;
export type AzureModerationCategory = 'Hate' | 'SelfHarm' | 'Sexual' | 'Violence';
export type AzureOutputType = 'FourSeverityLevels' | 'EightSeverityLevels';

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

interface AzureAnalyzeImageResult {
  categoriesAnalysis?: AzureTextCategoriesAnalysis[];
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
  // Entra ID authentication
  useEntraIdAuth?: boolean;
  azureClientId?: string;
  azureClientSecret?: string;
  azureTenantId?: string;
  azureAuthorityHost?: string;
  azureTokenScope?: string;
  // Output configuration
  outputType?: AzureOutputType;
  // Categories to check (defaults to all)
  categories?: AzureModerationCategory[];
}

/**
 * Maximum severity scale for Azure Content Safety API.
 * Text uses EightSeverityLevels (0-7), Images use FourSeverityLevels (0-3).
 */
export const AZURE_MAX_SEVERITY = 7;

export function parseAzureModerationResponse(
  data: AzureAnalyzeTextResult | AzureAnalyzeImageResult,
  options: { maxSeverity?: number; returnAllCategories?: boolean } = {},
): ProviderModerationResponse {
  const { maxSeverity = AZURE_MAX_SEVERITY, returnAllCategories = false } = options;

  try {
    logger.debug(`Azure Content Safety API response: ${JSON.stringify(data)}`);

    if (!data) {
      logger.error('Azure Content Safety API returned invalid response: null or undefined');
      return { flags: [] };
    }

    const categories = data.categoriesAnalysis || [];
    const blocklistMatches =
      'blocklistsMatch' in data
        ? data.blocklistsMatch ||
          (data as any).blocklistsMatch ||
          (data as any).blocklists_match ||
          []
        : [];

    const flags: ModerationFlag[] = [];

    for (const analysis of categories) {
      // Include all categories if returnAllCategories is true, otherwise only flagged ones
      if (returnAllCategories || analysis.severity > 0) {
        const confidence = analysis.severity / maxSeverity;

        flags.push({
          code: analysis.category.toLowerCase(),
          description:
            analysis.severity > 0
              ? `Content flagged for ${analysis.category}`
              : `${analysis.category} (not flagged)`,
          confidence,
          metadata: {
            azure_severity: analysis.severity,
            max_severity: maxSeverity,
          },
        });
      }
    }

    for (const match of blocklistMatches || []) {
      flags.push({
        code: `blocklist:${match.blocklistName}`,
        description: `Content matched blocklist item: ${match.blocklistItemText}`,
        confidence: 1.0,
        metadata: {
          blocklist_item_id: match.blocklistItemId,
          blocklist_item_text: match.blocklistItemText,
        },
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

export function getModerationCacheKey(modelName: string, _config: any, content: string): string {
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
        ? getEnvString(this.configWithHeaders.apiKeyEnvar as EnvVarKey) ||
          (this.env && this.configWithHeaders.apiKeyEnvar in this.env
            ? (this.env as any)[this.configWithHeaders.apiKeyEnvar]
            : undefined)
        : undefined) ||
      extendedEnv?.AZURE_CONTENT_SAFETY_API_KEY ||
      getEnvString('AZURE_CONTENT_SAFETY_API_KEY') ||
      this.getApiKey()
    );
  }

  /**
   * Gets authentication headers for Content Safety API.
   * Supports both API key and Entra ID (Azure AD) authentication.
   */
  async getContentSafetyAuthHeaders(): Promise<Record<string, string>> {
    // Check if Entra ID auth is explicitly requested
    if (this.configWithHeaders.useEntraIdAuth) {
      try {
        const token = await this.getAccessToken();
        return { Authorization: `Bearer ${token}` };
      } catch (err) {
        logger.error(`Entra ID authentication failed for Content Safety: ${err}`);
        throw new Error(
          `Entra ID authentication failed. Please check your credentials (AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID) or use Azure CLI authentication.`,
        );
      }
    }

    // Try API key authentication
    const apiKey = this.getContentSafetyApiKey();
    if (apiKey) {
      const maskedKey = apiKey.substring(0, 4) + '...' + apiKey.substring(apiKey.length - 4);
      logger.debug(`Using Azure Content Safety API key: ${maskedKey}`);
      return { 'Ocp-Apim-Subscription-Key': apiKey };
    }

    // Fallback to Entra ID if no API key is found
    try {
      const token = await this.getAccessToken();
      logger.debug('Using Entra ID authentication for Content Safety (no API key found)');
      return { Authorization: `Bearer ${token}` };
    } catch {
      throw new Error(
        `Azure Content Safety authentication failed. Either set AZURE_CONTENT_SAFETY_API_KEY or configure Entra ID credentials.`,
      );
    }
  }

  /**
   * Analyzes text content for safety issues.
   */
  async analyzeText(text: string): Promise<ProviderModerationResponse> {
    await this.ensureInitialized();

    const endpoint = this.endpoint;
    if (!endpoint) {
      return handleApiError(
        new Error(
          'Azure Content Safety endpoint is not set. Set the AZURE_CONTENT_SAFETY_ENDPOINT environment variable or add `endpoint` to the provider config.',
        ),
      );
    }

    const useCache = isCacheEnabled();
    let cacheKey = '';

    if (useCache) {
      cacheKey = getModerationCacheKey(this.modelName, this.configWithHeaders, text);
      const cache = await getCache();
      const cachedResponse = await cache.get(cacheKey);

      if (cachedResponse) {
        logger.debug('Returning cached Azure text moderation response');
        return cachedResponse;
      }
    }

    try {
      const authHeaders = await this.getContentSafetyAuthHeaders();
      const cleanEndpoint = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
      const url = `${cleanEndpoint}/contentsafety/text:analyze?api-version=${this.apiVersion}`;

      const headers = {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...(this.configWithHeaders.headers || {}),
      };

      const categories = this.configWithHeaders.categories || [
        'Hate',
        'Sexual',
        'SelfHarm',
        'Violence',
      ];
      const outputType = this.configWithHeaders.outputType || 'FourSeverityLevels';
      const maxSeverity = outputType === 'EightSeverityLevels' ? 7 : 3;

      const body = {
        text,
        categories,
        blocklistNames: this.configWithHeaders.blocklistNames || [],
        haltOnBlocklistHit: this.configWithHeaders.haltOnBlocklistHit ?? false,
        outputType,
        ...(this.configWithHeaders.passthrough || {}),
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetchWithProxy(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(
          `Azure Content Safety text API error: ${response.status} ${response.statusText}`,
        );
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
      const result = parseAzureModerationResponse(data, {
        maxSeverity,
        returnAllCategories: true,
      });

      if (useCache && cacheKey) {
        const cache = await getCache();
        await cache.set(cacheKey, result);
      }

      return result;
    } catch (err) {
      return handleApiError(err);
    }
  }

  /**
   * Analyzes image content for safety issues.
   * @param imageInput - Either a base64-encoded image string or a URL to an image
   */
  async analyzeImage(imageInput: string): Promise<ProviderModerationResponse> {
    await this.ensureInitialized();

    const endpoint = this.endpoint;
    if (!endpoint) {
      return handleApiError(
        new Error(
          'Azure Content Safety endpoint is not set. Set the AZURE_CONTENT_SAFETY_ENDPOINT environment variable or add `endpoint` to the provider config.',
        ),
      );
    }

    const useCache = isCacheEnabled();
    let cacheKey = '';

    if (useCache) {
      cacheKey = getModerationCacheKey('image-content-safety', this.configWithHeaders, imageInput);
      const cache = await getCache();
      const cachedResponse = await cache.get(cacheKey);

      if (cachedResponse) {
        logger.debug('Returning cached Azure image moderation response');
        return cachedResponse;
      }
    }

    try {
      const authHeaders = await this.getContentSafetyAuthHeaders();
      const cleanEndpoint = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
      const url = `${cleanEndpoint}/contentsafety/image:analyze?api-version=${this.apiVersion}`;

      const headers = {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...(this.configWithHeaders.headers || {}),
      };

      // Determine if input is a URL or base64 content
      const isUrl = imageInput.startsWith('http://') || imageInput.startsWith('https://');
      const imageData = isUrl
        ? { image: { blobUrl: imageInput } }
        : { image: { content: imageInput } };

      const categories = this.configWithHeaders.categories || [
        'Hate',
        'Sexual',
        'SelfHarm',
        'Violence',
      ];
      // Image API only supports FourSeverityLevels (0-3)
      const maxSeverity = 3;

      const body = {
        ...imageData,
        categories,
        ...(this.configWithHeaders.passthrough || {}),
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetchWithProxy(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(
          `Azure Content Safety image API error: ${response.status} ${response.statusText}`,
        );
        logger.error(`Error details: ${errorText}`);

        let errorMessage = `Azure Content Safety image API returned ${response.status}: ${response.statusText}`;

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
      const result = parseAzureModerationResponse(data, {
        maxSeverity,
        returnAllCategories: true,
      });

      if (useCache && cacheKey) {
        const cache = await getCache();
        await cache.set(cacheKey, result);
      }

      return result;
    } catch (err) {
      return handleApiError(err);
    }
  }

  /**
   * Main moderation API call - analyzes text content.
   * For image analysis, use analyzeImage() directly.
   */
  async callModerationApi(
    _userPrompt: string,
    assistantResponse: string,
  ): Promise<ProviderModerationResponse> {
    return this.analyzeText(assistantResponse);
  }
}
