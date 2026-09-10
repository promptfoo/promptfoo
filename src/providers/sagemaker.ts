import { Agent as HttpAgent } from 'node:http';
import crypto from 'crypto';

import { z } from 'zod';
import { getEnvFloat, getEnvInt, getEnvString } from '../envars';
import logger from '../logger';
import telemetry from '../telemetry';
import { getTransformErrorMessage, TransformInputType, transform } from '../util/transform';
import { StringOrFunctionSchema } from '../validators/shared';
import type { SageMakerRuntimeClient } from '@aws-sdk/client-sagemaker-runtime';
import type {
  AwsCredentialIdentity,
  RuntimeConfigAwsCredentialIdentityProvider,
} from '@aws-sdk/types';

import type { EnvOverrides } from '../types/env';
import type {
  ApiEmbeddingProvider,
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderEmbeddingResponse,
  ProviderOptions,
  ProviderResponse,
} from '../types/index';
import type { TransformContext, TransformFunction } from '../types/transform';

/**
 * Sleep utility function for implementing delays
 * @param ms Milliseconds to sleep
 * @returns Promise that resolves after the specified delay or rejects on cancellation
 */
const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });

function stringifyTransformResult(result: unknown): string | undefined {
  if (result === undefined || result === null) {
    logger.debug('Transform function returned null or undefined, using original prompt');
    return undefined;
  }
  if (typeof result === 'string') {
    return result;
  }
  return typeof result === 'object' ? JSON.stringify(result) : String(result);
}

const SUPPORTED_MODEL_TYPES = ['openai', 'llama', 'huggingface', 'jumpstart', 'custom'] as const;
/**
 * Zod schema for validating SageMaker options
 */
const SageMakerConfigSchema = z.strictObject({
  // AWS credentials options
  accessKeyId: z.string().optional(),
  profile: z.string().optional(),
  region: z.string().optional(),
  secretAccessKey: z.string().optional(),
  sessionToken: z.string().optional(),

  // SageMaker specific options
  endpoint: z.string().optional(),
  contentType: z.string().optional(),
  acceptType: z.string().optional(),

  // Model parameters
  maxTokens: z.number().optional(),
  temperature: z.number().optional(),
  topP: z.number().optional(),
  stopSequences: z.array(z.string()).optional(),

  // Provider behavior options
  delay: z.number().optional(), // Delay between API calls in milliseconds
  transform: StringOrFunctionSchema.optional(), // Transform expression, file path, or function

  // Model type for request/response handling
  // TODO(Will): What is custom? User uploaded model?
  // - Jumpstart is a model service, not a model type.
  modelType: z.enum(SUPPORTED_MODEL_TYPES).optional(),

  // Response format options
  responseFormat: z
    .strictObject({
      type: z.string().optional(),
      path: z.string().optional(), // JavaScript expression to extract content (formerly JSONPath)
    })
    .optional(),

  basePath: z.string().optional(),
});

type SageMakerConfig = z.infer<typeof SageMakerConfigSchema>;

// Inputs read by the SDK's credential providers and their nested service clients.
// Inference and retry settings must not discard still-valid memoized credentials.
const CREDENTIAL_ENV_VARS = [
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_CREDENTIAL_EXPIRATION',
  'AWS_CREDENTIAL_SCOPE',
  'AWS_ACCOUNT_ID',
  'AWS_PROFILE',
  'AWS_CONFIG_FILE',
  'AWS_SHARED_CREDENTIALS_FILE',
  'HOME',
  'USERPROFILE',
  'HOMEPATH',
  'HOMEDRIVE',
  'AWS_WEB_IDENTITY_TOKEN_FILE',
  'AWS_ROLE_ARN',
  'AWS_ROLE_SESSION_NAME',
  'AWS_CONTAINER_CREDENTIALS_RELATIVE_URI',
  'AWS_CONTAINER_CREDENTIALS_FULL_URI',
  'AWS_CONTAINER_AUTHORIZATION_TOKEN',
  'AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE',
  'AWS_EC2_METADATA_DISABLED',
  'AWS_EC2_METADATA_SERVICE_ENDPOINT',
  'AWS_EC2_METADATA_SERVICE_ENDPOINT_MODE',
  'AWS_EC2_METADATA_V1_DISABLED',
  'AWS_LOGIN_CACHE_DIRECTORY',
  'AWS_ENDPOINT_URL',
  'AWS_ENDPOINT_URL_STS',
  'AWS_ENDPOINT_URL_SSO',
  'AWS_ENDPOINT_URL_SSO_OIDC',
  'AWS_ENDPOINT_URL_SIGNIN',
  'AWS_IGNORE_CONFIGURED_ENDPOINT_URLS',
  'AWS_USE_FIPS_ENDPOINT',
  'AWS_USE_DUALSTACK_ENDPOINT',
] as const;

function credentialHelperInputs(...services: string[]): string[] {
  return [
    'AWS_ENDPOINT_URL',
    'AWS_IGNORE_CONFIGURED_ENDPOINT_URLS',
    'AWS_USE_FIPS_ENDPOINT',
    'AWS_USE_DUALSTACK_ENDPOINT',
    ...services.map((service) => `AWS_ENDPOINT_URL_${service}`),
  ];
}

// Follow the SDK's profile precedence to compare only inputs used by the selected source.
function profileCredentialInputs(
  profiles: Record<string, Record<string, string | undefined>>,
  name: string,
  visited = new Set<string>(),
): string[] | undefined {
  const data = profiles[name];
  if (!data || visited.has(name)) {
    return undefined;
  }
  const recursive = visited.size > 0;
  const staticKeys = data.aws_access_key_id && data.aws_secret_access_key;
  if (recursive && staticKeys) {
    return [];
  }
  visited.add(name);
  if (data.role_arn && data.source_profile && data.credential_source === undefined) {
    const source = profileCredentialInputs(profiles, data.source_profile, visited);
    return source && [...credentialHelperInputs('STS'), ...source];
  }
  if ((data.role_arn || recursive) && data.credential_source && data.source_profile === undefined) {
    const sources: Record<string, string[]> = {
      Environment: [
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
        'AWS_SESSION_TOKEN',
        'AWS_CREDENTIAL_EXPIRATION',
        'AWS_CREDENTIAL_SCOPE',
        'AWS_ACCOUNT_ID',
      ],
      EcsContainer: [
        'AWS_CONTAINER_CREDENTIALS_RELATIVE_URI',
        'AWS_CONTAINER_CREDENTIALS_FULL_URI',
        'AWS_CONTAINER_AUTHORIZATION_TOKEN',
        'AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE',
      ],
      Ec2InstanceMetadata: [
        'AWS_EC2_METADATA_SERVICE_ENDPOINT',
        'AWS_EC2_METADATA_SERVICE_ENDPOINT_MODE',
        'AWS_EC2_METADATA_V1_DISABLED',
      ],
    };
    const source = sources[data.credential_source];
    return source && [...(data.role_arn ? credentialHelperInputs('STS') : []), ...source];
  }
  if (staticKeys) {
    return [];
  }
  if (data.web_identity_token_file && data.role_arn) {
    return [
      ...credentialHelperInputs('STS'),
      ...(data.role_session_name === undefined ? ['AWS_ROLE_SESSION_NAME'] : []),
    ];
  }
  // Processes inherit arbitrary environment inputs; retain the existing bounded input set.
  if (data.credential_process) {
    return undefined;
  }
  if (
    ['sso_start_url', 'sso_account_id', 'sso_session', 'sso_region', 'sso_role_name'].some(
      (key) => typeof data[key] === 'string',
    )
  ) {
    return credentialHelperInputs('SSO', ...(data.sso_session ? ['SSO_OIDC'] : []));
  }
  if (data.login_session) {
    return [...credentialHelperInputs('SIGNIN'), 'AWS_LOGIN_CACHE_DIRECTORY'];
  }
  return undefined;
}

