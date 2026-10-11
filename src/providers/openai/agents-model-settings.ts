import { retryPolicies } from '@openai/agents';
import type { ModelSettings } from '@openai/agents';

import type { OpenAiAgentsModelSettings, OpenAiAgentsRetryPolicyConfig } from './agents-types';

export function resolveModelSettings(
  modelSettings?: OpenAiAgentsModelSettings,
): ModelSettings | undefined {
  if (!modelSettings) {
    return undefined;
  }

  const retry = modelSettings.retry
    ? {
        ...modelSettings.retry,
        policy: resolveRetryPolicy(modelSettings.retry.policy),
      }
    : undefined;

  return {
    ...modelSettings,
    retry,
  };
}

function resolveRetryPolicy(
  policy: OpenAiAgentsRetryPolicyConfig | undefined,
): ModelSettings['retry'] extends infer TRetry
  ? TRetry extends { policy?: infer TPolicy }
    ? TPolicy | undefined
    : undefined
  : undefined {
  if (!policy) {
    return undefined;
  }

  if (typeof policy === 'function') {
    return policy;
  }

  if (typeof policy === 'string') {
    switch (policy) {
      case 'never':
        return retryPolicies.never();
      case 'providerSuggested':
        return retryPolicies.providerSuggested();
      case 'networkError':
        return retryPolicies.networkError();
      case 'retryAfter':
        return retryPolicies.retryAfter();
      default:
        throw invalidRetryPolicy(policy);
    }
  }

  if (typeof policy === 'object' && 'httpStatus' in policy) {
    if (!Array.isArray(policy.httpStatus) || policy.httpStatus.length === 0) {
      throw invalidRetryPolicy(policy);
    }
    return retryPolicies.httpStatus(policy.httpStatus);
  }

  if (typeof policy === 'object' && 'any' in policy) {
    return retryPolicies.any(...resolveNestedRetryPolicies(policy, policy.any));
  }

  if (typeof policy === 'object' && 'all' in policy) {
    return retryPolicies.all(...resolveNestedRetryPolicies(policy, policy.all));
  }

  throw invalidRetryPolicy(policy);
}

function resolveNestedRetryPolicies(
  policy: OpenAiAgentsRetryPolicyConfig,
  nestedPolicies: OpenAiAgentsRetryPolicyConfig[],
) {
  if (!Array.isArray(nestedPolicies) || nestedPolicies.length === 0) {
    throw invalidRetryPolicy(policy);
  }
  // Every nested policy must resolve. Dropping an invalid one would change what `any` and
  // `all` retry on.
  return nestedPolicies.map((nestedPolicy) => {
    const resolved = resolveRetryPolicy(nestedPolicy);
    if (!resolved) {
      throw invalidRetryPolicy(nestedPolicy);
    }
    return resolved;
  });
}

function invalidRetryPolicy(policy: unknown): Error {
  return new Error(
    `Invalid OpenAI Agents retry policy ${JSON.stringify(policy)}. Use one of "never", ` +
      '"providerSuggested", "networkError", "retryAfter", { httpStatus: [...] }, ' +
      '{ any: [...] }, or { all: [...] }.',
  );
}
