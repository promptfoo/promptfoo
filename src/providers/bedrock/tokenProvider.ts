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
  apiKeyRequired?: boolean;
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

  async getToken(signal?: AbortSignal): Promise<string | undefined> {
    signal?.throwIfAborted();
    const configuredToken = resolveBedrockMantleApiKey(this.config, this.env);
    if (configuredToken) {
      return configuredToken;
    }
    if (this.config.apiKeyRequired === false) {
      return undefined;
    }

    const generation = this.getGeneratedToken();
    if (!signal) {
      return generation;
    }
    let onAbort: () => void;
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      return await Promise.race([generation, aborted]);
    } finally {
      signal.removeEventListener('abort', onAbort!);
    }
  }

  private async getGeneratedToken(): Promise<string> {
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
          'to invoke the selected Bedrock model. ' +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }

  private async getTokenGenerator(): Promise<BedrockTokenGenerator> {
    // Cache the generator, but never cache a construction failure. Both failure modes
    // here are recoverable without restarting the process — the optional
    // @aws/bedrock-token-generator package can be installed, and the credential chain
    // can become ready — so a rejected promise must not pin every later request to the
    // same error. This mirrors the generation lock below, which also releases on failure.
    this.tokenGenerator ??= this.createTokenGenerator().catch((error) => {
      this.tokenGenerator = undefined;
      throw error;
    });
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
          '@aws/bedrock-token-generator package, or set AWS_BEARER_TOKEN_BEDROCK directly. ' +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }

  private getCredentialOptions(): Pick<BedrockTokenGeneratorOptions, 'credentials' | 'profile'> {
    // Select credentials as a tuple from one source. Never attach an ambient session token
    // to another account's explicit keys. Within each source, explicit keys precede a profile.
    const sources = [
      this.config,
      {
        accessKeyId: this.env?.AWS_ACCESS_KEY_ID,
        secretAccessKey: this.env?.AWS_SECRET_ACCESS_KEY,
        sessionToken: this.env?.AWS_SESSION_TOKEN,
        profile: this.env?.AWS_PROFILE,
      },
      {
        profile: getEnvString('AWS_PROFILE'),
      },
      {
        accessKeyId: getEnvString('AWS_ACCESS_KEY_ID'),
        secretAccessKey: getEnvString('AWS_SECRET_ACCESS_KEY'),
        sessionToken: getEnvString('AWS_SESSION_TOKEN'),
      },
    ];
    for (const source of sources) {
      const value = (key: keyof BedrockTokenProviderConfig): string | undefined => {
        const v = source[key as keyof typeof source];
        return typeof v === 'string' && v.trim() && !v.includes('{{') ? v : undefined;
      };
      const accessKeyId = value('accessKeyId');
      const secretAccessKey = value('secretAccessKey');
      const sessionToken = value('sessionToken');
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
      const profile = value('profile');
      if (profile) {
        return { profile };
      }
    }
    return {};
  }
}