type CredentialScope = Pick<
  SageMakerConfig,
  'profile' | 'accessKeyId' | 'secretAccessKey' | 'sessionToken'
> & {
  region: string;
  environment: Record<string, string | undefined>;
};

function sameCredentialScope(left: CredentialScope, right: CredentialScope): boolean {
  return (
    left.region === right.region &&
    left.profile === right.profile &&
    left.accessKeyId === right.accessKeyId &&
    left.secretAccessKey === right.secretAccessKey &&
    left.sessionToken === right.sessionToken &&
    Object.keys(left.environment).length === Object.keys(right.environment).length &&
    Object.entries(left.environment).every(([name, value]) => right.environment[name] === value)
  );
}

// Defaults discovery belongs to the provider, independently of short-lived HTTP clients.
const DEFAULTS_ENV_VARS = [
  'AWS_DEFAULTS_MODE',
  'AWS_PROFILE',
  'AWS_CONFIG_FILE',
  'AWS_SHARED_CREDENTIALS_FILE',
  'HOME',
  'USERPROFILE',
  'HOMEPATH',
  'HOMEDRIVE',
  'AWS_EXECUTION_ENV',
  'AWS_REGION',
  'AWS_DEFAULT_REGION',
  'AWS_EC2_METADATA_DISABLED',
  'AWS_EC2_METADATA_SERVICE_ENDPOINT',
  'AWS_EC2_METADATA_SERVICE_ENDPOINT_MODE',
] as const;

interface RuntimeDefaultsState {
  inputs: (string | undefined)[];
  provider?: ReturnType<typeof import('@smithy/core/config').resolveDefaultsModeConfig>;
}

interface RuntimeRetryState {
  maxAttempts: number;
  provider?: SageMakerRuntimeClient['config']['retryStrategy'];
}

interface RuntimeEndpoint {
  url: string | undefined;
  useFipsEndpoint: boolean;
  useDualstackEndpoint: boolean;
}

interface RuntimeInitialization {
  scope: CredentialScope;
  endpoint: RuntimeEndpoint;
  retry: RuntimeRetryState;
  defaults: RuntimeDefaultsState;
  promise: Promise<SageMakerRuntimeClient>;
}

interface SageMakerOptions extends ProviderOptions {
  config?: SageMakerConfig;
}

/**
 * Base class for SageMaker providers with common functionality
 */
