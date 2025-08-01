import type { ApiProvider } from './index';

/**
 * Standard interface for provider configurations across the application
 */
export interface DefaultProviders {
  embeddingProvider: ApiProvider;
  gradingJsonProvider: ApiProvider;
  gradingProvider: ApiProvider;
  /**
   * Optional provider for LLM-based rubric evaluation.
   * Only supported by providers with advanced reasoning capabilities:
   * - Anthropic: Uses specialized LlmRubricProvider for nuanced evaluation
   * - Bedrock: Uses Claude model through Bedrock for rubric evaluation
   * Other providers fall back to standard grading providers for rubric tasks.
   */
  llmRubricProvider?: ApiProvider;
  moderationProvider: ApiProvider;
  suggestionsProvider: ApiProvider;
  synthesizeProvider: ApiProvider;
}

/**
 * Function that returns a configuration of default providers for a service
 */
export type ProviderConfiguration = (env?: any) => DefaultProviders;
