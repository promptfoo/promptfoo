import chalk from 'chalk';
import dedent from 'dedent';
import cliState from '../cliState';
import logger from '../logger';
import { isApiProvider } from '../types/providers';
import {
  getCloudDatabaseId,
  getProviderFromCloud,
  isCloudProvider,
  validateLinkedTargetId,
} from '../util/cloud';
import invariant from '../util/invariant';
import { safeJsonStringify } from '../util/json';
import {
  isJavascriptProviderFile,
  isProviderConfigFileReference,
  loadProviderConfigsFromFile,
  normalizeProviderRef,
  readProviderConfigFile,
} from '../util/providerRef';
import {
  getProcessEnvForTemplates,
  isConfigTemplatingDisabled,
  renderEnvOnlyInObject,
} from '../util/render';
import { sanitizeObject } from '../util/sanitizer';
import { getProviderFactories } from './registry';

import type { EnvOverrides } from '../types/env';
import type { LoadApiProviderContext, TestSuiteConfig } from '../types/index';
import type {
  ApiProvider,
  ProviderConfig,
  ProviderFunction,
  ProviderOptions,
  ProvidersConfig,
} from '../types/providers';

type ProviderFunctionWithMetadata = ProviderFunction &
  Pick<ApiProvider, 'label' | 'transform' | 'delay' | 'inputs' | 'config'>;

const FORWARDED_PROVIDER_METADATA_KEYS = [
  'label',
  'transform',
  'delay',
  'inputs',
  'config',
] as const satisfies ReadonlyArray<keyof ProviderFunctionWithMetadata>;

function createProviderFromFunction(
  provider: ProviderFunctionWithMetadata,
  id: string,
): ApiProvider {
  const apiProvider: ApiProvider = {
    id: () => provider.label ?? id,
    callApi: provider,
  };
  // Only forward defined metadata so we don't overwrite downstream defaults
  // (e.g. a `config ?? {}` merge) with an explicit `undefined` key.
  const target = apiProvider as unknown as Record<string, unknown>;
  for (const key of FORWARDED_PROVIDER_METADATA_KEYS) {
    const value = provider[key];
    if (value !== undefined) {
      target[key] = value;
    }
  }
  return apiProvider;
}

function describeInvalidProvider(provider: unknown): string {
  try {
    const sanitizedProvider = sanitizeObject(provider, {
      context: 'invalid provider config',
      throwOnError: true,
    });
    return (safeJsonStringify(sanitizedProvider) ?? Object.prototype.toString.call(provider)).slice(
      0,
      200,
    );
  } catch (err) {
    logger.debug('Failed to sanitize invalid provider for error message', { error: err });
    return Object.prototype.toString.call(provider);
  }
}

function getUnknownProviderErrorMessage(providerPath: string): string {
  return dedent`
    Could not identify provider: ${chalk.bold(providerPath)}.

    ${chalk.white(dedent`
      Please check your configuration and ensure the provider is correctly specified.

      For more information on supported providers, visit: `)} ${chalk.cyan('https://promptfoo.dev/docs/providers/')}
  `;
}