abstract class SageMakerGenericProvider {
  env?: EnvOverrides;
  sagemakerRuntime?: any; // SageMaker runtime client
  private initializedRuntime?: { client: SageMakerRuntimeClient; region: string };
  private readonly runtimeClients = new Map<SageMakerRuntimeClient, string>();
  private readonly runtimeClockOffsets = new Map<string, number>();
  readonly #runtimeInitializations: RuntimeInitialization[] = [];
  private readonly runtimeRetryStates = new Map<string, RuntimeRetryState>();
  private readonly runtimeDefaultsStates = new Map<string, RuntimeDefaultsState>();
  #retainedCredentials?: {
    scope: CredentialScope;
    provider: RuntimeConfigAwsCredentialIdentityProvider;
  };
  private runtimeGeneration = 0;
  private readonly activeRequests = new Set<AbortController>();
  config: SageMakerConfig;
  endpointName: string;
  delay?: number; // Delay between API calls in milliseconds
  transform?: string | TransformFunction;

  // Custom provider ID, separate from the id() method
  private providerId?: string;

  constructor(endpointName: string, options: SageMakerOptions) {
    const { config, id, env, delay, transform } = options;
    this.env = env;
    this.endpointName = endpointName;

    // Validate the config
    try {
      SageMakerConfigSchema.parse(config);
    } catch (error) {
      logger.warn(
        `Error validating SageMaker config\n${error instanceof z.ZodError ? z.prettifyError(error) : error}`,
      );
    }

    this.config = config ?? {};
    this.delay = delay || this.config.delay;
    this.transform = transform || this.config.transform;
    this.providerId = id; // Store custom ID if provided

    // Record telemetry for SageMaker usage
    telemetry.record('feature_used', {
      feature: 'sagemaker',
    });
  }

  id(): string {
    // Use custom provider ID if provided, otherwise use default format
    return this.providerId || `sagemaker:${this.endpointName}`;
  }

  toString(): string {
    return `[Amazon SageMaker Provider ${this.endpointName}]`;
  }

  /**
   * Get AWS credentials from config or environment
   */
  async getCredentials(
    config: SageMakerConfig = this.config,
    environment?: CredentialScope['environment'],
  ): Promise<AwsCredentialIdentity | RuntimeConfigAwsCredentialIdentityProvider | undefined> {
    const { accessKeyId, secretAccessKey, sessionToken, profile } = config;
    if (accessKeyId && secretAccessKey) {
      logger.debug('Using explicit credentials from config');
      return {
        accessKeyId,
        secretAccessKey,
        sessionToken,
      };
    }
    if (profile) {
      logger.debug(`Using AWS profile: ${profile}`);
      const { fromIni } = await import('@aws-sdk/credential-provider-ini').catch((cause) => {
        throw Object.assign(
          new Error(
            'The @aws-sdk/credential-provider-ini package is required for AWS profiles. Please install it with: npm install @aws-sdk/credential-provider-ini',
          ),
          { cause },
        );
      });
      return fromIni({
        profile,
        filepath: environment?.AWS_SHARED_CREDENTIALS_FILE,
        configFilepath: environment?.AWS_CONFIG_FILE,
      });
    }

    // Default credentials will be loaded from environment or instance profile
    logger.debug('Using default AWS credentials from environment');
    return undefined;
  }

  private async getCredentialScope(
    region: string,
    smithyConfig: typeof import('@smithy/core/config'),
  ): Promise<CredentialScope> {
    const { profile, accessKeyId, secretAccessKey, sessionToken } = this.config;
    if (accessKeyId && secretAccessKey) {
      return { region, accessKeyId, secretAccessKey, sessionToken, environment: {} };
    }
    const environment: CredentialScope['environment'] = Object.fromEntries(
      CREDENTIAL_ENV_VARS.map((name) => [name, process.env[name]]),
    );
    const selectedProfile = profile || environment.AWS_PROFILE;
    if (selectedProfile || !(environment.AWS_ACCESS_KEY_ID && environment.AWS_SECRET_ACCESS_KEY)) {
      const { booleanSelector, loadConfig, parseKnownFiles, SelectorType } = smithyConfig;
      const profiles = await parseKnownFiles({
        filepath: environment.AWS_SHARED_CREDENTIALS_FILE,
        configFilepath: environment.AWS_CONFIG_FILE,
      });
      const inputs = profileCredentialInputs(profiles, selectedProfile || 'default');
      if (inputs) {
        const used = new Set([
          ...inputs,
          'AWS_CONFIG_FILE',
          'AWS_SHARED_CREDENTIALS_FILE',
          'HOME',
          'USERPROFILE',
          'HOMEPATH',
          'HOMEDRIVE',
          ...(profile ? [] : ['AWS_PROFILE']),
          // An implicit default profile must yield when environment credentials become available.
          ...(selectedProfile ? [] : ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']),
        ]);
        const helperEndpoints = inputs.filter((name) => name.startsWith('AWS_ENDPOINT_URL_'));
        if (helperEndpoints.length) {
          // Nested SDK clients resolve endpoint policy from the ambient AWS profile,
          // independently of the profile selected for credentials.
          const ignoreEndpoints = await loadConfig(
            {
              environmentVariableSelector: () =>
                booleanSelector(
                  environment,
                  'AWS_IGNORE_CONFIGURED_ENDPOINT_URLS',
                  SelectorType.ENV,
                ),
              configFileSelector: (data) =>
                booleanSelector(data, 'ignore_configured_endpoint_urls', SelectorType.CONFIG),
              default: false,
            },
            {
              profile: environment.AWS_PROFILE,
              filepath: environment.AWS_SHARED_CREDENTIALS_FILE,
              configFilepath: environment.AWS_CONFIG_FILE,
            },
          )();
          if (ignoreEndpoints) {
            for (const name of helperEndpoints) {
              used.delete(name);
            }
          }
          // A service-specific URL wins over the common URL for that helper.
          if (ignoreEndpoints || helperEndpoints.every((name) => environment[name])) {
            used.delete('AWS_ENDPOINT_URL');
          }
        }
        for (const name of Object.keys(environment)) {
          if (!used.has(name)) {
            delete environment[name];
          }
        }
      }
    }
    return { region, profile, environment };
  }

  private async getRuntimeEndpoint(
    smithyConfig: typeof import('@smithy/core/config'),
  ): Promise<RuntimeEndpoint> {
    const {
      booleanSelector,
      CONFIG_PREFIX_SEPARATOR,
      loadConfig,
      NODE_USE_FIPS_ENDPOINT_CONFIG_OPTIONS,
      NODE_USE_DUALSTACK_ENDPOINT_CONFIG_OPTIONS,
      SelectorType,
    } = smithyConfig;
    const useFipsEndpoint = await loadConfig(NODE_USE_FIPS_ENDPOINT_CONFIG_OPTIONS)();
    const useDualstackEndpoint = await loadConfig(NODE_USE_DUALSTACK_ENDPOINT_CONFIG_OPTIONS)();
    // Match the runtime SDK's configured HTTP endpoint precedence. This is separate
    // from both the SageMaker deployment name and the credential helpers' endpoints.
    const ignored = await loadConfig({
      environmentVariableSelector: (env) =>
        booleanSelector(env, 'AWS_IGNORE_CONFIGURED_ENDPOINT_URLS', SelectorType.ENV),
      configFileSelector: (profile) =>
        booleanSelector(profile, 'ignore_configured_endpoint_urls', SelectorType.CONFIG),
      default: false,
    })();
    if (ignored) {
      return { url: undefined, useFipsEndpoint, useDualstackEndpoint };
    }
    const url = await loadConfig({
      environmentVariableSelector: (env) =>
        env.AWS_ENDPOINT_URL_SAGEMAKER_RUNTIME || env.AWS_ENDPOINT_URL || undefined,
      configFileSelector: (profile, config) => {
        if (profile.services) {
          const services = config?.[`services${CONFIG_PREFIX_SEPARATOR}${profile.services}`];
          if (!services) {
            throw new Error(
              `The services section "${profile.services}" specified in the profile is not present in the shared configuration file.`,
            );
          }
          const endpoint = services[`sagemaker_runtime${CONFIG_PREFIX_SEPARATOR}endpoint_url`];
          if (endpoint) {
            return endpoint;
          }
        }
        return profile.endpoint_url || undefined;
      },
      default: undefined,
    })();
    return { url, useFipsEndpoint, useDualstackEndpoint };
  }

  /**
   * Initialize and return the SageMaker runtime client
   */
  async getSageMakerRuntimeInstance(region?: string, generation = this.runtimeGeneration) {
    this.assertRuntimeGeneration(generation);
    // A caller-supplied client is borrowed, not part of the provider's region pool.
    if (this.sagemakerRuntime && this.sagemakerRuntime !== this.initializedRuntime?.client) {
      return this.sagemakerRuntime;
    }

    const importError = (cause: unknown): never => {
      this.assertRuntimeGeneration(generation);
      throw Object.assign(
        new Error(
          'The @aws-sdk/client-sagemaker-runtime package is required. Please install it with: npm install @aws-sdk/client-sagemaker-runtime',
        ),
        { cause },
      );
    };
    const smithyConfig = await import('@smithy/core/config').catch(importError);
    const runtimeRegion = region ?? this.getRegion();
    const scope = await this.getCredentialScope(runtimeRegion, smithyConfig);
    const endpoint = await this.getRuntimeEndpoint(smithyConfig);
    this.assertRuntimeGeneration(generation);
    const maxAttempts = getEnvInt('AWS_SAGEMAKER_MAX_RETRIES', 3);
    let retry = this.runtimeRetryStates.get(runtimeRegion);
    if (!retry || retry.maxAttempts !== maxAttempts) {
      retry = { maxAttempts };
      this.runtimeRetryStates.set(runtimeRegion, retry);
    }
    const retryState = retry;
    const defaultsInputs = DEFAULTS_ENV_VARS.map((name) => process.env[name]);
    let defaults = this.runtimeDefaultsStates.get(runtimeRegion);
    if (!defaults || defaults.inputs.some((value, index) => value !== defaultsInputs[index])) {
      defaults = { inputs: defaultsInputs };
      this.runtimeDefaultsStates.set(runtimeRegion, defaults);
    }
    const defaultsState = defaults;
    let entry = this.#runtimeInitializations.find(
      (candidate) =>
        candidate.endpoint.url === endpoint.url &&
        candidate.endpoint.useFipsEndpoint === endpoint.useFipsEndpoint &&
        candidate.endpoint.useDualstackEndpoint === endpoint.useDualstackEndpoint &&
        candidate.retry === retryState &&
        candidate.defaults === defaultsState &&
        sameCredentialScope(candidate.scope, scope),
    );
    if (!entry) {
      const initialization: RuntimeInitialization = {
        scope,
        endpoint,
        retry: retryState,
        defaults: defaultsState,
        promise: (async () => {
          const { SageMakerRuntimeClient } = await import(
            '@aws-sdk/client-sagemaker-runtime'
          ).catch(importError);
          const { loadConfigsForDefaultMode } = await import('@smithy/core/client').catch(
            importError,
          );
          const { resolveDefaultsModeConfig } = smithyConfig;
          this.assertRuntimeGeneration(generation);
          if (
            this.#retainedCredentials &&
            !sameCredentialScope(this.#retainedCredentials.scope, scope)
          ) {
            this.#retainedCredentials = undefined;
          }
          const retainedCredentials = this.#retainedCredentials?.provider;
          let credentials =
            retainedCredentials ?? (await this.getCredentials(scope, scope.environment));
          if (!credentials) {
            const { defaultProvider } = await import('@aws-sdk/credential-provider-node').catch(
              importError,
            );
            credentials = defaultProvider({
              profile: scope.environment.AWS_PROFILE,
              filepath: scope.environment.AWS_SHARED_CREDENTIALS_FILE,
              configFilepath: scope.environment.AWS_CONFIG_FILE,
            });
          }
          if (!retainedCredentials && typeof credentials === 'function') {
            const chain = credentials;
            // STS and other credential clients must own their transport independently of SageMaker.
            const callerClientConfig = { region: async () => runtimeRegion };
            const isolated: RuntimeConfigAwsCredentialIdentityProvider = (options) =>
              chain({ ...options, callerClientConfig });
            credentials = isolated;
          }
          defaultsState.provider ??= resolveDefaultsModeConfig({ region: runtimeRegion });
          const defaultsMode = await defaultsState.provider();
          const retryStrategy = await retryState.provider?.();
          this.assertRuntimeGeneration(generation);
          const client = new SageMakerRuntimeClient({
            region: runtimeRegion,
            systemClockOffset: this.runtimeClockOffsets.get(runtimeRegion),
            useFipsEndpoint: endpoint.useFipsEndpoint,
            useDualstackEndpoint: endpoint.useDualstackEndpoint,
            defaultsMode,
            maxAttempts,
            retryMode: 'adaptive',
            ...(retryStrategy ? { retryStrategy } : {}),
            requestHandler: {
              ...loadConfigsForDefaultMode(defaultsMode),
              // The SDK's lazy HTTP agent factory creates separate pools when first sends overlap.
              httpAgent: new HttpAgent({ keepAlive: true, maxSockets: 50 }),
            },
            credentials,
          });
          if (client.config) {
            if (!this.runtimeClockOffsets.has(runtimeRegion)) {
              this.runtimeClockOffsets.set(runtimeRegion, client.config.systemClockOffset ?? 0);
            }
            // Every owned transport shares the SDK's latest correction for this region.
            // A client created before another learns must not restore its stale seed.
            Object.defineProperty(client.config, 'systemClockOffset', {
              enumerable: true,
              configurable: true,
              get: () => this.runtimeClockOffsets.get(runtimeRegion) ?? 0,
              set: (offset: number) => {
                if (Number.isFinite(offset)) {
                  this.runtimeClockOffsets.set(runtimeRegion, offset);
                }
              },
            });
          }
          if (client.config?.retryStrategy) {
            retryState.provider = client.config.retryStrategy;
          }
          if (!(scope.accessKeyId && scope.secretAccessKey) && typeof credentials === 'function') {
            // Keep SDK credential memoization, including the default chain's background refresh.
            this.#retainedCredentials = {
              scope,
              provider: scope.profile
                ? (retainedCredentials ?? client.config.credentials)
                : credentials,
            };
          }
          this.runtimeClients.set(client, runtimeRegion);
          logger.debug(`SageMaker client initialized for region ${runtimeRegion}`);
          return client;
        })(),
      };
      this.#runtimeInitializations.push(initialization);
      entry = initialization;
    }
    let runtime: SageMakerRuntimeClient;
    try {
      runtime = await entry.promise;
    } catch (error) {
      const index = this.#runtimeInitializations.indexOf(entry);
      if (index !== -1) {
        this.#runtimeInitializations.splice(index, 1);
      }
      throw error;
    }
    this.assertRuntimeGeneration(generation);
    if (!this.sagemakerRuntime || this.sagemakerRuntime === this.initializedRuntime?.client) {
      this.sagemakerRuntime = runtime;
      this.initializedRuntime = { client: runtime, region: runtimeRegion };
    }
    return runtime;
  }

  protected async withRequest<T>(
    run: (generation: number, signal: AbortSignal) => Promise<T>,
    callerSignal?: AbortSignal,
  ): Promise<T> {
    const controller = new AbortController();
    const signal = callerSignal
      ? AbortSignal.any([callerSignal, controller.signal])
      : controller.signal;
    signal.throwIfAborted();
    this.activeRequests.add(controller);
    let onAbort!: () => void;
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      return await Promise.race([run(this.runtimeGeneration, signal), aborted]);
    } finally {
      signal.removeEventListener('abort', onAbort);
      this.activeRequests.delete(controller);
      // Share region clients only while requests overlap; no global evaluation owns them.
      if (this.activeRequests.size === 0) {
        this.cleanup();
      }
    }
  }

  protected assertRuntimeGeneration(generation: number): void {
    if (generation !== this.runtimeGeneration) {
      throw new Error('SageMaker provider was shut down during the request');
    }
  }

  cleanup(): void {
    this.runtimeGeneration++;
    for (const controller of this.activeRequests) {
      controller.abort(new Error('SageMaker provider was shut down during the request'));
    }
    const clients = [...this.runtimeClients.keys()];
    this.runtimeClients.clear();
    this.#runtimeInitializations.length = 0;
    if (clients.includes(this.sagemakerRuntime)) {
      this.sagemakerRuntime = undefined;
    }
    this.initializedRuntime = undefined;
    for (const client of clients) {
      try {
        client.destroy();
      } catch (error) {
        logger.warn('Error destroying SageMaker runtime client', { error });
      }
    }
  }

  /**
   * Get AWS region from config or environment
   */
  getRegion(): string {
    return (
      this.config?.region ||
      this.env?.AWS_REGION ||
      getEnvString('AWS_REGION') ||
      getEnvString('AWS_DEFAULT_REGION') ||
      'us-east-1'
    );
  }

  /**
   * Get SageMaker endpoint name
   */
  getEndpointName(): string {
    return this.config?.endpoint || this.endpointName;
  }

  /**
   * Get content type for request
   */
  getContentType(): string {
    return this.config?.contentType || 'application/json';
  }

  /**
   * Get accept type for response
   */
  getAcceptType(): string {
    return this.config?.acceptType || 'application/json';
  }

  /**
   * Apply transformation to a prompt if a transform function is specified
   * @param prompt The original prompt to transform
   * @param context Optional context information for the transformation
   * @returns The transformed prompt, or the original if no transformation is applied
   */
  async applyTransformation(prompt: string, context?: CallApiContextParams): Promise<string> {
    // If no transform is specified, return the original prompt
    if (!this.transform) {
      return prompt;
    }

    try {
      // Create a transform context from the available information
      const transformContext: TransformContext = {
        vars: context?.vars || {},
        prompt: context?.prompt || { raw: prompt },
        uuid: `sagemaker-${this.endpointName}-${Date.now()}`,
      };

      const transformFn = this.transform;

      logger.debug(`Applying transform to prompt for SageMaker endpoint ${this.getEndpointName()}`);

      // Inline string expressions are evaluated directly here because SageMaker exposes
      // the inline identifier as `prompt` rather than `output`; routing them through
      // `src/util/transform` would rename the identifier and break existing configs.
      // Direct TransformFunction values and file:// references delegate to the shared
      // `transform()` utility.
      if (typeof transformFn === 'string' && !transformFn.startsWith('file://')) {
        // SECURITY WARNING: Using new Function() with dynamic content can be risky
        // This is safe only if transform content comes from trusted sources (like config files)
        // and not from user input or external API responses
        let result: unknown;
        if (transformFn.includes('=>')) {
          const fn = new Function(
            'prompt',
            'context',
            `try { return (${transformFn})(prompt, context); } catch(e) { throw new Error("Transform function error: " + e.message); }`,
          );
          result = await Promise.resolve(fn(prompt, transformContext));
        } else {
          const fn = new Function(
            'prompt',
            'context',
            `try { ${transformFn} } catch(e) { throw new Error("Transform function error: " + e.message); }`,
          );
          result = await Promise.resolve(fn(prompt, transformContext));
        }

        const transformedPrompt = stringifyTransformResult(result);
        if (transformedPrompt !== undefined) {
          return transformedPrompt;
        }
      } else {
        const transformed = await transform(
          transformFn,
          prompt,
          transformContext,
          false,
          TransformInputType.OUTPUT,
        );

        const transformedPrompt = stringifyTransformResult(transformed);
        if (transformedPrompt !== undefined) {
          return transformedPrompt;
        }
      }

      // Fall back to the original prompt if the transform result is not usable
      logger.warn(`Transform did not produce a valid result, using original prompt`);
      return prompt;
    } catch (error) {
      // User-supplied function transforms must surface their errors so programming
      // mistakes don't silently run the endpoint against the untransformed prompt.
      // Inline-string and file:// transforms keep the legacy best-effort contract
      // (log and fall through) so existing SageMaker configs aren't regressed.
      if (typeof this.transform === 'function') {
        throw error;
      }
      logger.error(`Error applying transform to prompt: ${error}`);
      return prompt;
    }
  }

  /**
   * Run `applyTransformation` and convert a function-transform throw into a
   * `ProviderResponse.error` so the evaluator sees a uniform error row instead
   * of an uncaught rejection.
   */
  protected async runTransformSafely(
    input: string,
    context: CallApiContextParams | undefined,
    errorPrefix: string,
  ): Promise<{ ok: true; value: string } | { ok: false; error: string }> {
    try {
      return { ok: true, value: await this.applyTransformation(input, context) };
    } catch (transformError) {
      const message = `${errorPrefix}: ${getTransformErrorMessage(transformError)}`;
      logger.error(message);
      return { ok: false, error: message };
    }
  }

  /**
   * Extracts data from a response using a path expression
   * Supports JavaScript expressions and file-based transforms
   */
  protected async extractFromPath(
    responseJson: any,
    pathExpression: string | undefined,
  ): Promise<any> {
    if (!pathExpression) {
      return responseJson;
    }

    try {
      // For file-based transforms, use them directly
      if (pathExpression.startsWith('file://')) {
        try {
          // Use the transform utility for file-based transforms
          const transformedResult = await transform(
            pathExpression,
            responseJson,
            { prompt: {} }, // Minimal context since we're just transforming the response
            false, // Don't validate return to allow undefined/null
            TransformInputType.OUTPUT,
          );

          // Return the transformed result, or original JSON if undefined/null
          return transformedResult !== undefined && transformedResult !== null
            ? transformedResult
            : responseJson;
        } catch (error) {
          logger.warn(`Failed to transform response using file: ${error}`);
          return responseJson;
        }
      }

      // For JavaScript expressions, create a simple function
      try {
        // Create a function that evaluates the expression with 'json' as the input
        const result = new Function(
          'json',
          `try { return ${pathExpression}; } catch(e) { return undefined; }`,
        )(responseJson);

        if (result === undefined) {
          logger.warn(`Path expression "${pathExpression}" did not match any data in the response`);
          logger.debug(
            `Response JSON structure: ${JSON.stringify(responseJson).substring(0, 200)}...`,
          );
          return responseJson;
        }

        return result;
      } catch (error) {
        logger.warn(`Failed to evaluate expression "${pathExpression}": ${error}`);
        return responseJson;
      }
    } catch (error) {
      logger.warn(`Failed to extract data using path expression "${pathExpression}": ${error}`);
      logger.debug(`Response JSON structure: ${JSON.stringify(responseJson).substring(0, 200)}...`);
      return responseJson;
    }
  }
}

