import { describe, expect, it } from 'vitest';
import { handleContains } from '../../src/assertions/contains';
import { handleEquals } from '../../src/assertions/equals';
import { normalizeForComparison } from '../../src/assertions/normalize';
import { createMockProvider, createProviderResponse } from '../factories/provider';

import type { AssertionParams, AssertionValue, AtomicTestCase } from '../../src/types/index';

// Fixtures are CONSTRUCTED, never written as literals.
//
// Every tool between a keyboard and a disk is entitled to normalize a source
// file: editors on save, formatters, git filters, the browser an example was
// copied from. A test whose subject is invisible codepoint differences cannot
// survive that. Writing the decomposed form as a literal and trusting it to
// stay decomposed is how this file silently stopped testing anything.
// Written as escapes so the file is pure ASCII on disk and no tool downstream
// can quietly rewrite the very characters under test. Editing this block in a
// normalising editor is how it broke the first time.
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

describe('the fixtures themselves', () => {
  // The precondition of every test below. If the pair does not genuinely differ
  // there is nothing to detect, and the suite would pass while proving nothing.
  it('holds pairs that really do differ in codepoints', () => {
    expect(NFC_CAFE).not.toBe(NFD_CAFE);
    expect(LIGATURE_FILE).not.toBe('file');
    expect(X_SUPERSCRIPT_TWO).not.toBe(X_DIGIT_TWO);
  });

  it('holds pairs that really do look the same', () => {
    expect(NFC_CAFE.normalize('NFC')).toBe(NFD_CAFE.normalize('NFC'));
  });
});

describe('normalizeForComparison', () => {
  it('leaves text untouched when the option is absent or false', () => {
    expect(normalizeForComparison(NFD_CAFE)).toBe(NFD_CAFE);
    expect(normalizeForComparison(NFD_CAFE, false)).toBe(NFD_CAFE);
  });

  it('treats `true` as NFC, not NFKC', () => {
    // The distinction this whole module turns on. NFC folds the accent; it must
    // NOT fold a superscript two into a digit two.
    expect(normalizeForComparison(NFC_CAFE, true)).toBe(normalizeForComparison(NFD_CAFE, true));
    expect(normalizeForComparison(X_SUPERSCRIPT_TWO, true)).not.toBe(
      normalizeForComparison(X_DIGIT_TWO, true),
    );
    expect(normalizeForComparison(LIGATURE_FILE, true)).not.toBe('file');
  });

  it('applies a compatibility form when one is named', () => {
    expect(normalizeForComparison(LIGATURE_FILE, 'NFKC')).toBe('file');
    expect(normalizeForComparison(NBSP_TEXT, 'NFKC')).toBe('2 items');
  });

  it('never relaxes wording, under any form', () => {
    for (const form of [true, 'NFC', 'NFD', 'NFKC', 'NFKD'] as const) {
      expect(normalizeForComparison('$8.540', form)).not.toBe(
        normalizeForComparison('$9.540', form),
      );
      expect(normalizeForComparison('Paris', form)).not.toBe(normalizeForComparison('paris', form));
    }
  });
});

// These go through the assertion handlers rather than the helper. Testing only
// `normalizeForComparison` would leave the suite green if the wiring in either
// handler were reverted, which is to say it would not test the feature at all.
describe('handleEquals with normalizeUnicode', () => {
  it('fails a form-only difference by default', async () => {
    const result = await handleEquals(equalsParams(NFC_CAFE, NFD_CAFE));
    expect(result.pass).toBe(false);
  });

  it('passes a form-only difference when enabled', async () => {
    const result = await handleEquals(equalsParams(NFC_CAFE, NFD_CAFE, true));
    expect(result.pass).toBe(true);
  });

  it('still fails a wrong exponent when enabled', async () => {
    // The failure that decided the default. Under NFKC this passes, which would
    // mean an assertion library scoring a wrong answer as correct.
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
});
