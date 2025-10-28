import { renderHook } from '@testing-library/react';
import type { PolicyObject, RedteamPluginObject } from '@promptfoo/redteam/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeDefaultPolicyName, makeInlinePolicyId } from '@promptfoo/redteam/plugins/policy/utils';
import { useCustomPoliciesMap } from './useCustomPoliciesMap';

describe('useCustomPoliciesMap', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a map of reusable policies from policy plugins and ignores others', () => {
    const reusablePolicy: PolicyObject = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      text: 'Reusable policy text',
      name: 'Reusable Policy',
    };

    const plugins: RedteamPluginObject[] = [
      { id: 'policy', config: {} },
      { id: 'not-policy', config: { policy: reusablePolicy } },
      { id: 'policy', config: { policy: reusablePolicy } },
    ];

    const { result } = renderHook(() => useCustomPoliciesMap(plugins));

    expect(result.current).toEqual({
      [reusablePolicy.id]: reusablePolicy,
    });
  });

  it('converts inline policy strings into policy objects with generated metadata', () => {
    const reusablePolicy: PolicyObject = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      text: 'Existing policy text',
      name: 'Existing Policy',
    };

    const inlinePolicyText = 'Inline policy text';

    const inlinePolicyId = makeInlinePolicyId(inlinePolicyText);
    const inlinePolicyName = makeDefaultPolicyName(1);

    const plugins: RedteamPluginObject[] = [
      { id: 'policy', config: { policy: reusablePolicy } },
      { id: 'policy', config: { policy: inlinePolicyText } },
    ];

    const { result } = renderHook(() => useCustomPoliciesMap(plugins));

    expect(result.current).toEqual({
      [reusablePolicy.id]: reusablePolicy,
      [inlinePolicyId]: {
        id: inlinePolicyId,
        text: inlinePolicyText,
        name: inlinePolicyName,
      },
    });
  });
});
