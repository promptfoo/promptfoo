/**
 * AWS Bedrock Base Provider
 *
 * Contains the abstract base class for all Bedrock providers.
 * This is extracted to avoid circular dependency issues.
 */

import { createHmac } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import { getEnvInt, getEnvString, getMergedEnvOverrides } from '../../envars';
import logger from '../../logger';
import telemetry from '../../telemetry';
import { isMissingPackageImportError } from '../../util/packageImportErrors';
import {
  getAwsCredentialCacheNamespace,
  getAwsCredentialProviderOptions,
  getAwsEndpointCacheNamespace,
  getAwsSdkProfile,
  resolveAwsCredentials,
} from '../awsCredentials';
import { getScopedAwsEndpointOptions } from '../awsEndpointConfig';
import { getOpaqueCredentialCacheNamespace } from '../credentialCache';
import { createEnvironmentScopedState, destroyScopedClient } from '../scopedState';
import { resolveBedrockMantleRegion } from './mantle';
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
    (state) =>
      destroyScopedClient(state.client, state.initialization, (error) =>
        logger.warn('Error destroying late SDK client', { error }),
      ),
  );
  protected get responseCacheNamespace(): string | undefined {
    return this.getSdkState().cacheNamespace;
  }

  protected selectResponseCacheNamespace(iamConfig = this.config): string | undefined {
    if (this.config.accessKeyId && this.config.secretAccessKey) {
      // Older clients could overwrite SigV4 with a bearer header but cache the
      // response under these IAM keys. Migrate this family even after the bearer
      // is removed, when the same legacy key could still identify that response.
      return ['bedrock-iam-v1', getAwsEndpointCacheNamespace(this.env)].filter(Boolean).join(':');
    }
    const bearer = this.getApiKey();
    if (bearer) {
      // Keep the existing main fingerprint for config/file/ambient bearer tokens.
      // A provider-only bearer is new here and lacks a safe public identity.
      const bearerNamespace =
        bearer === (this.config.apiKey || getEnvString('AWS_BEARER_TOKEN_BEDROCK'))
          ? undefined
          : getOpaqueCredentialCacheNamespace(bearer);
      return (
        [bearerNamespace, getAwsEndpointCacheNamespace(this.env)].filter(Boolean).join(':') ||
        undefined
      );
    }
    const namespace = getAwsCredentialCacheNamespace(iamConfig, this.env);
    // A provider-level empty value masks a lower bearer identity. Keep that
    // selection separate even when IAM discovery otherwise uses the legacy key.
    return bearer === '' && getEnvString('AWS_BEARER_TOKEN_BEDROCK')
      ? `bedrock-bearer-cleared:${namespace ?? 'default'}`
      : namespace;
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
  // Agent Runtime clients are reused. Once one sees configured credentials, its
  // responses cannot safely enter a shared cache, even if the config is later cleared.
  protected allowSharedAgentRuntimeCache = true;

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

  protected checkAgentRuntimeCacheIdentity(): void {
    const { accessKeyId, profile, secretAccessKey, sessionToken } = this.config;
    if (accessKeyId || profile || secretAccessKey || sessionToken || this.getApiKey()) {
      this.allowSharedAgentRuntimeCache = false;
    }
  }

  protected getApiKey(): string | undefined {
    return (
      this.config.apiKey ||
      (this.env?.AWS_BEARER_TOKEN_BEDROCK ?? getEnvString('AWS_BEARER_TOKEN_BEDROCK'))
    );
  }

  protected getProfile(): string | undefined {
    const config =
      !(this.config.accessKeyId && this.config.secretAccessKey) && this.getApiKey()
        ? { ...this.config, profile: undefined }
        : this.config;
    return getAwsSdkProfile(config, this.env);
  }

  async getCredentials(): Promise<
    AwsCredentialIdentity | AwsCredentialIdentityProvider | undefined
  > {
    if (!(this.config.accessKeyId && this.config.secretAccessKey) && this.getApiKey()) {
      return undefined;
    }
    return resolveAwsCredentials(this.config, this.env);
  }

  protected getIamCredentialConfig() {
    // These SDK paths historically ignored provider-only bearer tokens. A
    // configured/environment bearer bypassed only the explicit SSO profile;
    // these clients still discovered IAM credentials independently.
    return !(this.config.accessKeyId && this.config.secretAccessKey) &&
      (this.config.apiKey || getEnvString('AWS_BEARER_TOKEN_BEDROCK'))
      ? { ...this.config, profile: undefined }
      : this.config;
  }

  protected getScopedEndpointOptions(
    serviceId: string,
    options: Parameters<typeof getScopedAwsEndpointOptions>[1],
  ) {
    return getScopedAwsEndpointOptions(serviceId, options, getMergedEnvOverrides(this.env));
  }

  /** Keep released IAM discovery for agent-runtime and async media/S3 clients. */
  async getIamCredentialOptions(serviceId = 'Bedrock Agent Runtime') {
    const config = this.getIamCredentialConfig();
    const credentials = await resolveAwsCredentials(config, this.env);
    const profile = getAwsSdkProfile(config, this.env);
    const sdkOptions = {
      ...getAwsCredentialProviderOptions(this.env),
      ...(profile === undefined ? {} : { profile }),
    };
    return {
      ...sdkOptions,
      ...(await this.getScopedEndpointOptions(serviceId, sdkOptions)),
      ...(credentials ? { credentials } : {}),
    };
  }

  protected async createAgentRuntimeClient(
    requestHandler?: Awaited<ReturnType<typeof createBedrockRequestHandler>>,
  ) {
    const { BedrockAgentRuntimeClient } = await import(
      '@aws-sdk/client-bedrock-agent-runtime'
    ).catch((error) => {
      if (!isMissingPackageImportError(error, '@aws-sdk/client-bedrock-agent-runtime')) {
        throw error;
      }
      throw new Error(
        'Please install @aws-sdk/client-bedrock-agent-runtime to use Bedrock agents and knowledge bases.',
      );
    });
    const options = await this.getIamCredentialOptions();
    if (options.credentials) {
      this.allowSharedAgentRuntimeCache = false;
    }
    return new BedrockAgentRuntimeClient({
      region: this.getRegion(),
      maxAttempts: getEnvInt('AWS_BEDROCK_MAX_RETRIES', 10),
      retryMode: 'adaptive',
      ...(requestHandler && { requestHandler }),
      ...options,
    });
  }

  protected async getBedrockAuthOptions() {
    const credentials = await this.getCredentials();
    const profile = this.getProfile();
    const apiKey = this.getApiKey();
    const sdkOptions = {
      ...getAwsCredentialProviderOptions(this.env),
      ...(profile === undefined ? {} : { profile }),
    };
    return {
      ...sdkOptions,
      ...(await this.getScopedEndpointOptions('Bedrock Runtime', {
        ...sdkOptions,
        endpoint: this.config.endpoint,
      })),
      ...(credentials ? { credentials } : {}),
      // Explicitly represent an invocation's cleared bearer token so SDK
      // discovery cannot restore the host token. Existing SigV4 paths still win.
      ...(!credentials && apiKey === '' && process.env.AWS_BEARER_TOKEN_BEDROCK
        ? { token: { token: '' } }
        : {}),
      ...(credentials
        ? { authSchemePreference: ['sigv4'] }
        : apiKey
          ? { token: { token: apiKey }, authSchemePreference: ['httpBearerAuth'] }
          : profile
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
    return resolveBedrockMantleRegion(this.config, this.env, 'us-east-1');
  }
}

/** Load image data from a file:// path or return already encoded data. */
export function loadBedrockImageData(imagePath: string): { data?: string; error?: string } {
  if (imagePath.startsWith('file://')) {
    const filePath = imagePath.slice(7);
    // Resolve to absolute path and validate no path traversal
    const resolvedPath = path.resolve(filePath);
    if (filePath.includes('..') && resolvedPath !== path.resolve(path.normalize(filePath))) {
      return { error: `Invalid image path (path traversal detected): ${filePath}` };
    }
    if (!fs.existsSync(resolvedPath)) {
      return { error: `Image file not found: ${resolvedPath}` };
    }
    return { data: fs.readFileSync(resolvedPath).toString('base64') };
  }
  // Assume it's already base64
  return { data: imagePath };
}
