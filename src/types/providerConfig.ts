import type { ApiProvider } from './index';

/**
 * Standard interface for provider configurations across the application
 */
export interface DefaultProviders {
  datasetGenerationProvider: ApiProvider;
  embeddingProvider: ApiProvider;
  gradingJsonProvider: ApiProvider;
  gradingProvider: ApiProvider;
  llmRubricProvider?: ApiProvider;
  moderationProvider: ApiProvider;
  suggestionsProvider: ApiProvider;
  synthesizeProvider: ApiProvider;
}

/**
 * Function that returns a configuration of default providers for a service
 */
export type ProviderConfiguration = (env?: any) => DefaultProviders;
