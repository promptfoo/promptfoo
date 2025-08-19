import { getEnvString } from '../../envars';
import { FunctionCallbackHandler } from '../functionCallbackUtils';
import { OpenAiResponsesProvider } from '../openai/responses';
import { AzureGenericProvider } from './generic';

import type { CallApiContextParams, CallApiOptionsParams, ProviderResponse } from '../../types';
import type { OpenAiCompletionOptions } from '../openai/types';

export class AzureResponsesProvider extends AzureGenericProvider {
  private functionCallbackHandler = new FunctionCallbackHandler();
  private openAiResponsesProvider: OpenAiResponsesProvider;

  constructor(...args: ConstructorParameters<typeof AzureGenericProvider>) {
    super(...args);

    // Create an OpenAiResponsesProvider instance with Azure configuration
    this.openAiResponsesProvider = new OpenAiResponsesProvider(this.deploymentName, {
      config: {
        ...this.config,
        apiHost: this.apiHost,
        apiBaseUrl: this.apiBaseUrl,
        // Azure providers handle auth headers separately, so we'll override them in callApi
      } as OpenAiCompletionOptions,
      env: this.env,
    });
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // Ensure Azure authentication is initialized
    await this.ensureInitialized();

    // Temporarily set the auth headers on the OpenAiResponsesProvider
    // This is a bit of a hack, but it allows us to reuse the OpenAiResponsesProvider logic
    // while using Azure authentication
    const originalGetApiKey = this.openAiResponsesProvider.getApiKey;
    const originalGetApiUrl = this.openAiResponsesProvider.getApiUrl;

    // Override the getApiKey to return Azure API key if available
    this.openAiResponsesProvider.getApiKey = () => {
      if (this.authHeaders?.['api-key']) {
        return this.authHeaders['api-key'];
      }
      return this.config.apiKey || this.env?.AZURE_API_KEY || getEnvString('AZURE_API_KEY');
    };

    // Override the getApiUrl to use Azure endpoint format
    this.openAiResponsesProvider.getApiUrl = () => {
      const baseUrl = this.getApiBaseUrl();
      if (!baseUrl) {
        throw new Error('Azure API host must be set.');
      }
      // Azure Responses API uses the same URL format as OpenAI but with Azure base URL
      return baseUrl;
    };

    // Set headers including Azure auth headers
    this.openAiResponsesProvider.config.headers = {
      ...this.config.headers,
      ...this.authHeaders,
    };

    try {
      // Delegate to OpenAiResponsesProvider for the actual API call
      const result = await this.openAiResponsesProvider.callApi(prompt, context, callApiOptions);

      // Restore original methods
      this.openAiResponsesProvider.getApiKey = originalGetApiKey;
      this.openAiResponsesProvider.getApiUrl = originalGetApiUrl;

      return result;
    } catch (error) {
      // Restore original methods even on error
      this.openAiResponsesProvider.getApiKey = originalGetApiKey;
      this.openAiResponsesProvider.getApiUrl = originalGetApiUrl;

      throw error;
    }
  }
}
