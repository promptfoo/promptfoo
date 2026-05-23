import { AwsBedrockConverseProvider } from './converse';

import type { EnvOverrides } from '../../types/env';
import type { DefaultProviders } from '../../types/index';
import type { BedrockOptions } from './base';

// Default model for Bedrock grading - Nova Pro offers good balance of capability and cost
// No special agreement required (unlike Anthropic models on Bedrock)
export const DEFAULT_BEDROCK_MODEL = 'amazon.nova-pro-v1:0';

function getBedrockCredentialConfig(env?: EnvOverrides): BedrockOptions {
  if (env?.AWS_ACCESS_KEY_ID && env?.AWS_SECRET_ACCESS_KEY) {
    return {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      sessionToken: env.AWS_SESSION_TOKEN,
    };
  }

  if (env?.AWS_BEARER_TOKEN_BEDROCK) {
    return { apiKey: env.AWS_BEARER_TOKEN_BEDROCK };
  }

  if (env?.AWS_PROFILE) {
    return { profile: env.AWS_PROFILE };
  }

  return {};
}

export function getBedrockProviders(
  env?: EnvOverrides,
): Pick<
  DefaultProviders,
  'gradingJsonProvider' | 'gradingProvider' | 'suggestionsProvider' | 'synthesizeProvider'
> {
  const credentialConfig = getBedrockCredentialConfig(env);

  const gradingProvider = new AwsBedrockConverseProvider(DEFAULT_BEDROCK_MODEL, {
    env,
    config: credentialConfig,
  });

  return {
    gradingProvider,
    gradingJsonProvider: new AwsBedrockConverseProvider(DEFAULT_BEDROCK_MODEL, {
      env,
      config: {
        ...credentialConfig,
        additionalModelRequestFields: {
          inferenceConfig: {
            // Nova models support JSON output via system prompt, not response_format
          },
        },
      },
    }),
    suggestionsProvider: gradingProvider,
    synthesizeProvider: gradingProvider,
  };
}
