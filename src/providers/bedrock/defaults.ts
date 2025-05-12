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
  const hasExplicitCredentials = Boolean(
    (process.env.AWS_ACCESS_KEY_ID || (env as any)?.AWS_ACCESS_KEY_ID) &&
      (process.env.AWS_SECRET_ACCESS_KEY || (env as any)?.AWS_SECRET_ACCESS_KEY),
  );

  // Check for AWS_PROFILE or AWS_ROLE_ARN
  const hasProfileOrRole = Boolean(
    process.env.AWS_PROFILE ||
      (env as any)?.AWS_PROFILE ||
      process.env.AWS_ROLE_ARN ||
      (env as any)?.AWS_ROLE_ARN,
  );

  // On AWS services, we might not need explicit credentials
  const isRunningOnAws = Boolean(
    process.env.AWS_EXECUTION_ENV || // Lambda, ECS, etc.
      process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI || // ECS
      process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI, // EKS
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
