import logger from '../../logger';
import type { ProviderConfiguration } from '../../types/providerConfig';
import { AwsBedrockCompletionProvider, AwsBedrockEmbeddingProvider } from '../bedrock';
import { OpenAiModerationProvider } from '../openai/moderation';

// Nova Pro provider for general completions
export const DefaultGradingProvider = new AwsBedrockCompletionProvider('amazon.nova-pro-v1:0');

// Nova Pro provider for JSON responses
export const DefaultGradingJsonProvider = new AwsBedrockCompletionProvider('amazon.nova-pro-v1:0', {
  config: {
    // Nova Pro doesn't have direct JSON response format control like OpenAI
    // but we can include it in the prompt instructions
  },
});

// Amazon Titan Embeddings provider
export const DefaultEmbeddingProvider = new AwsBedrockEmbeddingProvider(
  'amazon.titan-embed-text-v1',
);

// Nova Pro provider for suggestions
export const DefaultSuggestionsProvider = new AwsBedrockCompletionProvider('amazon.nova-pro-v1:0');

// Use Claude model through Bedrock for LLM rubric evaluation
export const DefaultLlmRubricProvider = new AwsBedrockCompletionProvider(
  'anthropic.claude-3-7-sonnet-20250219-v1:0',
);

/**
 * AWS Bedrock provider configuration
 */
export const BedrockProviderConfig: ProviderConfiguration = (env) => {
  logger.debug('Using AWS Bedrock default providers');
  return {
    datasetGenerationProvider: DefaultGradingProvider,
    embeddingProvider: DefaultEmbeddingProvider,
    gradingJsonProvider: DefaultGradingJsonProvider,
    gradingProvider: DefaultGradingProvider,
    llmRubricProvider: DefaultLlmRubricProvider,
    // No built-in moderation in Bedrock, use OpenAI
    moderationProvider: new OpenAiModerationProvider('omni-moderation-latest'),
    suggestionsProvider: DefaultSuggestionsProvider,
    synthesizeProvider: DefaultGradingJsonProvider,
  };
};