/**
 * Provider for text generation with SageMaker endpoints
 */
export class SageMakerCompletionProvider extends SageMakerGenericProvider implements ApiProvider {
  readonly modelType: SageMakerConfig['modelType'];

  constructor(endpointName: string, options: SageMakerOptions) {
    super(endpointName, options);

    this.modelType = this.parseModelType(options.config?.modelType);
  }

  /**
   * Model type must be specified within the id or the `config.modelType` field.
   */
  private parseModelType(modelType: SageMakerConfig['modelType']): SageMakerConfig['modelType'] {
    // If an ID is provided, attempt to extract the model type from it
    const match = this.id().match(/^sagemaker:(?<modelType>.+):.+$/);
    if (match) {
      const modelTypeFromId = match.groups!.modelType;

      // Validate the model type from ID
      if (SUPPORTED_MODEL_TYPES.includes(modelTypeFromId as any)) {
        return modelTypeFromId as SageMakerConfig['modelType'];
      } else {
        throw new Error(
          `Invalid model type "${modelTypeFromId}" in provider ID. Valid types are: ${SUPPORTED_MODEL_TYPES.join(', ')}`,
        );
      }
    }

    // If a model type is provided in the config, validate it
    if (modelType) {
      if (SUPPORTED_MODEL_TYPES.includes(modelType)) {
        return modelType;
      } else {
        throw new Error(
          `Invalid model type "${modelType}" in \`config.modelType\`. Valid types are: ${SUPPORTED_MODEL_TYPES.join(', ')}`,
        );
      }
    }

    throw new Error(
      'Model type must be set either in `config.modelType` or as part of the Provider ID, for example: "sagemaker:<model_type>:<endpoint>"',
    );
  }

