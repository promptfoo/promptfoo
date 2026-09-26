/**
 * AWS Bedrock Base Provider
 *
 * Contains the abstract base class for all Bedrock providers.
 * This is extracted to avoid circular dependency issues.
 */

import { createHash, randomUUID } from 'crypto';

import { getEnvInt, getEnvString } from '../../envars';
import logger from '../../logger';
import telemetry from '../../telemetry';
import { getScopedAwsCredentialConfig, resolveAwsCredentials } from '../awsCredentials';
import { createEnvironmentScopedState } from '../scopedState';
import { createBedrockRequestHandler } from './util';
import type { BedrockRuntime, Trace } from '@aws-sdk/client-bedrock-runtime';
import type { AwsCredentialIdentity, AwsCredentialIdentityProvider } from '@aws-sdk/types';

import type { EnvOverrides } from '../../types/env';

export interface BedrockOptions {
  accessKeyId?: string;
  apiKey?: string;
  profile?: string;
  region?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  guardrailIdentifier?: string;
  guardrailVersion?: string;
  trace?: Trace;
  showThinking?: boolean;
  endpoint?: string;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto === Object.prototype || proto === null) {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, entry]) => [key, canonicalize(entry)]),
      );
    }
  }
  return value;
}

function hashBedrockCacheValue(value: unknown) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)) ?? '')
    .digest('hex');
}

export function createBedrockCacheKeyHash({
  config,
  params,
  region,
  cacheNamespace,
}: {
  config: Pick<BedrockOptions, 'endpoint'>;
  params: unknown;
  region: string;
  cacheNamespace: string;
}) {
  // The namespace is opaque and belongs to the SDK client owner. No credential,
  // bearer token or profile contents enter a persistent cache fingerprint.
  return `${hashBedrockCacheValue({ cacheNamespace, endpoint: config.endpoint })}:${hashBedrockCacheValue({ params, region })}`;
}

export abstract class AwsBedrockGenericProvider {
  private readonly getSdkState = createEnvironmentScopedState(
    () => ({
      namespace: randomUUID(),
      client: undefined as BedrockRuntime | undefined,
      initialization: undefined as Promise<BedrockRuntime> | undefined,
    }),
    async (state) => {
      // A construction already in flight still belongs to this invocation.
      await state.initialization?.catch(() => undefined);
      state.client?.destroy();
    },
  );
  protected get responseCacheNamespace(): string {
    return this.getSdkState().namespace;
  }
  modelName: string;
  env?: EnvOverrides;
  private injectedBedrock?: BedrockRuntime;
  get bedrock(): BedrockRuntime | undefined {
    return this.injectedBedrock ?? this.getSdkState().client;
  }
  set bedrock(client: BedrockRuntime | undefined) {
    this.injectedBedrock = client;
  }
  config: BedrockOptions;

  constructor(
    modelName: string,
    options: { config?: BedrockOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    const { config, id, env } = options;
    this.env = env;
    this.modelName = modelName;
    this.config = config || {};
    this.id = id ? () => id : this.id;

    if (this.config.guardrailIdentifier) {
      telemetry.record('feature_used', {
        feature: 'guardrail',
        provider: 'bedrock',
      });
    }
  }

  id(): string {
    return `bedrock:${this.modelName}`;
  }

  toString(): string {
    return `[Amazon Bedrock Provider ${this.modelName}]`;
  }

  requiresApiKey(): boolean {
    return false;
  }

  protected getApiKey(): string | undefined {
    const source = getScopedAwsCredentialConfig(this.config, this.env, true);
    if (source) {
      if (
        [source.accessKeyId, source.secretAccessKey, source.sessionToken].some(
          (value) => value !== undefined,
        )
      ) {
        return undefined;
      }
      if (source.apiKey !== undefined && !source.apiKey) {
        throw new Error(
          'Scoped AWS_BEARER_TOKEN_BEDROCK is empty. Supply a bearer token or remove the scoped override.',
        );
      }
      return source.apiKey;
    }
    return getEnvString('AWS_BEARER_TOKEN_BEDROCK');
  }

  protected getProfile(): string | undefined {
    return getScopedAwsCredentialConfig(this.config, this.env, true)?.profile;
  }

  async getCredentials(): Promise<
    AwsCredentialIdentity | AwsCredentialIdentityProvider | undefined
  > {
    if (this.getApiKey()) {
      return undefined;
    }
    return resolveAwsCredentials(this.config, this.env);
  }

  protected async getBedrockAuthOptions() {
    const credentials = await this.getCredentials();
    const profile = this.getProfile();
    const apiKey = this.getApiKey();
    return {
      ...(credentials ? { credentials } : {}),
      ...(profile ? { profile } : {}),
      ...(apiKey
        ? { token: { token: apiKey }, authSchemePreference: ['httpBearerAuth'] }
        : credentials || profile
          ? { authSchemePreference: ['sigv4'] }
          : {}),
    };
  }

  async getBedrockInstance() {
    if (this.bedrock) {
      return this.bedrock;
    }
    const state = this.getSdkState();
    return (state.initialization ??= (async () => {
      const apiKey = this.getApiKey();
      const authOptions = await this.getBedrockAuthOptions();
      const handler = await createBedrockRequestHandler({ apiKey });

      try {
        const { BedrockRuntime } = await import('@aws-sdk/client-bedrock-runtime');
        const bedrock = new BedrockRuntime({
          region: this.getRegion(),
          maxAttempts: getEnvInt('AWS_BEDROCK_MAX_RETRIES', 10),
          retryMode: 'adaptive',
          requestHandler: handler,
          ...authOptions,
          ...(this.config.endpoint ? { endpoint: this.config.endpoint } : {}),
        });

        state.client = bedrock;
        return bedrock;
      } catch (err) {
        logger.error(`Error creating BedrockRuntime: ${err}`);
        throw new Error(
          'The @aws-sdk/client-bedrock-runtime package is required as a peer dependency. Please install it in your project or globally.',
        );
      }
    })().catch((error) => {
      state.initialization = undefined;
      throw error;
    }));
  }

  getRegion(): string {
    return (
      this.config?.region ||
      this.env?.AWS_BEDROCK_REGION ||
      getEnvString('AWS_BEDROCK_REGION') ||
      'us-east-1'
    );
  }
}
