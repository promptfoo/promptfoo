import logger from '../../logger';
import type { EnvOverrides } from '../../types/env';
import type { ProviderConfiguration } from '../../types/providerConfig';
import { AwsBedrockCompletionProvider, AwsBedrockEmbeddingProvider } from '../bedrock';
import { OpenAiModerationProvider } from '../openai/moderation';

const DEFAULT_MODEL = 'amazon.nova-pro-v1:0';
const CLAUDE_MODEL = 'us.anthropic.claude-sonnet-4-20250514-v1:0';
const EMBEDDING_MODEL = 'amazon.titan-embed-text-v1';

/**
 * AWS Bedrock provider configuration
 */
export const BedrockProviderConfig: ProviderConfiguration = (env?: EnvOverrides) => {
  logger.debug('Using AWS Bedrock default providers');

  const standardConfig = { env };
  // Nova Pro doesn't have direct JSON response format control like OpenAI
  const jsonConfig = { env, config: {} };

  return {
    embeddingProvider: new AwsBedrockEmbeddingProvider(EMBEDDING_MODEL, standardConfig),
    gradingJsonProvider: new AwsBedrockCompletionProvider(DEFAULT_MODEL, jsonConfig),
    gradingProvider: new AwsBedrockCompletionProvider(DEFAULT_MODEL, standardConfig),
    llmRubricProvider: new AwsBedrockCompletionProvider(CLAUDE_MODEL, standardConfig),
    moderationProvider: new OpenAiModerationProvider('omni-moderation-latest', standardConfig),
    suggestionsProvider: new AwsBedrockCompletionProvider(DEFAULT_MODEL, standardConfig),
    synthesizeProvider: new AwsBedrockCompletionProvider(DEFAULT_MODEL, jsonConfig),
  };
};
