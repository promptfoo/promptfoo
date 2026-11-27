import { describe, expect, it } from 'vitest';
import { handleBleuScore } from '../../src/assertions/bleu';
import { handleGleuScore } from '../../src/assertions/gleu';
import { handleMeteorAssertion } from '../../src/assertions/meteor';
import { getTextReference, getTextReferences } from '../../src/assertions/textReferences';

import type { AssertionParams } from '../../src/types/index';

const MESSAGE = 'bad reference';

describe('getTextReferences', () => {
  it('returns strings unchanged', () => {
    expect(getTextReferences('a b', MESSAGE)).toEqual(['a b']);
    expect(getTextReferences(['a', 'b'], MESSAGE)).toEqual(['a', 'b']);
  });

  it('converts finite numbers to their text', () => {
    expect(getTextReferences(2024, MESSAGE)).toEqual(['2024']);
    expect(getTextReferences([0, 0.5, -3], MESSAGE)).toEqual(['0', '0.5', '-3']);
    expect(getTextReferences(['42', 42], MESSAGE)).toEqual(['42', '42']);
  });

  it('keeps an empty array so callers decide how to handle it', () => {
    expect(getTextReferences([], MESSAGE)).toEqual([]);
  });

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['boolean', true],
    ['object', { a: 1 }],
    ['undefined', undefined],
    ['array with an object', ['ok', { a: 1 }]],
  ])('rejects %s', (_label, value) => {
    expect(() => getTextReferences(value as any, MESSAGE)).toThrow(MESSAGE);
  });
});

describe('getTextReference', () => {
  it('accepts a string or finite number', () => {
    expect(getTextReference('x', MESSAGE)).toBe('x');
    expect(getTextReference(7, MESSAGE)).toBe('7');
  });

  it('rejects arrays and non-finite numbers', () => {
    expect(() => getTextReference(['x'] as any, MESSAGE)).toThrow(MESSAGE);
    expect(() => getTextReference(Number.NaN, MESSAGE)).toThrow(MESSAGE);
  });
});

describe('numeric references in similarity assertions', () => {
  const params = (renderedValue: unknown, outputString: string) =>
    ({
      assertion: { type: 'placeholder', value: renderedValue },
      renderedValue,
      outputString,
      inverse: false,
    }) as unknown as AssertionParams;

  it('bleu grades a numeric reference instead of throwing', () => {
    expect(handleBleuScore(params(2024, '2024'))).toMatchObject({ pass: true, score: 1 });
    expect(handleBleuScore(params(2024, '1999')).pass).toBe(false);
  });

  it('gleu grades a numeric reference instead of throwing', () => {
    expect(handleGleuScore(params(2024, '2024'))).toMatchObject({ pass: true, score: 1 });
    expect(handleGleuScore(params([1999, 2024], '2024')).pass).toBe(true);
  });

  it('meteor grades a numeric reference instead of throwing', async () => {
    const result = await handleMeteorAssertion(params(2024, '2024'));
    expect(result.pass).toBe(true);
  });

  it('still rejects invalid references', () => {
    expect(() => handleBleuScore(params({ a: 1 }, 'x'))).toThrow(
      '"bleu" assertion type must have a string, number, or array of strings or numbers value',
    );
    expect(() => handleGleuScore(params(true, 'x'))).toThrow(
      '"gleu" assertion must have a string, number, or array of strings or numbers value',
    );
  });
});
