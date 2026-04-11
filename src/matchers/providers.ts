import cliState from '../cliState';
import logger from '../logger';
import { loadApiProvider } from '../providers/index';
import { getProviderCallExecutionContext } from '../scheduler/providerCallExecutionContext';
import { createProviderRateLimitOptions, isRateLimitWrapped } from '../scheduler/providerWrapper';
import invariant from '../util/invariant';

import type {
  ApiProvider,
  CallApiContextParams,
  GradingConfig,
  ProviderOptions,
  ProviderResponse,
  ProviderType,
  ProviderTypeMap,
  TestCase,
  VarValue,
} from '../types/index';

/**
 * Helper to call provider with consistent context propagation pattern.
 * Spreads the optional context and merges with prompt label and vars.
 * Also reuses evaluator scheduler context for cancellation, rate limits,
 * and grouped grading provider calls when present.
 *
 * IMPORTANT: Spread order matters - context is spread first, then prompt/vars
 * override. This ensures originalProvider from context is preserved while
 * allowing this call to specify its own prompt metadata.
 */
export function callProviderWithContext(
  provider: ApiProvider,
  prompt: string,
  label: string,
  vars: Record<string, VarValue>,
  context?: CallApiContextParams,
): Promise<ProviderResponse> {
  const callApiContext = {
    ...context,
    prompt: {
      raw: prompt,
      label,
    },
    vars,
  };
  const executionContext = getProviderCallExecutionContext();
  const callApiOptions = executionContext?.abortSignal
    ? { abortSignal: executionContext.abortSignal }
    : undefined;
  const callApi = () =>
    callApiOptions
      ? provider.callApi(prompt, callApiContext, callApiOptions)
      : provider.callApi(prompt, callApiContext);

  const executeCall = () => {
    if (executionContext?.rateLimitRegistry && !isRateLimitWrapped(provider)) {
      return executionContext.rateLimitRegistry.execute(
        provider,
        callApi,
        createProviderRateLimitOptions(),
      );
    }

    return callApi();
  };

  if (executionContext?.providerCallQueue) {
    return executionContext.providerCallQueue.enqueue(provider.id(), executeCall);
  }

  return executeCall();
}

async function loadFromProviderOptions(provider: ProviderOptions) {
  invariant(
    typeof provider === 'object',
    `Provider must be an object, but received a ${typeof provider}: ${provider}`,
  );
  invariant(
    !Array.isArray(provider),
    `Provider must be an object, but received an array: ${JSON.stringify(provider)}`,
  );
  invariant(provider.id, 'Provider supplied to assertion must have an id');
  return loadApiProvider(provider.id, {
    options: provider as ProviderOptions,
    basePath: cliState.basePath,
  });
}

function isSimulatedUserProviderConfig(provider: GradingConfig['provider']): boolean {
  if (typeof provider === 'string') {
    return provider === 'promptfoo:simulated-user';
  }

  if (!provider || typeof provider !== 'object' || Array.isArray(provider)) {
    return false;
  }

  if (typeof (provider as ApiProvider).id === 'function') {
    return (provider as ApiProvider).id() === 'promptfoo:simulated-user';
  }

  const providerId = (provider as ProviderOptions).id;
  if (typeof providerId === 'string') {
    return providerId === 'promptfoo:simulated-user';
  }

  return Object.values(provider as ProviderTypeMap).some((providerTypeConfig) =>
    isSimulatedUserProviderConfig(providerTypeConfig),
  );
}

