import { describe, expect, it } from 'vitest';
import { handleContains } from '../../src/assertions/contains';
import { handleEquals } from '../../src/assertions/equals';
import { createMockProvider, createProviderResponse } from '../factories/provider';

import type { AssertionParams, AssertionValue, AtomicTestCase } from '../../src/types/index';

// Escapes keep composed and decomposed test inputs distinct.
const NFC_CAFE = 'caf\u00e9'; // e-acute as ONE codepoint
const NFD_CAFE = 'cafe\u0301'; // e + U+0301 COMBINING ACUTE
const LIGATURE_FILE = '\ufb01le'; // U+FB01 LATIN SMALL LIGATURE FI
const NBSP_TEXT = '2\u00a0items'; // U+00A0 NO-BREAK SPACE
const X_SUPERSCRIPT_TWO = 'x\u00b2'; // x + U+00B2 SUPERSCRIPT TWO
const X_DIGIT_TWO = 'x2';

const mockProvider = createMockProvider({
  id: 'mock',
  response: createProviderResponse({ output: 'mock' }),
});

const defaultParams = {
  assertionValueContext: {
    vars: {},
    test: {} as AtomicTestCase,
    prompt: 'test prompt',
    logProbs: undefined,
    provider: mockProvider,
    providerResponse: { output: '' },
  },
  test: {} as AtomicTestCase,
  inverse: false,
};

function equalsParams(
  expected: string,
  output: string,
  normalizeUnicode?: AssertionParams['assertion']['normalizeUnicode'],
): AssertionParams {
  return {
    ...defaultParams,
    baseType: 'equals' as const,
    assertion: { type: 'equals', value: expected, normalizeUnicode },
    renderedValue: expected as AssertionValue,
    outputString: output,
    output,
    providerResponse: { output },
  } as AssertionParams;
}

function containsParams(
  expected: string,
  output: string,
  normalizeUnicode?: AssertionParams['assertion']['normalizeUnicode'],
): AssertionParams {
  return {
    ...defaultParams,
    baseType: 'contains' as const,
    assertion: { type: 'contains', value: expected, normalizeUnicode },
    renderedValue: expected as AssertionValue,
    outputString: output,
    output,
    providerResponse: { output },
  } as AssertionParams;
}

describe('handleEquals with normalizeUnicode', () => {
  it('fails a form-only difference by default', async () => {
    const result = await handleEquals(equalsParams(NFC_CAFE, NFD_CAFE));
    expect(result.pass).toBe(false);
  });

  it('passes a form-only difference when enabled', async () => {
    const result = await handleEquals(equalsParams(NFC_CAFE, NFD_CAFE, true));
    expect(result.pass).toBe(true);
  });

  it.each(['NFC', 'NFD', 'NFKC', 'NFKD'] as const)('supports the named %s form', async (form) => {
    expect((await handleEquals(equalsParams(NFC_CAFE, NFD_CAFE, form))).pass).toBe(true);
  });

  it('still fails a wrong exponent when enabled', async () => {
    const result = await handleEquals(equalsParams(X_SUPERSCRIPT_TWO, X_DIGIT_TWO, true));
    expect(result.pass).toBe(false);
  });

  it('accepts the wrong exponent only when NFKC is named explicitly', async () => {
    const result = await handleEquals(equalsParams(X_SUPERSCRIPT_TWO, X_DIGIT_TWO, 'NFKC'));
    expect(result.pass).toBe(true);
  });

  it('still fails a genuinely different value when enabled', async () => {
    const result = await handleEquals(equalsParams('$8.540', '$9.540', true));
    expect(result.pass).toBe(false);
  });

  it('respects inverse', async () => {
    const params = equalsParams(NFC_CAFE, NFD_CAFE, true);
    const result = await handleEquals({ ...params, inverse: true });
    expect(result.pass).toBe(false);
  });
});

describe('handleContains with normalizeUnicode', () => {
  it('fails a form-only difference by default', () => {
    const result = handleContains(containsParams(NFC_CAFE, `at the ${NFD_CAFE} today`));
    expect(result.pass).toBe(false);
  });

  it('passes a form-only difference when enabled', () => {
    const result = handleContains(containsParams(NFC_CAFE, `at the ${NFD_CAFE} today`, true));
    expect(result.pass).toBe(true);
  });

  it('does not match a ligature unless a compatibility form is named', () => {
    expect(handleContains(containsParams('file', LIGATURE_FILE, true)).pass).toBe(false);
    expect(handleContains(containsParams('file', LIGATURE_FILE, 'NFKC')).pass).toBe(true);
  });

  it('only folds non-breaking spaces when compatibility normalization is selected', () => {
    expect(handleContains(containsParams('2 items', NBSP_TEXT, false)).pass).toBe(false);
    expect(handleContains(containsParams('2 items', NBSP_TEXT, true)).pass).toBe(false);
    expect(handleContains(containsParams('2 items', NBSP_TEXT, 'NFKD')).pass).toBe(true);
  });

  it('normalizes the full output before matching a substring', () => {
    expect(handleContains(containsParams('e', 'e\u0301')).pass).toBe(true);
    expect(handleContains(containsParams('e', 'e\u0301', true)).pass).toBe(false);
  });

  it('negates the normalized result', () => {
    const params = containsParams(NFC_CAFE, NFD_CAFE, true);
    expect(handleContains({ ...params, inverse: true }).pass).toBe(false);
  });
});
