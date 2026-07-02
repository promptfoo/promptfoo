import { getEnvString } from '../../envars';
import logger from '../../logger';
import { throwConfigurationError } from './util';
import type { TokenCredential } from '@azure/identity';

import type { EnvVarKey } from '../../envars';
import type { EnvOverrides } from '../../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { AzureCompletionOptions, AzureProviderOptions } from './types';

export class AzureGenericProvider implements ApiProvider {
  deploymentName: string;
  apiHost?: string;
  apiBaseUrl?: string;

  config: AzureCompletionOptions;
  env?: EnvOverrides;

  authHeaders?: Record<string, string>;

  protected initializationPromise: Promise<void> | null = null;

  /** Cached Entra ID credential; reused so @azure/identity can manage its own token cache. */
  private cachedCredential?: TokenCredential;
  /** Expiry of the currently cached Entra ID bearer token (ms epoch), if token auth is in use. */
  private authTokenExpiresOnTimestamp?: number;
  /** Refresh the bearer token when it is within this window of expiring. */
  private static readonly TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000;

  constructor(deploymentName: string, options: AzureProviderOptions = {}) {
    const { config, id, env } = options;
    this.env = env;

    this.deploymentName = deploymentName;

    this.apiHost =
      config?.apiHost ||
      // These and similar OPENAI envars: Backwards compatibility for Azure rename 2024-11-09 / 0.96.0
      env?.AZURE_API_HOST ||
      env?.AZURE_OPENAI_API_HOST ||
      getEnvString('AZURE_API_HOST') ||
      getEnvString('AZURE_OPENAI_API_HOST');
    this.apiBaseUrl =
      config?.apiBaseUrl ||
      env?.AZURE_API_BASE_URL ||
      env?.AZURE_OPENAI_API_BASE_URL ||
      env?.AZURE_OPENAI_BASE_URL ||
      getEnvString('AZURE_API_BASE_URL') ||
      getEnvString('AZURE_OPENAI_API_BASE_URL') ||
      getEnvString('AZURE_OPENAI_BASE_URL');

    this.config = config || {};
    this.id = id ? () => id : this.id;

    this.initializationPromise = this.initialize();
  }

  async initialize() {
    this.authHeaders = await this.getAuthHeaders();
  }

  async ensureInitialized() {
    if (this.initializationPromise != null) {
      await this.initializationPromise;
    }
    await this.refreshAuthTokenIfNeeded();
  }

  /**
   * Re-mint the Entra ID bearer token when it is at/near expiry. Subclasses call
   * ensureInitialized() at the start of every request, so this keeps long-running evals from
   * failing with 401 once the initial token (cached once in initialize()) expires. No-op for
   * api-key auth, and conservative when the token expiry is unknown.
   */
  private async refreshAuthTokenIfNeeded(): Promise<void> {
    if (!this.authHeaders?.Authorization) {
      return; // api-key auth (or not yet initialized) — nothing to refresh
    }
    const expiresAt = this.authTokenExpiresOnTimestamp;
    if (expiresAt === undefined) {
      return; // expiry unknown — preserve prior behavior rather than force a refetch
    }
    if (Date.now() < expiresAt - AzureGenericProvider.TOKEN_REFRESH_WINDOW_MS) {
      return; // still valid
    }
    this.authHeaders = await this.getAuthHeaders();
  }

  getApiKey(): string | undefined {
    return (
      this.config?.apiKey ||
      (this.config?.apiKeyEnvar
        ? getEnvString(this.config.apiKeyEnvar as EnvVarKey) ||
          this.env?.[this.config.apiKeyEnvar as keyof EnvOverrides]
        : undefined) ||
      this.env?.AZURE_API_KEY ||
      getEnvString('AZURE_API_KEY') ||
      this.env?.AZURE_OPENAI_API_KEY ||
      getEnvString('AZURE_OPENAI_API_KEY')
    );
  }

  getApiKeyOrThrow(): string {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throwConfigurationError('Azure API key must be set.');
    }
    return apiKey;
  }

  async getAzureTokenCredential(): Promise<TokenCredential> {
    const clientSecret =
      this.config?.azureClientSecret ||
      this.env?.AZURE_CLIENT_SECRET ||
      getEnvString('AZURE_CLIENT_SECRET');
    const clientId =
      this.config?.azureClientId || this.env?.AZURE_CLIENT_ID || getEnvString('AZURE_CLIENT_ID');
    const tenantId =
      this.config?.azureTenantId || this.env?.AZURE_TENANT_ID || getEnvString('AZURE_TENANT_ID');
    const authorityHost =
      this.config?.azureAuthorityHost ||
      this.env?.AZURE_AUTHORITY_HOST ||
      getEnvString('AZURE_AUTHORITY_HOST');

    if (this.cachedCredential) {
      // Reuse the credential so @azure/identity can serve/refresh tokens from its own cache.
      return this.cachedCredential;
    }

    try {
      const { ClientSecretCredential, AzureCliCredential } = await import('@azure/identity');

      if (clientSecret && clientId && tenantId) {
        this.cachedCredential = new ClientSecretCredential(tenantId, clientId, clientSecret, {
          authorityHost: authorityHost || 'https://login.microsoftonline.com',
        });
        return this.cachedCredential;
      }

      // Fallback to Azure CLI
      this.cachedCredential = new AzureCliCredential();
      return this.cachedCredential;
    } catch (err) {
      logger.error(`Error loading @azure/identity: ${err}`);
      throw new Error(
        'The @azure/identity package is required for Azure authentication. Please install it with: npm install @azure/identity',
      );
    }
  }

  async getAccessToken() {
    const credential = await this.getAzureTokenCredential();
    const tokenScope =
      this.config?.azureTokenScope ||
      this.env?.AZURE_TOKEN_SCOPE ||
      getEnvString('AZURE_TOKEN_SCOPE');
    const tokenResponse = await credential.getToken(
      tokenScope || 'https://cognitiveservices.azure.com/.default',
    );
    if (!tokenResponse) {
      throwConfigurationError('Failed to retrieve access token.');
    }
    // Track expiry so ensureInitialized() can refresh the token before it lapses mid-run.
    this.authTokenExpiresOnTimestamp = tokenResponse.expiresOnTimestamp;
    return tokenResponse.token;
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    const apiKey = this.getApiKey();
    if (apiKey) {
      return { 'api-key': apiKey };
    } else {
      try {
        const token = await this.getAccessToken();
        return { Authorization: 'Bearer ' + token };
      } catch (err) {
        logger.info(`Azure Authentication failed. Please check your credentials: ${err}`);
        throw new Error(`Azure Authentication failed. 
Please choose one of the following options:
  1. Set an API key via the AZURE_API_KEY environment variable.
  2. Provide client credentials (AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID).
  3. Authenticate with Azure CLI using az login.
    `);
      }
    }
  }

  getApiBaseUrl(): string | undefined {
    if (this.apiBaseUrl) {
      return this.apiBaseUrl.replace(/\/$/, '');
    }
    const host = this.apiHost?.replace(/^(https?:\/\/)/, '').replace(/\/$/, '');
    if (!host) {
      return undefined;
    }
    return `https://${host}`;
  }

  id(): string {
    return `azure:${this.deploymentName}`;
  }

  toString(): string {
    return `[Azure Provider ${this.deploymentName}]`;
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