// NOTE: loadApiProvider only accepts string paths. Callers use normalizeProviderRef
// (src/util/providerRef.ts) to classify provider shapes before calling this function.
export async function loadApiProvider(
  providerPath: string,
  context: LoadApiProviderContext = {},
): Promise<ApiProvider> {
  const { options = {}, basePath, env } = context;

  // Merge environment overrides: context.env (test suite level) is base,
  // options.env (provider-specific) takes precedence for per-provider customization
  const mergedEnv: EnvOverrides | undefined =
    env || options.env ? { ...env, ...options.env } : undefined;

  // Render ONLY environment variable templates at load time (e.g., {{ env.AZURE_ENDPOINT }})
  // This allows constructors to access real env values while preserving runtime templates
  // like {{ vars.* }} for per-test customization at callApi() time
  const renderedConfig = options.config
    ? renderEnvOnlyInObject(options.config, mergedEnv)
    : undefined;
  const renderedInputs =
    options.inputs === undefined ? undefined : renderEnvOnlyInObject(options.inputs, mergedEnv);
  const renderedId = options.id ? renderEnvOnlyInObject(options.id, mergedEnv) : undefined;

  const providerOptions: ProviderOptions = {
    id: renderedId,
    config: {
      ...renderedConfig,
      basePath,
    },
    env: mergedEnv,
  };

  // Validate linkedTargetId if present (Promptfoo Cloud feature)
  if (providerOptions.config?.linkedTargetId) {
    await validateLinkedTargetId(providerOptions.config.linkedTargetId);
  }

  // Render only env templates in provider path to avoid blanking unresolved placeholders.
  // This keeps behavior consistent with provider id/config rendering and file:// provider refs.
  const renderedProviderPath = renderEnvOnlyInObject(providerPath, mergedEnv);

  if (isCloudProvider(renderedProviderPath)) {
    const cloudDatabaseId = getCloudDatabaseId(renderedProviderPath);

    const cloudProvider = await getProviderFromCloud(cloudDatabaseId);
    if (isCloudProvider(cloudProvider.id)) {
      throw new Error(
        `This cloud provider ${cloudDatabaseId} points to another cloud provider: ${cloudProvider.id}. This is not allowed. A cloud provider should point to a specific provider, not another cloud provider.`,
      );
    }

    const localTopLevelInputs = getConfiguredProviderInputs({ inputs: options.inputs });
    const localConfigInputs = getConfiguredProviderInputs({ config: options.config });

    // Merge local config overrides with cloud provider config
    // Local config takes precedence to allow per-eval customization
    const mergedOptions: ProviderOptions = {
      ...cloudProvider,
      config: {
        ...cloudProvider.config,
        ...options.config,
      },
      // Allow local overrides for these fields
      label: options.label ?? cloudProvider.label,
      transform: options.transform ?? cloudProvider.transform,
      delay: options.delay ?? cloudProvider.delay,
      prompts: options.prompts ?? cloudProvider.prompts,
      inputs:
        localTopLevelInputs ??
        (localConfigInputs === undefined ? getConfiguredProviderInputs(cloudProvider) : undefined),
      // Merge all three env sources: context (base) -> cloud -> local (highest priority)
      env: {
        ...env, // Context env (from testSuite.env - proxies, tracing IDs, etc.)
        ...cloudProvider.env, // Cloud provider env overrides context
        ...options.env, // Local env overrides everything
      },
    };

    logger.debug(
      `[Cloud Provider] Loaded ${cloudDatabaseId}, resolved to ${cloudProvider.id}${options.config ? ' with local config overrides' : ''}`,
    );

    const mergedContext = {
      ...context,
      options: mergedOptions,
      env: mergedOptions.env,
    };

    return loadApiProvider(cloudProvider.id, mergedContext);
  }

  if (isProviderConfigFileReference(renderedProviderPath)) {
    const { configs, relativePath, wasArray } = readProviderConfigFile(
      renderedProviderPath,
      basePath,
    );
    const fileContent = configs[0];
    invariant(fileContent, `Provider config file ${relativePath} contains no providers`);

    // Multi-provider files must go through loadApiProviders
    if (wasArray) {
      throw new Error(
        `Multiple providers found in ${relativePath}. Use loadApiProviders instead of loadApiProvider.`,
      );
    }

    invariant(fileContent.id, `Provider config ${relativePath} must have an id`);
    logger.info('Loaded provider from config file', {
      providerConfigPath: relativePath,
      providerId: fileContent.id,
    });

    // Merge file's env with context.env - context.env takes precedence
    // This allows callers to override file-defined defaults
    const mergedFileEnv: EnvOverrides | undefined =
      fileContent.env || mergedEnv ? { ...fileContent.env, ...mergedEnv } : undefined;

    return loadApiProvider(fileContent.id, {
      basePath,
      options: {
        ...fileContent,
        env: mergedFileEnv,
      },
    });
  }

  for (const factory of await getProviderFactories(renderedProviderPath)) {
    if (factory.test(renderedProviderPath)) {
      const ret = await factory.create(renderedProviderPath, providerOptions, context);
      ret.transform = options.transform;
      ret.delay = options.delay;
      ret.inputs =
        getConfiguredProviderInputs({ inputs: renderedInputs, config: renderedConfig }) ??
        ret.inputs;
      ret.label ||= renderEnvOnlyInObject(options.label || '', mergedEnv);
      return ret;
    }
  }

  const errorMessage = getUnknownProviderErrorMessage(providerPath);
  logger.error(errorMessage);
  throw new Error(errorMessage);
}

