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
        return undefined;
    }
  }

  if ('httpStatus' in policy) {
    return retryPolicies.httpStatus(policy.httpStatus);
  }

  if ('any' in policy) {
    const policies = policy.any
      .map((nestedPolicy) => resolveRetryPolicy(nestedPolicy))
      .filter((nestedPolicy): nestedPolicy is NonNullable<typeof nestedPolicy> => !!nestedPolicy);

    return policies.length ? retryPolicies.any(...policies) : undefined;
  }

  if ('all' in policy) {
    const policies = policy.all
      .map((nestedPolicy) => resolveRetryPolicy(nestedPolicy))
      .filter((nestedPolicy): nestedPolicy is NonNullable<typeof nestedPolicy> => !!nestedPolicy);

    return policies.length ? retryPolicies.all(...policies) : undefined;
  }

  return undefined;
}