  /**
   * Format the request payload based on model type
   */
  formatPayload(prompt: string): string {
    const maxTokens = this.config.maxTokens ?? getEnvInt('AWS_SAGEMAKER_MAX_TOKENS') ?? 1024;
    const temperature =
      typeof this.config.temperature === 'number'
        ? this.config.temperature
        : (getEnvFloat('AWS_SAGEMAKER_TEMPERATURE') ?? 0.7);
    const topP =
      typeof this.config.topP === 'number'
        ? this.config.topP
        : (getEnvFloat('AWS_SAGEMAKER_TOP_P') ?? 1.0);
    const stopSequences = this.config.stopSequences || [];

    let payload: any;

    logger.debug(`Formatting payload for model type: ${this.modelType}`);

    switch (this.modelType) {
      case 'openai':
        try {
          // Try to parse as JSON array of messages
          const messages = JSON.parse(prompt);
          if (Array.isArray(messages)) {
            payload = {
              messages,
              max_tokens: maxTokens,
              temperature,
              top_p: topP,
              stop: stopSequences.length > 0 ? stopSequences : undefined,
            };
          } else {
            throw new Error('Not valid messages format');
          }
        } catch {
          // Fall back to text completion format
          payload = {
            prompt,
            max_tokens: maxTokens,
            temperature,
            top_p: topP,
            stop: stopSequences.length > 0 ? stopSequences : undefined,
          };
        }
        break;

      case 'llama':
        // TODO(Will): Can these be consolidated?
        try {
          const messages = JSON.parse(prompt);
          if (Array.isArray(messages)) {
            payload = {
              inputs: messages,
              parameters: {
                max_new_tokens: maxTokens,
                temperature,
                top_p: topP,
                stop: stopSequences.length > 0 ? stopSequences : undefined,
              },
            };
          } else {
            throw new Error('Not valid messages format');
          }
        } catch {
          // Simple text completion for Llama
          payload = {
            inputs: prompt,
            parameters: {
              max_new_tokens: maxTokens,
              temperature,
              top_p: topP,
              stop: stopSequences.length > 0 ? stopSequences : undefined,
            },
          };
        }
        break;

      case 'jumpstart':
        // Format specifically for JumpStart models which require this format
        payload = {
          inputs: prompt,
          parameters: {
            max_new_tokens: maxTokens,
            temperature,
            top_p: topP,
            do_sample: temperature > 0,
          },
        };
        break;

      case 'huggingface':
        payload = {
          inputs: prompt,
          parameters: {
            max_new_tokens: maxTokens,
            temperature,
            top_p: topP,
            do_sample: temperature > 0,
            return_full_text: false,
          },
        };
        break;

      case 'custom':
      default:
        // For custom, we just pass through the raw prompt data
        try {
          // Try to parse as JSON
          const parsedPrompt = JSON.parse(prompt);
          payload = parsedPrompt;
        } catch {
          // If not valid JSON, wrap in a simple object
          payload = { prompt };
        }
        break;
    }

    return JSON.stringify(payload);
  }