/**
 * Interface for loadApiProvider options that includes both required and optional properties
 */
interface LoadApiProviderOptions {
  options?: ProviderOptions;
  env?: any;
  basePath?: string;
}

function loadOptionsFromResolveContext(
  context: { env?: any; basePath?: string },
  options?: ProviderOptions,
): LoadApiProviderOptions {
  return {
    ...(options && { options }),
    ...(context.env && { env: context.env }),
    ...(context.basePath && { basePath: context.basePath }),
  };
}

/**
 * Helper function to resolve provider from various formats (string, object, function).
 * Checks the resolved provider cache first and falls back to loadApiProvider for uncached providers.
 */
export async function resolveProvider(
  provider: any,
  resolvedProviders: Record<string, ApiProvider>,
  context: { env?: any; basePath?: string } = {},
): Promise<ApiProvider> {
  // Guard clause for null or undefined provider values
  if (provider == null) {
    throw new Error('Provider cannot be null or undefined');
  }

  if (typeof provider === 'string') {
    if (resolvedProviders[provider]) {
      return resolvedProviders[provider];
    }
    return await loadApiProvider(provider, loadOptionsFromResolveContext(context));
  } else if (typeof provider === 'object') {
    const descriptor = normalizeProviderRef(provider);
    invariant(
      descriptor.kind === 'options' || descriptor.kind === 'map',
      `Provider object must have an 'id' field or be a ProviderOptionsMap (e.g. { "openai:responses:gpt-5.4": { config: ... } }). Got: ${describeInvalidProvider(provider)}`,
    );
    return await loadApiProvider(
      descriptor.loadProviderPath,
      loadOptionsFromResolveContext(context, descriptor.loadOptions),
    );
  } else if (typeof provider === 'function') {
    const descriptor = normalizeProviderRef(provider);
    return createProviderFromFunction(provider as ProviderFunctionWithMetadata, descriptor.id);
  } else {
    throw new Error(
      `Invalid provider type. Expected a string (provider id), an object with an 'id' field, a ProviderOptionsMap, or a function. Got: ${typeof provider}`,
    );
  }
}

/**
 * Resolves raw provider configurations, loading file:// references.
 * Preserves non-file providers (strings, functions) in their original form
 * so they can be properly handled by loadApiProviders.
 *
 * This is used to:
 * 1. Build the provider-prompt map (respecting `prompts` filters from external files)
 * 2. Enable --filter-providers to match resolved provider ids/labels from files
 * 3. Pass to loadApiProviders without re-reading files
 */
export function resolveProviderConfigs(
  providerPaths: TestSuiteConfig['providers'],
  options?: { basePath?: string },
): TestSuiteConfig['providers'];
export function resolveProviderConfigs(
  providerPaths: ProvidersConfig,
  options?: { basePath?: string },
): ProvidersConfig;
export function resolveProviderConfigs(
  providerPaths: ProvidersConfig,
  options: { basePath?: string } = {},
): ProvidersConfig {
  const { basePath } = options;

  if (typeof providerPaths === 'string') {
    if (isProviderConfigFileReference(providerPaths)) {
      return loadProviderConfigsFromFile(providerPaths, basePath);
    }
    // Keep non-file strings as-is for loadApiProviders to handle
    return providerPaths;
  }

  if (typeof providerPaths === 'function') {
    // Keep functions as-is for loadApiProviders to handle
    return providerPaths;
  }

  if (isApiProvider(providerPaths)) {
    return providerPaths;
  }

  if (!Array.isArray(providerPaths)) {
    return providerPaths;
  }

  const results: ProviderConfig[] = [];

  for (const provider of providerPaths) {
    const descriptor = normalizeProviderRef(provider);
    if (descriptor.kind === 'file') {
      // Resolve file:// references to ProviderOptions[]
      results.push(...loadProviderConfigsFromFile(descriptor.loadProviderPath, basePath));
    } else if (descriptor.kind === 'named') {
      // Keep non-file strings as-is
      results.push(descriptor.loadProviderPath);
    } else {
      // Keep functions, ProviderOptions, ProviderOptionsMap, and unrecognized objects as-is
      // for downstream validation by loadApiProviders
      results.push(provider);
    }
  }

  return results;
}

