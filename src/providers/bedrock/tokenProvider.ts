import { getEnvString } from '../../envars';
import { resolveBedrockMantleApiKey } from './mantle';

import type { EnvOverrides } from '../../types/env';

type BedrockTokenGenerator = () => Promise<string>;

interface BedrockTokenGeneratorOptions {
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
  expiresInSeconds?: number;
  profile?: string;
  region: string;
}

export interface BedrockTokenProviderConfig {
  accessKeyId?: unknown;
  apiKey?: unknown;
  profile?: unknown;
  secretAccessKey?: unknown;
  sessionToken?: unknown;
}

/**
 * Resolve Bedrock mantle bearer tokens without conflating them with OpenAI API keys.
 *
 * A configured token is returned as-is. Otherwise, AWS credentials are used to generate a
 * short-lived token before every request. AWS recommends calling its token provider before each
 * request; doing that also avoids guessing when an underlying role/session credential expires
 * during a long scan. Concurrent callers share one in-flight generation so a high-concurrency
 * eval does not stampede the credential chain.
 */
export class BedrockTokenProvider {
  private generationLock?: Promise<string>;
  private tokenGenerator?: Promise<BedrockTokenGenerator>;

  constructor(
    private readonly config: BedrockTokenProviderConfig,
    private readonly env: EnvOverrides | undefined,
    private readonly region: string,
  ) {}

  async getToken(): Promise<string> {
    const configuredToken = resolveBedrockMantleApiKey(this.config, this.env);
    if (configuredToken) {
      return configuredToken;
    }

    if (this.generationLock !== undefined) {
      return this.generationLock;
    }

    const generation = this.generateToken();
    this.generationLock = generation;
    try {
      return await generation;
    } finally {
      if (this.generationLock === generation) {
        this.generationLock = undefined;
      }
    }
  }

  private async generateToken(): Promise<string> {
    const generator = await this.getTokenGenerator();
    try {
      return await generator();
    } catch (error) {
      throw new Error(
        'Unable to generate a short-lived Amazon Bedrock bearer token using AWS credentials. ' +
          'Set AWS_BEARER_TOKEN_BEDROCK directly, or configure AWS credentials with permission ' +
          'to call bedrock:InvokeModel. ' +
          (error instanceof Error ? error.message : String(error)),
        { cause: error },
      );
    }
  }

  private async getTokenGenerator(): Promise<BedrockTokenGenerator> {
    this.tokenGenerator ??= this.createTokenGenerator();
    return this.tokenGenerator;
  }

  private async createTokenGenerator(): Promise<BedrockTokenGenerator> {
    const options: BedrockTokenGeneratorOptions = {
      region: this.region,
      ...this.getCredentialOptions(),
    };

    try {
      const { getTokenProvider } = await import('@aws/bedrock-token-generator');
      return getTokenProvider(options);
    } catch (error) {
      throw new Error(
        'Unable to load Amazon Bedrock token generation support. Install the optional ' +
          '@aws/bedrock-token-generator package, or set AWS_BEARER_TOKEN_BEDROCK directly.',
        { cause: error },
      );
    }
  }

  private getCredentialOptions(): Pick<BedrockTokenGeneratorOptions, 'credentials' | 'profile'> {
    const accessKeyId = this.getConfiguredValue('accessKeyId', 'AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.getConfiguredValue('secretAccessKey', 'AWS_SECRET_ACCESS_KEY');
    const sessionToken = this.getConfiguredValue('sessionToken', 'AWS_SESSION_TOKEN');

    if (accessKeyId || secretAccessKey || sessionToken) {
      if (!accessKeyId || !secretAccessKey) {
        throw new Error(
          'AWS access credentials are incomplete. Set both AWS_ACCESS_KEY_ID and ' +
            'AWS_SECRET_ACCESS_KEY (and AWS_SESSION_TOKEN when required).',
        );
      }
      return {
        credentials: {
          accessKeyId,
          secretAccessKey,
          ...(sessionToken ? { sessionToken } : {}),
        },
      };
    }

    const profile = this.getConfiguredValue('profile', 'AWS_PROFILE');
    return profile ? { profile } : {};
  }

  private getConfiguredValue(
    configKey: keyof BedrockTokenProviderConfig,
    envKey: 'AWS_ACCESS_KEY_ID' | 'AWS_PROFILE' | 'AWS_SECRET_ACCESS_KEY' | 'AWS_SESSION_TOKEN',
  ): string | undefined {
    const configValue = this.config[configKey];
    if (typeof configValue === 'string' && configValue.trim() && !configValue.includes('{{')) {
      return configValue;
    }

    const providerValue = this.env?.[envKey];
    if (typeof providerValue === 'string' && providerValue.trim()) {
      return providerValue;
    }

    return getEnvString(envKey);
  }
}
