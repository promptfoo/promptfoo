import type { AssertionParams } from '../../src/types';

export function createNumericAssertionParams(
  type: 'cost' | 'latency' | 'perplexity',
  threshold: number,
): (overrides: Partial<AssertionParams>) => AssertionParams {
  return (overrides) =>
    ({
      assertion: { type, threshold },
      baseType: type,
      assertionValueContext: {} as any,
      inverse: false,
      output: '',
      outputString: '',
      providerResponse: { output: '' },
      test: {},
      ...overrides,
    }) as AssertionParams;
}