export function getConfiguredProviderInputs(
  options: Pick<ProviderOptions, 'inputs' | 'config'>,
): ProviderOptions['inputs'] {
  const inputs = options.inputs ?? options.config?.inputs;
  return inputs !== null && typeof inputs === 'object' && !Array.isArray(inputs)
    ? (inputs as NonNullable<ProviderOptions['inputs']>)
    : undefined;
}

async function loadConfiguredProviderInputsForValidation(
  providerPath: string,
  providerOptions: ProviderOptions,
  env: EnvOverrides | undefined,
  basePath: string | undefined,
): Promise<ProviderOptions['inputs']> {
  const provider = await loadApiProvider(providerPath, {
    basePath,
    env,
    options: providerOptions,
  });
  try {
    return getConfiguredProviderInputs(provider);
  } finally {
    try {
      await provider.cleanup?.();
    } catch (error) {
      logger.warn('[Provider Validation] Error cleaning up provider', { error });
    }
  }
}

async function resolveConfiguredProviderInputs(
  providerPath: string,
  providerOptions: ProviderOptions = {},
  configEnv?: EnvOverrides,
  basePath?: string,
  visitedProviderFiles: ReadonlySet<string> = new Set(),
  loadDynamicProviders = false,
): Promise<unknown> {
  const mergedEnv =
    configEnv || providerOptions.env ? { ...configEnv, ...providerOptions.env } : undefined;
  const renderedProviderPath = renderValidationEnvTemplates(providerPath, mergedEnv);
  const renderedOptions = renderValidationEnvTemplates(providerOptions, mergedEnv);
  const configuredInputs = getConfiguredProviderInputs(renderedOptions);

  if (isProviderConfigFileReference(renderedProviderPath)) {
    if (visitedProviderFiles.has(renderedProviderPath)) {
      throw new Error('Circular provider config file reference');
    }
    const nextVisitedProviderFiles = new Set(visitedProviderFiles).add(renderedProviderPath);
    const { configs, relativePath, wasArray } = readProviderConfigFile(
      renderedProviderPath,
      basePath,
    );
    const fileContent = configs[0];
    invariant(fileContent, `Provider config file ${relativePath} contains no providers`);
    if (wasArray) {
      throw new Error(
        `Multiple providers found in ${relativePath}. Use loadApiProviders instead of loadApiProvider.`,
      );
    }
    invariant(fileContent.id, `Provider config ${relativePath} must have an id`);
    const mergedFileEnv =
      fileContent.env || mergedEnv ? { ...fileContent.env, ...mergedEnv } : undefined;
    return resolveConfiguredProviderInputs(
      fileContent.id,
      { ...fileContent, env: mergedFileEnv },
      configEnv,
      basePath,
      nextVisitedProviderFiles,
      loadDynamicProviders,
    );
  }

  if (hasOnlyDeferredValidationEnvTemplates(renderedProviderPath)) {
    if (configuredInputs !== undefined) {
      return configuredInputs;
    }
    if (!loadDynamicProviders) {
      return UNRESOLVED_PROVIDER_INPUTS;
    }
    return loadConfiguredProviderInputsForValidation(
      renderedProviderPath,
      renderedOptions,
      mergedEnv,
      basePath,
    );
  }

  if (!isCloudProvider(renderedProviderPath)) {
    for (const factory of await getProviderFactories(renderedProviderPath)) {
      if (factory.test(renderedProviderPath)) {
        if (
          configuredInputs === undefined &&
          (isJavascriptProviderFile(renderedProviderPath) ||
            renderedProviderPath.startsWith('package:'))
        ) {
          if (!loadDynamicProviders) {
            return UNRESOLVED_PROVIDER_INPUTS;
          }
          return loadConfiguredProviderInputsForValidation(
            renderedProviderPath,
            renderedOptions,
            mergedEnv,
            basePath,
          );
        }
        return configuredInputs;
      }
    }
    throw new Error(getUnknownProviderErrorMessage('[redacted]'));
  }

  const cloudDatabaseId = getCloudDatabaseId(renderedProviderPath);
  const cloudProvider = await getProviderFromCloud(cloudDatabaseId);
  const renderedCloudProviderId = renderValidationEnvTemplates(cloudProvider.id, {
    ...configEnv,
    ...cloudProvider.env,
    ...providerOptions.env,
  });
  if (isCloudProvider(renderedCloudProviderId)) {
    throw new Error('A cloud provider cannot point to another cloud provider');
  }
  const mergedCloudOptions: ProviderOptions = {
    ...cloudProvider,
    config: {
      ...cloudProvider.config,
      ...renderedOptions.config,
    },
    label: renderedOptions.label ?? cloudProvider.label,
    transform: renderedOptions.transform ?? cloudProvider.transform,
    delay: renderedOptions.delay ?? cloudProvider.delay,
    prompts: renderedOptions.prompts ?? cloudProvider.prompts,
    inputs: configuredInputs ?? getConfiguredProviderInputs(cloudProvider),
    env: { ...cloudProvider.env, ...renderedOptions.env },
  };
  return resolveConfiguredProviderInputs(
    renderedCloudProviderId,
    mergedCloudOptions,
    configEnv,
    basePath,
    visitedProviderFiles,
    loadDynamicProviders,
  );
}

