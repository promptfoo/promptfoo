import { getEnvOverrides } from '../../envOverrides';
import { AwsBedrockConverseProvider } from './converse';

import type { EnvOverrides } from '../../types/env';
import type { DefaultProviders } from '../../types/index';
import type { BedrockOptions } from './base';

// Default model for Bedrock grading - Nova Pro offers good balance of capability and cost
// No special agreement required (unlike Anthropic models on Bedrock)
export const DEFAULT_BEDROCK_MODEL = 'amazon.nova-pro-v1:0';

function getConfiguredEnvValue(key: keyof EnvOverrides, env?: EnvOverrides): string | undefined {
  return env?.[key] || getEnvOverrides()?.[key];
}

function getBedrockStaticCredentialConfig(env?: EnvOverrides): BedrockOptions | undefined {
  for (const source of [env, getEnvOverrides()]) {
    if (source?.AWS_ACCESS_KEY_ID && source?.AWS_SECRET_ACCESS_KEY) {
      return {
        accessKeyId: source.AWS_ACCESS_KEY_ID,
        secretAccessKey: source.AWS_SECRET_ACCESS_KEY,
        sessionToken: source.AWS_SESSION_TOKEN,
      };
    }
  }

  return undefined;
}

export function hasBedrockBearerToken(env?: EnvOverrides): boolean {
  return Boolean(
    getConfiguredEnvValue('AWS_BEARER_TOKEN_BEDROCK', env) || process.env.AWS_BEARER_TOKEN_BEDROCK,
  );
}

export function hasBedrockAmbientCredentials(env?: EnvOverrides): boolean {
  return Boolean(
    getBedrockStaticCredentialConfig(env) ||
      (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ||
      getConfiguredEnvValue('AWS_PROFILE', env) ||
      process.env.AWS_PROFILE,
  );
}

function getBedrockCredentialConfig(env?: EnvOverrides): BedrockOptions {
  const staticCredentials = getBedrockStaticCredentialConfig(env);
  if (staticCredentials) {
    return staticCredentials;
  }

  const apiKey = getConfiguredEnvValue('AWS_BEARER_TOKEN_BEDROCK', env);
  if (apiKey) {
    return { apiKey };
  }

  const credentialProfile = getConfiguredEnvValue('AWS_PROFILE', env);
  if (credentialProfile) {
    return { credentialProfile };
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