export async function getGradingProvider(
  type: ProviderType,
  provider: GradingConfig['provider'],
  defaultProvider: ApiProvider | null,
): Promise<ApiProvider | null> {
  let finalProvider: ApiProvider | null;
  if (typeof provider === 'string') {
    // Defined as a string
    finalProvider = await loadApiProvider(provider, { basePath: cliState.basePath });
  } else if (
    provider != null &&
    typeof provider === 'object' &&
    typeof (provider as ApiProvider).id === 'function'
  ) {
    // Defined as an ApiProvider interface
    finalProvider = provider as ApiProvider;
  } else if (provider != null && typeof provider === 'object') {
    const typeValue = (provider as ProviderTypeMap)[type];
    if (typeValue) {
      // Defined as embedding, classification, or text record
      finalProvider = await getGradingProvider(type, typeValue, defaultProvider);
    } else if ((provider as ProviderOptions).id) {
      // Defined as ProviderOptions
      finalProvider = await loadFromProviderOptions(provider as ProviderOptions);
    } else if (Array.isArray(provider)) {
      throw new Error(
        `Provider must be an object or string, but received an array.\n\nCheck that the provider ${JSON.stringify(
          provider[0],
          null,
          2,
        )} is not nested in an array.`,
      );
    } else {
      throw new Error(
        `Invalid provider definition for output type '${type}': ${JSON.stringify(
          provider,
          null,
          2,
        )}`,
      );
    }
  } else {
    // No provider specified - check defaultTest providers as fallback
    const defaultTest = cliState.config?.defaultTest;
    const defaultTestObj = typeof defaultTest === 'object' ? (defaultTest as TestCase) : null;
    const fallbackProviders = [
      defaultTestObj?.provider || undefined,
      defaultTestObj?.options?.provider?.text || undefined,
      defaultTestObj?.options?.provider || undefined,
    ];

    const cfg = fallbackProviders.find((candidateProvider) => {
      if (!candidateProvider) {
        return false;
      }

      if (isSimulatedUserProviderConfig(candidateProvider)) {
        logger.debug('[Grading] Skipping promptfoo:simulated-user as an implicit grader fallback');
        return false;
      }

      return true;
    });

    if (cfg) {
      // Recursively call getGradingProvider to handle all provider types (string, object, etc.)
      finalProvider = await getGradingProvider(type, cfg, defaultProvider);
      if (finalProvider) {
        logger.debug('[Grading] Using provider from defaultTest fallback', {
          providerId: finalProvider.id(),
        });
      }
    } else {
      finalProvider = defaultProvider;
    }
  }
  return finalProvider;
}

export async function getAndCheckProvider(
  type: ProviderType,
  provider: GradingConfig['provider'],
  defaultProvider: ApiProvider | null,
  checkName: string,
): Promise<ApiProvider> {
  const matchedProvider = await getGradingProvider(type, provider, defaultProvider);
  if (!matchedProvider) {
    if (defaultProvider) {
      logger.warn('[Grading] Falling back to default provider', {
        checkName,
        type,
      });
      return defaultProvider;
    } else {
      throw new Error(`No provider of type ${type} found for '${checkName}'`);
    }
  }

  let isValidProviderType = true;
  if (type === 'embedding') {
    isValidProviderType =
      'callEmbeddingApi' in matchedProvider || 'callSimilarityApi' in matchedProvider;
  } else if (type === 'classification') {
    isValidProviderType = 'callClassificationApi' in matchedProvider;
  } else if (type === 'moderation') {
    isValidProviderType = 'callModerationApi' in matchedProvider;
  }

  if (!isValidProviderType) {
    // If the user explicitly configured a provider that doesn't match the
    // required type, throw rather than silently falling back to a different
    // provider, which could produce results from an unintended model.
    if (provider) {
      throw new Error(
        `Provider ${matchedProvider.id()} is not a valid ${type} provider for '${checkName}'`,
      );
    }
    if (defaultProvider) {
      logger.warn('[Grading] Falling back to default provider after type check failed', {
        checkName,
        providerId: matchedProvider.id(),
        type,
      });
      return defaultProvider;
    }
    throw new Error(
      `Provider ${matchedProvider.id()} is not a valid ${type} provider for '${checkName}'`,
    );
  }

  return matchedProvider;
}