  /**
   * Parse the response from SageMaker endpoint
   */
  async parseResponse(
    responseBody: string,
    responsePath: string | null = this.config.responseFormat?.path ?? null,
  ): Promise<any> {
    let responseJson;

    logger.debug(`Parsing response for model type: ${this.modelType}`);

    try {
      responseJson = JSON.parse(responseBody);
    } catch {
      logger.debug('Response is not JSON, returning as-is');
      return responseBody; // Return as is if not JSON
    }

    // If response format specifies a path, extract it using expression evaluation
    if (responsePath) {
      try {
        const extracted = await this.extractFromPath(responseJson, responsePath);
        return extracted;
      } catch (error) {
        logger.warn(`Failed to extract from path: ${responsePath}, Error: ${error}`);
        logger.debug(
          `Response JSON structure: ${JSON.stringify(responseJson).substring(0, 200)}...`,
        );
        return responseJson;
      }
    }

    // Check for JumpStart Llama format first since that's common
    if (responseJson.generated_text) {
      logger.debug('Detected JumpStart model response format with generated_text field');
      return responseJson.generated_text;
    }

    switch (this.modelType) {
      case 'openai':
        return (
          responseJson.choices?.[0]?.message?.content ||
          responseJson.choices?.[0]?.text ||
          responseJson.generation ||
          responseJson
        );

      case 'llama':
        return (
          responseJson.generation ||
          responseJson.choices?.[0]?.message?.content ||
          responseJson.choices?.[0]?.text ||
          responseJson
        );

      case 'huggingface':
        return Array.isArray(responseJson)
          ? responseJson[0]?.generated_text || responseJson[0]
          : responseJson.generated_text || responseJson;

      case 'jumpstart':
        // For AWS JumpStart models
        return responseJson.generated_text || responseJson;

      case 'custom':
      default:
        // For custom endpoints, try common patterns
        return (
          responseJson.output ||
          responseJson.generation ||
          responseJson.response ||
          responseJson.text ||
          responseJson.generated_text ||
          responseJson.choices?.[0]?.message?.content ||
          responseJson.choices?.[0]?.text ||
          responseJson
        );
    }
  }

