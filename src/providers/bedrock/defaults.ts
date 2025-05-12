import { getEnvString } from '../../envars';
import logger from '../../logger';
import type { DefaultProviders } from '../../types';
import type { EnvOverrides } from '../../types/env';
import { AwsBedrockCompletionProvider, AwsBedrockEmbeddingProvider } from '../bedrock';

// Default configuration for Nova Pro provider
const DEFAULT_NOVA_MODEL = 'amazon.nova-pro-v1:0';
const DEFAULT_TITAN_EMBEDDING_MODEL = 'amazon.titan-embed-text-v2:0';

/**
 * Resolves the AWS region to use for Bedrock
 *
 * Order of preference:
 * 1. AWS_BEDROCK_REGION (our custom var)
 * 2. AWS_REGION or AWS_DEFAULT_REGION (standard AWS vars)
 * 3. Default to us-east-1
 */
export function resolveAwsRegion(env?: EnvOverrides): string {
  return (
    getEnvString('AWS_BEDROCK_REGION') ||
    env?.AWS_BEDROCK_REGION ||
    getEnvString('AWS_REGION') ||
    env?.AWS_REGION ||
    getEnvString('AWS_DEFAULT_REGION') ||
    env?.AWS_DEFAULT_REGION ||
    'us-east-1'
  );
}

/**
 * Checks if AWS credentials are available
 */
export function hasAwsCredentials(env?: EnvOverrides): boolean {
  // Check for explicit credentials
  const hasExplicitCredentials =
    (getEnvString('AWS_ACCESS_KEY_ID') || env?.AWS_ACCESS_KEY_ID) &&
    (getEnvString('AWS_SECRET_ACCESS_KEY') || env?.AWS_SECRET_ACCESS_KEY);

  // Check for AWS_PROFILE or AWS_ROLE_ARN
  const hasProfileOrRole =
    getEnvString('AWS_PROFILE') ||
    env?.AWS_PROFILE ||
    getEnvString('AWS_ROLE_ARN') ||
    env?.AWS_ROLE_ARN;

  // On AWS services, we might not need explicit credentials
  const isRunningOnAws = Boolean(
    getEnvString('AWS_EXECUTION_ENV') || // Lambda, ECS, etc.
      getEnvString('AWS_CONTAINER_CREDENTIALS_RELATIVE_URI') || // ECS
      getEnvString('AWS_CONTAINER_CREDENTIALS_FULL_URI'), // EKS
  );

  return hasExplicitCredentials || hasProfileOrRole || isRunningOnAws;
}

/**
 * Gets the default providers for AWS Bedrock
 */
export function getBedrockProviders(env?: EnvOverrides): DefaultProviders {
  const region = resolveAwsRegion(env);

  // Add regional prefix if not already present
  const getRegionalModelId = (modelId: string): string => {
    const regionalPrefixes = ['us.', 'eu.', 'apac.', 'us-gov.'];
    if (regionalPrefixes.some((prefix) => modelId.startsWith(prefix))) {
      return modelId;
    }
    return `us.${modelId}`;
  };

  // Prepare the Nova Pro provider
  logger.debug('Setting up AWS Bedrock Nova Pro provider');
  const novaProProvider = new AwsBedrockCompletionProvider(getRegionalModelId(DEFAULT_NOVA_MODEL), {
    config: {
      region,
      interfaceConfig: {
        temperature: 0,
        max_new_tokens: 1024,
      },
    },
    env,
  });

  // Prepare the Titan embedding provider
  const titanEmbeddingProvider = new AwsBedrockEmbeddingProvider(
    getRegionalModelId(DEFAULT_TITAN_EMBEDDING_MODEL),
    {
      config: {
        region,
      },
      env,
    },
  );

  return {
    embeddingProvider: titanEmbeddingProvider,
    gradingJsonProvider: novaProProvider,
    gradingProvider: novaProProvider,
    moderationProvider: novaProProvider,
    suggestionsProvider: novaProProvider,
    synthesizeProvider: novaProProvider,
  };
}
