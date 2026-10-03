/**
 * AWS Bedrock Base Provider
 *
 * Contains the abstract base class for all Bedrock providers.
 * This is extracted to avoid circular dependency issues.
 */

import { createHmac } from 'crypto';

import { getEnvInt, getEnvString } from '../../envars';
import logger from '../../logger';
import telemetry from '../../telemetry';
import {
  getAwsCredentialCacheNamespace,
  getAwsCredentialProviderOptions,
  getScopedAwsCredentialConfig,
  resolveAwsCredentials,
} from '../awsCredentials';
import { getOpaqueCredentialCacheNamespace } from '../credentialCache';
import { createEnvironmentScopedState } from '../scopedState';
import { createBedrockRequestHandler } from './util';
import type { BedrockRuntime, Trace } from '@aws-sdk/client-bedrock-runtime';
import type { AwsCredentialIdentity, AwsCredentialIdentityProvider } from '@smithy/types';

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

const BEDROCK_CACHE_KEY_HMAC_KEY = 'promptfoo:bedrock:cache-key:v1';

function hashBedrockCacheValue(value: unknown) {
  return createHmac('sha256', BEDROCK_CACHE_KEY_HMAC_KEY)
    .update(JSON.stringify(value) ?? '')
    .digest('hex');
}

function getNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function fingerprintBedrockAuthValue(authSource: string, value: string, index: number) {
  return createHmac('sha256', value)
    .update(`${BEDROCK_CACHE_KEY_HMAC_KEY}:${authSource}:${index}`)
    .digest('hex');
}

function getBedrockAuthCacheNamespace(authSource: string, values: (string | undefined)[]) {
  return hashBedrockCacheValue([
    authSource,
    ...values.map((value, index) =>
      value ? fingerprintBedrockAuthValue(authSource, value, index) : undefined,
    ),
  ]);
}

function createBedrockAuthCacheMetadata({ config }: { config: BedrockOptions }) {
  const bearerConfig = getNonEmptyString(config.apiKey);
  const bearerEnv = getNonEmptyString(getEnvString('AWS_BEARER_TOKEN_BEDROCK'));
  const accessKeyId = getNonEmptyString(config.accessKeyId);
  const secretAccessKey = getNonEmptyString(config.secretAccessKey);
  const sessionToken = getNonEmptyString(config.sessionToken);
  const profile = getNonEmptyString(config.profile);
  const hasExplicitCredentials = Boolean(accessKeyId && secretAccessKey);
  const authSource = hasExplicitCredentials
    ? 'explicit-credentials'
    : bearerConfig
      ? 'bearer-config'
      : bearerEnv
        ? 'bearer-env'
        : profile
          ? 'profile'
          : 'default';
  const credentialNamespace =
    authSource === 'bearer-config'
      ? getBedrockAuthCacheNamespace(authSource, [bearerConfig])
      : authSource === 'bearer-env'
        ? getBedrockAuthCacheNamespace(authSource, [bearerEnv])
        : authSource === 'explicit-credentials'
          ? getBedrockAuthCacheNamespace(authSource, [accessKeyId, secretAccessKey, sessionToken])
          : authSource === 'profile'
            ? getBedrockAuthCacheNamespace(authSource, [profile])
            : undefined;

  return {
    authSource,
    credentialNamespace,
    endpoint: config.endpoint,
    hasExplicitCredentials,
    hasSessionToken: hasExplicitCredentials && Boolean(sessionToken),
  };
}

export function createBedrockCacheKeyHash({
  config,
  params,
  region,
  cacheNamespace,
}: {
  config: BedrockOptions;
  params: unknown;
  region: string;
  cacheNamespace?: string;
}) {
  const authFingerprint = hashBedrockCacheValue(createBedrockAuthCacheMetadata({ config }));

  return `${cacheNamespace ? `${cacheNamespace}:` : ''}${authFingerprint}:${hashBedrockCacheValue({
    params,
    region,
  })}`;
}

export abstract class AwsBedrockGenericProvider {
  private readonly getSdkState = createEnvironmentScopedState(
    () => ({
      cacheNamespace: this.selectResponseCacheNamespace(),
      client: undefined as BedrockRuntime | undefined,
      initialization: undefined as Promise<BedrockRuntime> | undefined,
    }),
    async (state) => {
      // A construction already in flight still belongs to this invocation.
      await state.initialization?.catch(() => undefined);
      state.client?.destroy();
    },
  );
  protected get responseCacheNamespace(): string | undefined {
    return this.getSdkState().cacheNamespace;
  }

  protected selectResponseCacheNamespace(): string | undefined {
    if (this.config.accessKeyId && this.config.secretAccessKey) {
      return undefined;
    }
    const bearer = this.getApiKey();
    if (bearer) {
      // Keep the existing main fingerprint for config/file/ambient bearer tokens.
      // A provider-only bearer is new here and lacks a safe public identity.
      return bearer === (this.config.apiKey || getEnvString('AWS_BEARER_TOKEN_BEDROCK'))
        ? undefined
        : getOpaqueCredentialCacheNamespace(bearer);
    }
    return getAwsCredentialCacheNamespace(this.config, this.env);
  }
  modelName: string;
  env?: EnvOverrides;
  private injectedBedrock?: BedrockRuntime;
  get bedrock(): BedrockRuntime | undefined {
    return this.injectedBedrock ?? this.getSdkState().client;
  }
  set bedrock(client: BedrockRuntime | undefined) {
    this.injectedBedrock = client || undefined;
    if (!client) {
      this.getSdkState.reset();
    }
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
    return (
      this.config.apiKey ||
      this.env?.AWS_BEARER_TOKEN_BEDROCK ||
      getEnvString('AWS_BEARER_TOKEN_BEDROCK')
    );
  }

  protected getProfile(): string | undefined {
    return getScopedAwsCredentialConfig(this.config, this.env)?.profile;
  }

  async getCredentials(): Promise<
    AwsCredentialIdentity | AwsCredentialIdentityProvider | undefined
  > {
    if (this.config.accessKeyId && this.config.secretAccessKey) {
      return resolveAwsCredentials(this.config, this.env);
    }
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
      ...getAwsCredentialProviderOptions(this.env),
      ...(credentials ? { credentials } : {}),
      ...(profile === undefined ? {} : { profile }),
      // Explicitly represent an invocation's cleared bearer token so SDK
      // discovery cannot restore the host token. Existing SigV4 paths still win.
      ...(!credentials &&
      !apiKey &&
      getEnvString('AWS_BEARER_TOKEN_BEDROCK') === '' &&
      process.env.AWS_BEARER_TOKEN_BEDROCK
        ? { token: { token: '' } }
        : {}),
      ...(credentials
        ? { authSchemePreference: ['sigv4'] }
        : apiKey
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
      const authOptions = await this.getBedrockAuthOptions();
      const handler = await createBedrockRequestHandler({
        apiKey: 'token' in authOptions ? authOptions.token?.token : undefined,
      });

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
