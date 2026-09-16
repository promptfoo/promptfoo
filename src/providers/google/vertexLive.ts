import { getEnvString } from '../../envars';
import { GoogleAuthManager } from './auth';
import { GoogleLiveProvider } from './live';

import type { EnvOverrides } from '../../types/env';
import type { ProviderOptions } from '../../types/providers';
import type { CompletionOptions } from './types';

export class VertexLiveProvider extends GoogleLiveProvider {
  protected override readonly isVertex = true;
  private readonly env?: EnvOverrides;

  constructor(modelName: string, options: ProviderOptions) {
    super(modelName, options);
    this.env = options.env;
  }

  override id(): string {
    return `vertex:live:${this.modelName}`;
  }

  override toString(): string {
    return `[Vertex Live Provider ${this.modelName}]`;
  }

  protected override async getConnection(config: CompletionOptions) {
    const region =
      config.region ||
      this.env?.VERTEX_REGION ||
      this.env?.GOOGLE_CLOUD_LOCATION ||
      getEnvString('VERTEX_REGION') ||
      getEnvString('GOOGLE_CLOUD_LOCATION') ||
      'us-central1';
    // Live uses the Cloud API versions, not Gemini API v1alpha/v1beta.
    const apiVersion = config.apiVersion || 'v1';
    if (!['v1', 'v1beta1'].includes(apiVersion)) {
      throw new Error('Vertex Live apiVersion must be v1 or v1beta1.');
    }
    if (!/^[a-z0-9-]+$/.test(region)) {
      throw new Error('Vertex Live region must be a Google Cloud location ID.');
    }

    let client;
    let authProjectId;
    try {
      ({ client, projectId: authProjectId } = await GoogleAuthManager.getOAuthClient({
        credentials: config.credentials,
        googleAuthOptions: config.googleAuthOptions,
        keyFilename: config.keyFilename,
        scopes: config.scopes,
      }));
    } catch {
      throw new Error(
        'Vertex Live requires Google Cloud OAuth credentials. Run gcloud auth application-default login, or configure service account credentials. Gemini API keys are not supported.',
      );
    }
    const projectId =
      config.projectId ||
      this.env?.VERTEX_PROJECT_ID ||
      this.env?.GOOGLE_PROJECT_ID ||
      this.env?.GOOGLE_CLOUD_PROJECT ||
      getEnvString('VERTEX_PROJECT_ID') ||
      getEnvString('GOOGLE_PROJECT_ID') ||
      getEnvString('GOOGLE_CLOUD_PROJECT') ||
      authProjectId;
    if (!projectId) {
      throw new Error(
        'Vertex Live requires a project ID. Set GOOGLE_CLOUD_PROJECT or config.projectId.',
      );
    }
    const host =
      region === 'global' ? 'aiplatform.googleapis.com' : `${region}-aiplatform.googleapis.com`;
    const url = `wss://${host}/ws/google.cloud.aiplatform.${apiVersion}.LlmBidiService/BidiGenerateContent`;
    let headers: Record<string, string>;
    try {
      // Keep OAuth and quota-project headers; never put credentials in the URL.
      headers = Object.fromEntries((await client.getRequestHeaders()).entries());
      if (!headers.authorization) {
        throw new Error('Missing OAuth authorization header');
      }
    } catch {
      throw new Error(
        'Vertex Live could not obtain an OAuth access token. Run gcloud auth application-default login or check your service account credentials.',
      );
    }
    return {
      url,
      model: `projects/${projectId}/locations/${region}/publishers/google/models/${this.modelName}`,
      apiVersion,
      headers,
    };
  }
}