const SIMPLE_ENV_TEMPLATE =
  /\{\{\s*env(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[\s*(['"])([^'"]+)\2\s*\])(?:\s*\|\s*default\(\s*(['"])([^\r\n]*?)\4\s*(?:,\s*(true|false)\s*)?\))?\s*\}\}/g;
const SIMPLE_DEFERRED_ENV_FILTER_TEMPLATE =
  /\{\{\s*env(?:\.[A-Za-z_][A-Za-z0-9_]*|\[\s*(['"])[^'"]+\1\s*\])(?:\s*\|\s*[A-Za-z_][A-Za-z0-9_]*)+\s*\}\}/g;
const NUNJUCKS_TAG = /\{[{%#]/;
const MAX_PROVIDER_VALIDATION_DEPTH = 1000;
const MAX_PROVIDER_VALIDATION_NODES = 10_000;
const PROVIDER_VALIDATION_COMPLEXITY_ERROR = 'Provider configuration is too complex to validate';
const UNRESOLVED_PROVIDER_INPUTS = Symbol('unresolved provider inputs');

export function isProviderInputMetadataUnresolved(value: unknown): boolean {
  return value === UNRESOLVED_PROVIDER_INPUTS;
}

function hasOnlyDeferredValidationEnvTemplates(value: string): boolean {
  let foundDeferredTemplate = false;
  const remaining = value.replace(SIMPLE_DEFERRED_ENV_FILTER_TEMPLATE, () => {
    foundDeferredTemplate = true;
    return '';
  });
  return foundDeferredTemplate && !NUNJUCKS_TAG.test(remaining);
}

/**
 * Render direct environment lookups and literal default filters during provider validation.
 *
 * Runtime provider loading supports the full Nunjucks language, but validation happens before
 * provider lifecycle ownership is established. Keeping this renderer deliberately small prevents
 * expressions and arbitrary filters from executing while still supporting the documented
 * {{ env.NAME }}, {{ env['NAME'] }}, and literal default(...) forms needed to locate provider
 * configs and read input metadata.
 */
function renderValidationEnvTemplates<T>(value: T, env: EnvOverrides | undefined): T {
  if (typeof value === 'string') {
    if (isConfigTemplatingDisabled()) {
      return value;
    }
    return value.replace(
      SIMPLE_ENV_TEMPLATE,
      (match, dotName, _quote, bracketName, defaultQuote, defaultValue, useFalsyDefault) => {
        const name = dotName ?? bracketName;
        const replacement =
          env && Object.prototype.hasOwnProperty.call(env, name) ? env[name] : undefined;
        if (
          defaultQuote !== undefined &&
          (replacement === undefined || (useFalsyDefault === 'true' && !replacement))
        ) {
          return defaultValue;
        }
        return replacement === undefined ? match : replacement;
      },
    ) as T;
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const createContainer = (source: object): unknown[] | Record<string, unknown> =>
    Array.isArray(source) ? [] : Object.create(null);
  const result = createContainer(value);
  const seen = new WeakMap<object, unknown>([[value, result]]);
  const pending: Array<{
    depth: number;
    source: object;
    target: unknown[] | Record<string, unknown>;
  }> = [{ depth: 0, source: value, target: result }];
  let nodeCount = 0;

  while (pending.length > 0) {
    const { depth, source, target } = pending.pop()!;
    if (depth > MAX_PROVIDER_VALIDATION_DEPTH) {
      throw new Error(PROVIDER_VALIDATION_COMPLEXITY_ERROR);
    }
    for (const [key, child] of Object.entries(source)) {
      nodeCount += 1;
      if (nodeCount > MAX_PROVIDER_VALIDATION_NODES) {
        throw new Error(PROVIDER_VALIDATION_COMPLEXITY_ERROR);
      }

      let renderedChild: unknown = child;
      if (key === '_conversation') {
        // Conversation history may contain untrusted model output. Keep it literal just like the
        // runtime provider loader instead of treating its contents as configuration templates.
        renderedChild = child;
      } else if (typeof child === 'string') {
        renderedChild = renderValidationEnvTemplates(child, env);
      } else if (child && typeof child === 'object') {
        const existing = seen.get(child);
        if (existing === undefined) {
          const childTarget = createContainer(child);
          seen.set(child, childTarget);
          renderedChild = childTarget;
          pending.push({ depth: depth + 1, source: child, target: childTarget });
        } else {
          renderedChild = existing;
        }
      }

      Object.defineProperty(target, key, {
        configurable: true,
        enumerable: true,
        value: renderedChild,
        writable: true,
      });
    }
  }
  return result as T;
}

function getValidationEnv(configEnv?: EnvOverrides): EnvOverrides {
  const baseEnv = getProcessEnvForTemplates();
  const renderedConfigEnv = configEnv
    ? renderValidationEnvTemplates(configEnv, baseEnv as EnvOverrides)
    : undefined;
  return {
    ...baseEnv,
    ...cliState.config?.env,
    ...Object.fromEntries(
      Object.entries(renderedConfigEnv ?? {}).filter(([, value]) => value !== undefined),
    ),
  } as EnvOverrides;
}

function renderProviderConfigForValidation<T extends ProviderConfig>(
  provider: T,
  env?: EnvOverrides,
): T {
  if (isApiProvider(provider) || typeof provider === 'function') {
    return provider;
  }
  return renderValidationEnvTemplates(provider, env);
}

function getProviderValidationIdentity(
  provider: ProviderConfig,
  index: number,
): { id: string; label?: string } {
  const descriptor = normalizeProviderRef(provider, { index });
  return { id: descriptor.id, label: descriptor.label };
}

function filterProviderConfigsForValidation(
  providers: ProviderConfig[],
  filter: string | undefined,
): ProviderConfig[] {
  if (!filter) {
    return providers;
  }
  const filterRegex = new RegExp(filter);
  return providers.filter((provider, index) => {
    const { id, label } = getProviderValidationIdentity(provider, index);
    return filterRegex.test(id) || (label ? filterRegex.test(label) : false);
  });
}

function getRenderedProviderConfigs(
  providerPaths: ProvidersConfig,
  env?: EnvOverrides,
): ProvidersConfig {
  if (Array.isArray(providerPaths)) {
    return providerPaths.map((provider) => renderProviderConfigForValidation(provider, env));
  }
  if (isApiProvider(providerPaths) || typeof providerPaths === 'function') {
    return providerPaths;
  }
  return renderProviderConfigForValidation(providerPaths, env);
}

/**
 * Resolves target input metadata without instantiating providers by default. Callers replacing an
 * active run or reusing cached tests may opt into loading dynamic JS/package providers; those
 * instances are cleaned up before this function returns.
 */
export async function resolveProviderInputsForValidation(
  providerPaths: ProvidersConfig,
  options: {
    basePath?: string;
    env?: EnvOverrides;
    filter?: string;
    loadDynamicProviders?: boolean;
  } = {},
): Promise<unknown[]> {
  const configEnv = getValidationEnv(options.env);
  const renderedProviderPaths = getRenderedProviderConfigs(providerPaths, configEnv);
  const resolvedProviderConfigs = resolveProviderConfigs(renderedProviderPaths, options);
  const providerConfigs = filterProviderConfigsForValidation(
    Array.isArray(resolvedProviderConfigs) ? resolvedProviderConfigs : [resolvedProviderConfigs],
    options.filter,
  );

  const results = await Promise.allSettled(
    providerConfigs.map(async (provider, index) => {
      if (isApiProvider(provider)) {
        return getConfiguredProviderInputs(provider);
      }
      if (typeof provider === 'function') {
        return getConfiguredProviderInputs(provider as ProviderFunctionWithMetadata);
      }
      if (
        provider &&
        typeof provider === 'object' &&
        Object.prototype.hasOwnProperty.call(provider, '__proto__')
      ) {
        throw new Error(`Invalid provider at index ${index}`);
      }

      const descriptor = normalizeProviderRef(provider, { index });
      switch (descriptor.kind) {
        case 'named':
          return resolveConfiguredProviderInputs(
            descriptor.loadProviderPath,
            {},
            configEnv,
            options.basePath,
            new Set(),
            options.loadDynamicProviders,
          );
        case 'options':
        case 'map':
          return resolveConfiguredProviderInputs(
            descriptor.loadProviderPath,
            descriptor.loadOptions,
            configEnv,
            options.basePath,
            new Set(),
            options.loadDynamicProviders,
          );
        case 'file':
          throw new Error(`Unresolved provider config file: ${descriptor.loadProviderPath}`);
        case 'unknown':
          throw new Error(`Invalid provider at index ${index}`);
        case 'function':
          return getConfiguredProviderInputs(provider as ProviderFunctionWithMetadata);
        default: {
          const _exhaustive: never = descriptor;
          throw new Error(`Unhandled provider kind: ${(_exhaustive as any).kind}`);
        }
      }
    }),
  );

  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (failure) {
    throw failure.reason;
  }
  return results.map((result) => (result as PromiseFulfilledResult<unknown>).value);
}

/**
 * Helper function to load providers from a file path.
 * Uses loadProviderConfigsFromFile to read configs, then instantiates them.
 */
async function loadProvidersFromFile(
  filePath: string,
  options: {
    basePath?: string;
    env?: EnvOverrides;
  } = {},
): Promise<ApiProvider[]> {
  const { basePath, env } = options;
  const configs = loadProviderConfigsFromFile(filePath, basePath);
  const relativePath = filePath.slice('file://'.length);

  return Promise.all(
    configs.map((config) => {
      invariant(config.id, `Provider config in ${relativePath} must have an id`);
      return loadApiProvider(config.id, { options: config, basePath, env });
    }),
  );
}

export async function loadApiProviders(
  providerPaths: ProvidersConfig,
  options: {
    basePath?: string;
    env?: EnvOverrides;
  } = {},
): Promise<ApiProvider[]> {
  const { basePath } = options;

  const env = {
    ...cliState.config?.env,
    ...options.env,
  };

  if (typeof providerPaths === 'string') {
    // Check if the string path points to a file
    if (isProviderConfigFileReference(providerPaths)) {
      return loadProvidersFromFile(providerPaths, { basePath, env });
    }
    return [await loadApiProvider(providerPaths, { basePath, env })];
  } else if (typeof providerPaths === 'function') {
    // Reuse `normalizeProviderRef` so a function with `.label = 'foo'` gets a
    // label-derived id here too, matching the array-element branch below.
    const descriptor = normalizeProviderRef(providerPaths);
    return [
      createProviderFromFunction(providerPaths as ProviderFunctionWithMetadata, descriptor.id),
    ];
  } else if (isApiProvider(providerPaths)) {
    return [providerPaths];
  } else if (Array.isArray(providerPaths)) {
    const providersArrays = await Promise.all(
      providerPaths.map(async (provider, idx) => {
        if (isApiProvider(provider)) {
          return [provider];
        }
        const descriptor = normalizeProviderRef(provider, { index: idx });
        switch (descriptor.kind) {
          case 'file':
            return loadProvidersFromFile(descriptor.loadProviderPath, { basePath, env });
          case 'named':
            return [await loadApiProvider(descriptor.loadProviderPath, { basePath, env })];
          case 'function':
            // Use the descriptor-derived id (which honors `.label`) instead of a
            // hardcoded `custom-function-${idx}` fallback so this branch stays
            // symmetric with the single-function branch above and with the
            // `getProviderIds` array branch below.
            return [
              createProviderFromFunction(provider as ProviderFunctionWithMetadata, descriptor.id),
            ];
          case 'options':
          case 'map':
            return [
              await loadApiProvider(descriptor.loadProviderPath, {
                options: descriptor.loadOptions,
                basePath,
                env,
              }),
            ];
          case 'unknown':
            throw new Error(
              `Invalid provider at index ${idx}: expected a provider id string, ProviderOptions with an 'id' field, or a ProviderOptionsMap (e.g. { "openai:responses:gpt-5.4": { config: ... } }). Got: ${describeInvalidProvider(provider)}`,
            );
          default: {
            const _exhaustive: never = descriptor;
            throw new Error(`Unhandled provider kind: ${(_exhaustive as any).kind}`);
          }
        }
      }),
    );
    return providersArrays.flat();
  }
  throw new Error('Invalid providers list');
}

/**
 * Reads a provider config file and returns the IDs of all providers defined in it.
 * Requires every provider entry to have an `id` field.
 */
function getProviderIdsFromFile(providerPath: string): string[] {
  const basePath = cliState.basePath || process.cwd();
  const configs = loadProviderConfigsFromFile(providerPath, basePath);
  const relativePath = providerPath.slice('file://'.length);
  return configs.map((config) => {
    invariant(config.id, `Provider config in ${relativePath} must have an id`);
    return config.id;
  });
}

/**
 * Extracts provider IDs from a provider paths configuration without instantiating providers.
 * Handles strings, functions, and arrays of mixed provider types.
 * For file:// references, reads the config file to extract IDs.
 */
export function getProviderIds(providerPaths: ProvidersConfig): string[] {
  if (typeof providerPaths === 'string') {
    if (isProviderConfigFileReference(providerPaths)) {
      return getProviderIdsFromFile(providerPaths);
    }
    return [providerPaths];
  } else if (typeof providerPaths === 'function') {
    return [normalizeProviderRef(providerPaths).id];
  } else if (isApiProvider(providerPaths)) {
    return [providerPaths.id()];
  } else if (Array.isArray(providerPaths)) {
    return providerPaths.flatMap((provider, idx) => {
      if (isApiProvider(provider)) {
        return provider.id();
      }
      const descriptor = normalizeProviderRef(provider, { index: idx });
      if (descriptor.kind === 'file') {
        return getProviderIdsFromFile(descriptor.loadProviderPath);
      }
      if (descriptor.kind === 'unknown') {
        throw new Error(
          `Invalid provider at index ${idx}: expected a provider id string, ProviderOptions with an 'id' field, or a ProviderOptionsMap. Got: ${describeInvalidProvider(provider)}`,
        );
      }
      return descriptor.id;
    });
  }
  throw new Error('Invalid providers list');
}
