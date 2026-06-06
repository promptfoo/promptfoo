import { describe, expect, it } from 'vitest';
import { handleEquals } from '../../src/assertions/equals';
import { createMockProvider, createProviderResponse } from '../factories/provider';

import type { AssertionParams, AssertionValue, AtomicTestCase } from '../../src/types/index';

const mockProvider = createMockProvider({
  id: 'mock',
  response: createProviderResponse({ output: 'mock' }),
});

const defaultParams = {
  baseType: 'equals' as const,
  assertionValueContext: {
    vars: {},
    test: {} as AtomicTestCase,
    prompt: 'test prompt',
    logProbs: undefined,
    provider: mockProvider,
    providerResponse: { output: 'hello world' },
  },
  output: 'hello world',
  providerResponse: { output: 'hello world' },
  test: {} as AtomicTestCase,
};

describe('handleEquals', () => {
  it('passes not-equals when an object value cannot equal non-JSON output', async () => {
    // The output is plain text (not JSON), so it plainly does NOT equal the object value;
    // a `not-equals` assertion should therefore pass. The catch path used to ignore `inverse`.
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'not-equals', value: { foo: 'bar' } },
      renderedValue: { foo: 'bar' } as AssertionValue,
      outputString: 'hello world',
      inverse: true,
    };

    const result = await handleEquals(params);
    expect(result.pass).toBe(true);
  });

  it('fails equals when an object value cannot equal non-JSON output', async () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'equals', value: { foo: 'bar' } },
      renderedValue: { foo: 'bar' } as AssertionValue,
      outputString: 'hello world',
      inverse: false,
    };

    const result = await handleEquals(params);
    expect(result.pass).toBe(false);
  });
});