  /**
   * Invoke SageMaker endpoint for text generation with caching, delay support, and transformations
   */
  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    return this.withRequest(
      (generation, signal) => this.callApiWithRuntime(prompt, context, generation, signal),
      options?.abortSignal,
    );
  }

  private async callApiWithRuntime(
    prompt: string,
    context: CallApiContextParams | undefined,
    generation: number,
    abortSignal: AbortSignal,
  ): Promise<ProviderResponse> {
    // Import cache functions dynamically to avoid circular dependencies
    const { isCacheEnabled, getCache } = await import('../cache');

    // Get the delay value - the context delay takes precedence over the provider's delay
    const delayMs = context?.originalProvider?.delay || this.delay;

    const transformResult = await this.runTransformSafely(
      prompt,
      context,
      'SageMaker transform error',
    );
    if (!transformResult.ok) {
      return { error: transformResult.error };
    }
    const transformedPrompt = transformResult.value;
    const isTransformed = transformedPrompt !== prompt;

    if (isTransformed) {
      logger.debug(`Prompt transformed for SageMaker endpoint ${this.getEndpointName()}`);
      logger.debug(`Original: ${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}`);
      logger.debug(
        `Transformed: ${transformedPrompt.substring(0, 100)}${transformedPrompt.length > 100 ? '...' : ''}`,
      );
    }

    // Keep request and parsing settings together across cache and network awaits.
    const payload = this.formatPayload(transformedPrompt);
    const request = {
      payload,
      endpoint: this.getEndpointName(),
      modelType: this.modelType,
      contentType: this.getContentType(),
      acceptType: this.getAcceptType(),
      responsePath: this.config.responseFormat?.path ?? null,
      region: this.getRegion(),
    };
    let cacheKey: string | undefined;
    const getCacheKey = () => {
      if (cacheKey === undefined) {
        const hash = crypto.createHash('sha256').update(JSON.stringify(request)).digest('hex');
        cacheKey = `sagemaker:v3:${request.endpoint}:${hash}`;
      }
      return cacheKey;
    };
    const bustCache = context?.bustCache ?? context?.debug === true; // If debug mode is on, bust the cache
    if (isCacheEnabled() && !bustCache) {
      const cache = getCache ? getCache() : await import('../cache').then((m) => m.getCache());

      // Try to get from cache
      const cachedResult = await cache.get<string>(getCacheKey());
      if (cachedResult) {
        logger.debug(`Using cached SageMaker response for ${request.endpoint}`);

        try {
          // Parse the cached result
          const parsedResult = JSON.parse(cachedResult) as ProviderResponse;

          // Add cache flag to token usage
          if (parsedResult.tokenUsage) {
            parsedResult.tokenUsage.cached = parsedResult.tokenUsage.total || 0;
          }

          // Add metadata about transformation if prompt was transformed
          if (isTransformed && parsedResult.metadata) {
            parsedResult.metadata.transformed = true;
            parsedResult.metadata.originalPrompt = prompt;
          }

          return { ...parsedResult, cached: true };
        } catch (_) {
          logger.warn(`Failed to parse cached SageMaker response: ${_}`);
          // Continue with API call if parsing fails
        }
      }
    }

    // Apply delay if specified and not using cached response
    if (delayMs && delayMs > 0) {
      logger.debug(
        `Applying delay of ${delayMs}ms before calling SageMaker endpoint ${request.endpoint}`,
      );
      await sleep(delayMs, abortSignal);
    }

    // Not in cache or cache disabled, make the actual API call
    abortSignal.throwIfAborted();
    const runtime = await this.getSageMakerRuntimeInstance(request.region, generation);

    logger.debug(`Calling SageMaker endpoint ${request.endpoint}`);
    logger.debug(
      `With payload: ${payload.length > 1000 ? payload.substring(0, 1000) + '...' : payload}`,
    );

    try {
      const { InvokeEndpointCommand } = await import('@aws-sdk/client-sagemaker-runtime');

      const command = new InvokeEndpointCommand({
        EndpointName: request.endpoint,
        ContentType: request.contentType,
        Accept: request.acceptType,
        Body: payload,
      });

      const startTime = Date.now();
      this.assertRuntimeGeneration(generation);
      abortSignal.throwIfAborted();
      const response = await runtime.send(command, { abortSignal });
      const endTime = Date.now();
      const _latency = endTime - startTime;

      if (!response.Body) {
        logger.error('No response body returned from SageMaker endpoint');
        return {
          error: 'No response body returned from SageMaker endpoint',
        };
      }

      const responseBody = new TextDecoder().decode(response.Body);
      logger.debug(
        `SageMaker response (truncated): ${responseBody.length > 1000 ? responseBody.substring(0, 1000) + '...' : responseBody}`,
      );

      const output = await this.parseResponse(responseBody, request.responsePath);

      // Handle known errors:
      if (typeof output === 'object' && output !== null && 'code' in output) {
        const code = output.code;
        // 424 has been observed to result from malformed request payloads, specifically incorrect keys within the
        // `parameters` object.
        if (Number.isInteger(code) && code === 424) {
          const errorMessage = `API Error: 424${output?.message ? ` ${output.message}` : ''}\n${JSON.stringify(output)}`;
          logger.error(errorMessage);
          return { error: errorMessage };
        }
      }

      // Calculate token usage estimation (very rough estimate)
      // Note: 4 characters per token is a simplified approximation
      const promptTokens = Math.ceil(payload.length / 4);
      const completionTokens = Math.ceil((typeof output === 'string' ? output.length : 0) / 4);

      const result: ProviderResponse = {
        output,
        raw: responseBody,
        tokenUsage: {
          prompt: promptTokens,
          completion: completionTokens,
          total: promptTokens + completionTokens,
          cached: 0, // No caching for this request
          numRequests: 1,
        },
        metadata: {
          latencyMs: _latency,
          modelType: request.modelType,
          transformed: isTransformed,
          originalPrompt: isTransformed ? prompt : undefined,
        },
      };

      // Save result to cache if successful and caching enabled
      if (isCacheEnabled() && !bustCache && result.output && !result.error) {
        const cache = getCache ? getCache() : await import('../cache').then((m) => m.getCache());
        const resultToCache = JSON.stringify(result);

        try {
          await cache.set(getCacheKey(), resultToCache);
          logger.debug(
            `Stored SageMaker response in cache with key: ${getCacheKey().substring(0, 100)}...`,
          );
        } catch (_) {
          logger.warn(`Failed to store SageMaker response in cache: ${_}`);
        }
      }

      return result;
    } catch (error: any) {
      logger.error(`SageMaker API error: ${error}`);
      return {
        error: `SageMaker API error: ${error.message || String(error)}`,
      };
    }
  }
}

/**
 * Provider for embeddings with SageMaker endpoints
 */
