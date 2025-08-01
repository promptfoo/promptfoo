import logger from '../../logger';
import type { EnvOverrides } from '../../types/env';
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
  'us.anthropic.claude-sonnet-4-20250514-v1:0',
);

/**
 * AWS Bedrock provider configuration
 */
export const BedrockProviderConfig: ProviderConfiguration = (env?: EnvOverrides) => {
  logger.debug('Using AWS Bedrock default providers');
  return {
    embeddingProvider: new AwsBedrockEmbeddingProvider('amazon.titan-embed-text-v1', { env }),
    gradingJsonProvider: new AwsBedrockCompletionProvider('amazon.nova-pro-v1:0', {
      env,
      config: {
        // Nova Pro doesn't have direct JSON response format control like OpenAI
        // but we can include it in the prompt instructions
      },
    }),
    gradingProvider: new AwsBedrockCompletionProvider('amazon.nova-pro-v1:0', { env }),
    llmRubricProvider: new AwsBedrockCompletionProvider(
      'us.anthropic.claude-sonnet-4-20250514-v1:0',
      { env },
    ),
    // No built-in moderation in Bedrock, use OpenAI
    moderationProvider: new OpenAiModerationProvider('omni-moderation-latest', { env }),
    suggestionsProvider: new AwsBedrockCompletionProvider('amazon.nova-pro-v1:0', { env }),
    synthesizeProvider: new AwsBedrockCompletionProvider('amazon.nova-pro-v1:0', {
      env,
      config: {
        // Nova Pro doesn't have direct JSON response format control like OpenAI
        // but we can include it in the prompt instructions
      },
    }),
  };
};
