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
  // Only a missing policy means "no policy". Other falsy values such as null, false, 0, or ''
  // are configuration mistakes and are rejected below.
  if (policy === undefined) {
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
        throw invalidRetryPolicy();
    }
  }

  if (policy === null || typeof policy !== 'object' || Object.keys(policy).length !== 1) {
    throw invalidRetryPolicy();
  }

  if ('httpStatus' in policy) {
    if (
      !Array.isArray(policy.httpStatus) ||
      policy.httpStatus.length === 0 ||
      !policy.httpStatus.every(
        (status) => Number.isInteger(status) && status >= 100 && status <= 599,
      )
    ) {
      throw invalidRetryPolicy();
    }
    return retryPolicies.httpStatus(policy.httpStatus);
  }

  if ('any' in policy) {
    return retryPolicies.any(...resolveNestedRetryPolicies(policy.any));
  }

  if ('all' in policy) {
    return retryPolicies.all(...resolveNestedRetryPolicies(policy.all));
  }

  throw invalidRetryPolicy();
}

function resolveNestedRetryPolicies(nestedPolicies: OpenAiAgentsRetryPolicyConfig[]) {
  if (!Array.isArray(nestedPolicies) || nestedPolicies.length === 0) {
    throw invalidRetryPolicy();
  }
  // Every nested policy must resolve. Dropping an invalid one would change what `any` and
  // `all` retry on.
  return nestedPolicies.map((nestedPolicy) => {
    const resolved = resolveRetryPolicy(nestedPolicy);
    if (!resolved) {
      throw invalidRetryPolicy();
    }
    return resolved;
  });
}

function invalidRetryPolicy(): Error {
  return new Error(
    'Invalid OpenAI Agents retry policy. Use one of "never", ' +
      '"providerSuggested", "networkError", "retryAfter", { httpStatus: [...] }, ' +
      '{ any: [...] }, or { all: [...] }.',
  );
}