export class SageMakerEmbeddingProvider
  extends SageMakerGenericProvider
  implements ApiEmbeddingProvider
{
  async callApi(): Promise<ProviderResponse> {
    throw new Error(
      'callApi is not implemented for embedding provider. Use callEmbeddingApi instead.',
    );
  }

  /**
   * Generate a consistent cache key for SageMaker embedding requests
   * Uses crypto.createHash to generate a shorter, more efficient key
   */
  private getCacheKey(text: string): string {
    const endpoint = this.getEndpointName();
    // Create a deterministic representation of the request parameters
    const configForKey = {
      endpoint,
      modelType: this.config.modelType,
      contentType: this.getContentType(),
      acceptType: this.getAcceptType(),
      region: this.getRegion(),
      responseFormat: this.config.responseFormat,
    };

    const configStr = JSON.stringify(configForKey);

    // Generate shorter, more efficient hashed keys
    const textHash = crypto.createHash('sha256').update(text).digest('hex').substring(0, 16);
    const configHash = crypto.createHash('sha256').update(configStr).digest('hex').substring(0, 8);

    return `sagemaker:embedding:v1:${endpoint}:${textHash}:${configHash}`;
  }

  /**
   * Invoke SageMaker endpoint for embeddings with caching, delay support, and transformations
   */
  async callEmbeddingApi(
    text: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderEmbeddingResponse> {
    return this.withRequest(
      (generation, signal) => this.callEmbeddingWithRuntime(text, context, generation, signal),
      options?.abortSignal,
    );
  }

  private async callEmbeddingWithRuntime(
    text: string,
    context: CallApiContextParams | undefined,
    generation: number,
    abortSignal: AbortSignal,
  ): Promise<ProviderEmbeddingResponse> {
    // Import cache functions dynamically to avoid circular dependencies
    const { isCacheEnabled, getCache } = await import('../cache');

    // Get the delay value - the context delay takes precedence over the provider's delay
    const delayMs = context?.originalProvider?.delay || this.delay;

    const transformResult = await this.runTransformSafely(
      text,
      context,
      'SageMaker embedding transform error',
    );
    if (!transformResult.ok) {
      return { error: transformResult.error };
    }
    const transformedText = transformResult.value;
    const isTransformed = transformedText !== text;

    if (isTransformed) {
      logger.debug(`Text transformed for SageMaker embedding endpoint ${this.getEndpointName()}`);
      logger.debug(`Original: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
      logger.debug(
        `Transformed: ${transformedText.substring(0, 100)}${transformedText.length > 100 ? '...' : ''}`,
      );
    }

    // Check if we should use cache - use the transformed text for cache key
    const bustCache = context?.debug === true; // If debug mode is on, bust the cache
    if (isCacheEnabled() && !bustCache) {
      const cacheKey = this.getCacheKey(transformedText);
      const cache = (await getCache)
        ? await getCache()
        : await import('../cache').then((m) => m.getCache());

      // Try to get from cache
      const cachedResult = await cache.get<string>(cacheKey);
      if (cachedResult) {
        logger.debug(`Using cached SageMaker embedding response for ${this.getEndpointName()}`);

        try {
          // Parse the cached result
          const parsedResult = JSON.parse(cachedResult) as ProviderEmbeddingResponse;

          // Add cache flag to token usage
          if (parsedResult.tokenUsage) {
            parsedResult.tokenUsage.cached = parsedResult.tokenUsage.prompt || 0;
          }

          return { ...parsedResult, cached: true };
        } catch (_) {
          logger.warn(`Failed to parse cached SageMaker embedding response: ${_}`);
          // Continue with API call if parsing fails
        }
      }
    }

    // Apply delay if specified and not using cached response
    if (delayMs && delayMs > 0) {
      logger.debug(
        `Applying delay of ${delayMs}ms before calling SageMaker embedding endpoint ${this.getEndpointName()}`,
      );
      await sleep(delayMs, abortSignal);
    }

    // Not in cache or cache disabled, make the actual API call
    abortSignal.throwIfAborted();
    const runtime = await this.getSageMakerRuntimeInstance(undefined, generation);

    let payload;
    const modelType = this.config.modelType || 'custom';

    logger.debug(`Formatting embedding payload for model type: ${modelType}`);

    switch (modelType) {
      case 'openai':
        payload = JSON.stringify({
          input: transformedText,
          model: 'embedding',
        });
        break;

      case 'huggingface':
        payload = JSON.stringify({
          inputs: transformedText,
        });
        break;

      case 'custom':
      default:
        // Try to support multiple common formats
        payload = JSON.stringify({
          input: transformedText,
          text: transformedText,
          inputs: transformedText,
        });
        break;
    }

    logger.debug(`Calling SageMaker embedding endpoint ${this.getEndpointName()}`);
    logger.debug(`With payload: ${payload}`);

    try {
      const { InvokeEndpointCommand } = await import('@aws-sdk/client-sagemaker-runtime');

      const command = new InvokeEndpointCommand({
        EndpointName: this.getEndpointName(),
        ContentType: this.getContentType(),
        Accept: this.getAcceptType(),
        Body: payload,
      });

      const startTime = Date.now();
      this.assertRuntimeGeneration(generation);
      abortSignal.throwIfAborted();
      const response = await runtime.send(command, { abortSignal });
      const endTime = Date.now();
      const _latency = endTime - startTime;

      if (!response.Body) {
        logger.error('No response body returned from SageMaker embedding endpoint');
        return {
          error: 'No response body returned from SageMaker embedding endpoint',
        };
      }

      const responseBody = new TextDecoder().decode(response.Body);
      logger.debug(`SageMaker embedding response: ${responseBody.substring(0, 200)}...`);

      let responseJson;
      try {
        responseJson = JSON.parse(responseBody);
      } catch (_) {
        return {
          error: `Failed to parse embedding response as JSON: ${_}`,
        };
      }

      // Try various common embedding response formats first
      const embedding =
        responseJson.embedding ||
        responseJson.embeddings ||
        responseJson.data?.[0]?.embedding ||
        (Array.isArray(responseJson) ? responseJson[0] : responseJson);

      // If response format specifies a path, extract it using JavaScript expression evaluation
      if (this.config.responseFormat?.path) {
        try {
          const pathExpression = this.config.responseFormat.path;

          // Extract data using the expression
          const extracted = await this.extractFromPath(responseJson, pathExpression);

          // Validate that the extracted data is an array of numbers (embedding)
          if (Array.isArray(extracted) && extracted.every((val) => typeof val === 'number')) {
            const result = {
              embedding: extracted,
              tokenUsage: {
                prompt: Math.ceil(text.length / 4), // Approximate token count
                cached: 0,
                numRequests: 1,
              },
              metadata: {
                transformed: isTransformed,
                originalText: isTransformed ? text : undefined,
              },
            };

            // Cache the result if caching is enabled
            await this.cacheEmbeddingResult(
              result,
              transformedText,
              context,
              isTransformed,
              isTransformed ? text : undefined,
            );

            return result;
          } else {
            logger.warn(
              'Extracted data is not a valid embedding array, trying other extraction methods',
            );
          }
        } catch (error) {
          logger.warn(
            `Failed to extract embedding from path expression: ${this.config.responseFormat.path}, Error: ${error}`,
          );
          logger.debug(
            `Response JSON structure: ${JSON.stringify(responseJson).substring(0, 200)}...`,
          );
          // Continue to try other extraction methods
        }
      }

      if (!embedding || !Array.isArray(embedding)) {
        return {
          error: `Invalid embedding response format. Could not find embedding array in: ${JSON.stringify(responseJson).substring(0, 100)}...`,
        };
      }

      const result = {
        embedding,
        tokenUsage: {
          prompt: Math.ceil(text.length / 4), // Approximate token count
          cached: 0,
          numRequests: 1,
        },
        metadata: {
          transformed: isTransformed,
          originalText: isTransformed ? text : undefined,
        },
      };

      // Cache the result if caching is enabled
      await this.cacheEmbeddingResult(
        result,
        transformedText,
        context,
        isTransformed,
        isTransformed ? text : undefined,
      );

      return result;
    } catch (error: any) {
      logger.error(`SageMaker embedding API error: ${error}`);
      return {
        error: `SageMaker embedding API error: ${error.message || String(error)}`,
      };
    }
  }

  /**
   * Helper method to cache embedding results
   */
  private async cacheEmbeddingResult(
    result: ProviderEmbeddingResponse,
    text: string, // This is the transformed text
    context?: CallApiContextParams,
    isTransformed: boolean = false,
    originalText?: string,
  ): Promise<void> {
    const { isCacheEnabled, getCache } = await import('../cache');
    const bustCache = context?.debug === true;

    // Save result to cache if successful and caching enabled
    if (isCacheEnabled() && !bustCache && result.embedding && !result.error) {
      const cacheKey = this.getCacheKey(text);
      const cache = (await getCache)
        ? await getCache()
        : await import('../cache').then((m) => m.getCache());

      // Add metadata about transformation
      if (isTransformed && originalText && !result.metadata) {
        result.metadata = {
          transformed: true,
          originalText,
        };
      } else if (isTransformed && originalText && result.metadata) {
        result.metadata.transformed = true;
        result.metadata.originalText = originalText;
      }

      const resultToCache = JSON.stringify(result);

      try {
        await cache.set(cacheKey, resultToCache);
        logger.debug(
          `Stored SageMaker embedding response in cache with key: ${cacheKey.substring(0, 100)}...`,
        );
      } catch (_) {
        logger.warn(`Failed to store SageMaker embedding response in cache: ${_}`);
      }
    }
  }
}
