import { describe, expect, it } from 'vitest';
import { resolveModelSettings } from '../../../src/providers/openai/agents-model-settings';

import type { OpenAiAgentsRetryPolicyConfig } from '../../../src/providers/openai/agents-types';

function resolvePolicy(policy: unknown) {
  return resolveModelSettings({
    retry: { maxRetries: 2, policy: policy as OpenAiAgentsRetryPolicyConfig },
  })?.retry?.policy;
}

describe('resolveModelSettings retry policies', () => {
  it.each([
    'never',
    'providerSuggested',
    'networkError',
    'retryAfter',
    { httpStatus: [429, 503] },
    { any: ['providerSuggested', { httpStatus: [429] }] },
    { all: ['networkError', { any: ['retryAfter', 'providerSuggested'] }] },
  ])('resolves %j', (policy) => {
    expect(typeof resolvePolicy(policy)).toBe('function');
  });

  it('leaves the policy unset when none is configured', () => {
    expect(resolvePolicy(undefined)).toBeUndefined();
  });

  it('rejects an unknown preset name instead of silently dropping it', () => {
    expect(() => resolvePolicy('provider-suggested')).toThrow('Invalid OpenAI Agents retry policy');
  });

  it('rejects an invalid nested policy instead of dropping it from all', () => {
    expect(() => resolvePolicy({ all: [{ httpStatus: [429] }, 'networkErrors'] })).toThrow(
      'Invalid OpenAI Agents retry policy',
    );
  });

  it.each([
    { any: [] },
    { all: 'never' },
    { httpStatus: [] },
    { httpStatus: 429 },
    { retryOn: [429] },
    { any: [null] },
    { httpStatus: ['429'] },
    { httpStatus: [null] },
    { httpStatus: [429.5] },
    { httpStatus: [42] },
    { any: ['networkError'], all: ['never'] },
    { httpStatus: [429], typo: true },
    { any: [{ all: ['never'], extra: 'ignored' }] },
    null,
    false,
    0,
    '',
  ])('rejects malformed policy %j', (policy) => {
    expect(() => resolvePolicy(policy)).toThrow('Invalid OpenAI Agents retry policy');
  });

  it.each(['fixture-secret', { apiKey: 'fixture-secret' }])(
    'does not include raw configuration values in errors',
    (policy) => {
      expect(() => resolvePolicy(policy)).toThrow('Invalid OpenAI Agents retry policy');
      expect(() => resolvePolicy(policy)).not.toThrow('fixture-secret');
    },
  );
});
