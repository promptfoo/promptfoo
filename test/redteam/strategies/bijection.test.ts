import { describe, expect, it } from 'vitest';
import {
  addBijectionTestCases,
  buildBijectionPrompt,
  encodeBijection,
  generateBijectionMapping,
  resolveBijectionOptions,
} from '../../../src/redteam/strategies/bijection';

import type { TestCaseWithPlugin } from '../../../src/types/index';

describe('bijection strategy', () => {
  it('generates a deterministic letter permutation with exact dispersion', () => {
    const options = { type: 'letter' as const, dispersion: 16, encodingLength: 2 };
    const first = generateBijectionMapping(options, 'seed-a');
    const repeated = generateBijectionMapping(options, 'seed-a');
    const second = generateBijectionMapping(options, 'seed-b');

    expect(first).toEqual(repeated);
    expect(first).not.toEqual(second);
    expect(Object.entries(first).filter(([plain, encoded]) => plain !== encoded)).toHaveLength(16);
    expect(new Set(Object.values(first)).size).toBe(26);
  });

  it('generates unique fixed-width digit codewords for selected letters', () => {
    const mapping = generateBijectionMapping(
      { type: 'digit', dispersion: 20, encodingLength: 3 },
      'digits',
    );
    const numericValues = Object.values(mapping).filter((value) => /^\d+$/.test(value));

    expect(numericValues).toHaveLength(20);
    expect(numericValues.every((value) => value.length === 3)).toBe(true);
    expect(new Set(Object.values(mapping)).size).toBe(26);
  });

  it('supports one changed letter for digit mappings', () => {
    const mapping = generateBijectionMapping(
      { type: 'digit', dispersion: 1, encodingLength: 2 },
      'single-digit',
    );

    expect(Object.entries(mapping).filter(([plain, encoded]) => plain !== encoded)).toHaveLength(1);
  });

  it('encodes letters case-insensitively and preserves other characters', () => {
    const mapping = Object.fromEntries('abcdefghijklmnopqrstuvwxyz'.split('').map((c) => [c, c]));
    mapping.a = 'b';
    mapping.b = 'a';

    expect(encodeBijection('A bad cab. 42', mapping)).toBe('b abd cba. 42');
    expect(encodeBijection('A 😀 café', mapping)).toBe('b 😀 cbfé');
  });

  it('supports fixed-width digit codewords', () => {
    const mapping = Object.fromEntries('abcdefghijklmnopqrstuvwxyz'.split('').map((c) => [c, c]));
    mapping.a = '01';
    mapping.b = '02';

    expect(encodeBijection('A b2', mapping)).toBe('01 022');
  });

  it('builds an original instruction prompt with optional harmless examples', () => {
    const mapping = generateBijectionMapping(
      { type: 'letter', dispersion: 16, encodingLength: 2 },
      'prompt',
    );
    const encoded = encodeBijection('test request', mapping);
    const withExamples = buildBijectionPrompt(encoded, mapping, true);
    const withoutExamples = buildBijectionPrompt(encoded, mapping, false);

    expect(withExamples).toContain('Substitution table:');
    expect(withExamples).toContain('Practice translations:');
    expect(withExamples).toContain('answer its meaning directly in ordinary English');
    expect(withExamples).toContain(encoded);
    expect(withoutExamples).not.toContain('Practice translations:');
  });

  it('uses safe defaults and rejects invalid options', () => {
    expect(resolveBijectionOptions()).toEqual({
      type: 'letter',
      dispersion: 16,
      encodingLength: 2,
      includeExamples: true,
      n: 1,
      seed: 'promptfoo',
    });

    expect(() => resolveBijectionOptions({ type: 'bytes' })).toThrow(/type/);
    expect(() => resolveBijectionOptions({ dispersion: 27 })).toThrow(/dispersion/);
    expect(() => resolveBijectionOptions({ dispersion: 1, type: 'letter' })).toThrow(
      /dispersion 1/,
    );
    expect(() => resolveBijectionOptions({ encodingLength: 1 })).toThrow(/encodingLength/);
    expect(() => resolveBijectionOptions({ includeExamples: 'yes' })).toThrow(/includeExamples/);
    expect(() => resolveBijectionOptions({ n: 21 })).toThrow(/n/);
    expect(() => resolveBijectionOptions({ seed: {} })).toThrow(/seed/);
    expect(() => resolveBijectionOptions({ seed: Number.POSITIVE_INFINITY })).toThrow(/seed/);
    expect(() =>
      generateBijectionMapping({ type: 'letter', dispersion: 1, encodingLength: 2 }, 'invalid'),
    ).toThrow(/dispersion 1/);
  });

  it('fans out variants and preserves grading metadata', () => {
    const testCase: TestCaseWithPlugin = {
      vars: { prompt: 'test request', untouched: 'value' },
      metadata: { pluginId: 'harmful:test', existing: true },
      assert: [{ type: 'contains', value: 'x', metric: 'Safety' }],
    };

    const results = addBijectionTestCases([testCase], 'prompt', {
      n: 3,
      seed: 'fanout',
      type: 'digit',
    });

    expect(results).toHaveLength(3);
    expect(new Set(results.map((result) => result.vars?.prompt)).size).toBe(3);
    for (const [variant, result] of results.entries()) {
      expect(result.vars?.untouched).toBe('value');
      expect(result.provider).toBeUndefined();
      expect(result.metadata).toMatchObject({
        pluginId: 'harmful:test',
        existing: true,
        originalText: 'test request',
        strategyId: 'bijection',
        bijection: {
          type: 'digit',
          dispersion: 16,
          encodingLength: 2,
          seed: 'fanout',
          variant,
        },
      });
      expect(result.assert?.[0].metric).toBe('Safety/Bijection');
    }
  });
});
