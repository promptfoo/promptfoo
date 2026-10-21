import { resolveProviderEnv } from '../env';
import { OpenAiResponsesProvider } from '../openai/responses';
import { waitForPromiseWithAbort } from '../shared';
import { GoogleAuthManager } from './auth';

import type { ProviderOptions } from '../../types/providers';
import type { OpenAiResponsesConfig } from '../openai/config';
import type { GoogleAuthConfig } from './auth';

type VertexResponsesConfig = OpenAiResponsesConfig & GoogleAuthConfig;

/** OpenAI models on Google Cloud use Responses with Google OAuth credentials. */
export class VertexResponsesProvider extends OpenAiResponsesProvider {
  declare config: VertexResponsesConfig;

  private authClient?: ReturnType<typeof GoogleAuthManager.getOAuthClient>;
  private readonly apiBaseUrl: string;

  constructor(modelName: string, options: ProviderOptions<VertexResponsesConfig> = {}) {
    super(modelName, options);
    if (
      !this.config.apiBaseUrl &&
      GoogleAuthManager.resolveRegion(this.config, this.env, false) !== 'global'
    ) {
      throw new Error(
        'Vertex Responses currently uses the global endpoint. Set config.region to global, ' +
          'or set config.apiBaseUrl to an endpoint supplied during onboarding.',
      );
    }
    const projectId =
      this.config.projectId ||
      resolveProviderEnv(this.env, [
        'VERTEX_PROJECT_ID',
        'GOOGLE_PROJECT_ID',
        'GOOGLE_CLOUD_PROJECT',
      ])?.value;

    if (!this.config.apiBaseUrl && !projectId) {
      throw new Error(
        'Vertex Responses requires config.projectId or GOOGLE_CLOUD_PROJECT. ' +
          'Alternatively, set config.apiBaseUrl to your Google Cloud Responses base URL.',
      );
    }
    this.apiBaseUrl =
      this.config.apiBaseUrl ||
      `https://aiplatform.googleapis.com/v1/projects/${encodeURIComponent(projectId!)}/locations/global/publishers/openai/v1`;
  }

  id(): string {
    return `vertex:responses:${this.modelName}`;
  }

  getApiUrl(): string {
    // Never allow ambient OPENAI_API_HOST or OPENAI_BASE_URL to redirect Google credentials.
    return this.apiBaseUrl;
  }

  requiresApiKey(): boolean {
    return false;
  }

  getApiKey(): undefined {
    return undefined;
  }

  getOpenAiRequestHeaders(
    customHeaders: Record<string, string> | undefined = this.config.headers,
  ): Record<string, string> {
    return customHeaders ?? {};
  }

  protected getRequestAuthentication() {
    return async (signal?: AbortSignal): Promise<HeadersInit> => {
      signal?.throwIfAborted();
      this.authClient ??= GoogleAuthManager.getOAuthClient({
        credentials: this.config.credentials,
        googleAuthOptions: this.config.googleAuthOptions,
        keyFilename: this.config.keyFilename,
        scopes: this.config.scopes,
      }).catch((error) => {
        this.authClient = undefined;
        throw error;
      });
      const { client } = await waitForPromiseWithAbort(this.authClient, signal);
      signal?.throwIfAborted();
      // The Google client refreshes expiring credentials; retain quota-project headers too.
      const headers = await waitForPromiseWithAbort<HeadersInit>(
        client.getRequestHeaders(this.apiBaseUrl),
        signal,
      );
      signal?.throwIfAborted();
      return headers;
    };
  }

  protected shouldBustCache(): boolean {
    // A project can have several principals. Do not share cached responses across them or
    // persist credentials (or their hashes) as a substitute for a principal cache identity.
    return true;
  }

  protected getBillingModelName(): string {
    // Google Cloud prices/discounts need not match OpenAI. Explicit config.cost still works.
    return `vertex:${this.modelName}`;
  }
}
