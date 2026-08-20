import { describe, expect, it } from 'vitest';
import { TEXT_MUTATION_STRATEGIES } from '../../../src/redteam/constants/strategies';
import { addTextMutation, mutateText } from '../../../src/redteam/strategies/textMutation';

import type { TestCaseWithPlugin } from '../../../src/types/index';

describe('text mutation strategies', () => {
  it.each(TEXT_MUTATION_STRATEGIES)('mutates eligible input with %s', (strategy) => {
    const output = mutateText('Alpha beta 123', strategy, {
      intensity: 3,
      rate: 1,
      seed: 'test-seed',
    });

    expect(output).not.toBe('Alpha beta 123');
  });

  it('is deterministic for a seed and varies across seeds', () => {
    const input = 'deterministic unicode mutation sample';
    const first = mutateText(input, 'unicode-noise', { rate: 1, seed: 'alpha' });
    const repeated = mutateText(input, 'unicode-noise', { rate: 1, seed: 'alpha' });
    const second = mutateText(input, 'unicode-noise', { rate: 1, seed: 'beta' });

    expect(first).toBe(repeated);
    expect(first).not.toBe(second);
  });

  it('inserts only removable format characters for zero-width', () => {
    const input = 'abc 123';
    const output = mutateText(input, 'zero-width', { rate: 1, seed: 7 });

    expect(output).toMatch(/\p{Cf}/u);
    expect(output.replace(/\p{Cf}/gu, '')).toBe(input);
  });

  it('adds one removable combining mark per selected character for unicode-noise', () => {
    const input = 'ab 12';
    const output = mutateText(input, 'unicode-noise', { rate: 1, seed: 7 });

    expect(output.match(/\p{M}/gu)).toHaveLength(4);
    expect(output.replace(/\p{M}/gu, '')).toBe(input);
  });

  it('respects Zalgo intensity bounds', () => {
    const input = 'ab';
    const output = mutateText(input, 'zalgo', { intensity: 5, rate: 1, seed: 7 });

    expect(output.match(/\p{M}/gu)).toHaveLength(10);
    expect(output.replace(/\p{M}/gu, '')).toBe(input);
  });

  it('replaces whitespace without changing non-whitespace text', () => {
    const input = 'one two\tthree';
    const output = mutateText(input, 'whitespace-obfuscation', {
      rate: 1,
      seed: 7,
    });

    expect(output).not.toBe(input);
    expect(output.replace(/[\p{Z}\t\f\v]/gu, ' ')).toBe('one two three');
  });

  it('changes case without changing letters or punctuation', () => {
    const input = 'PromptFoo 123!';
    const output = mutateText(input, 'random-case', { rate: 1, seed: 7 });

    expect(output).not.toBe(input);
    expect(output.toLowerCase()).toBe(input.toLowerCase());
  });

  it.each(TEXT_MUTATION_STRATEGIES)('supports an explicit zero rate for %s', (strategy) => {
    expect(mutateText('Alpha beta 123', strategy, { rate: 0 })).toBe('Alpha beta 123');
  });

  it.each(TEXT_MUTATION_STRATEGIES)(
    'changes at least one eligible character at a positive rate for %s',
    (strategy) => {
      expect(mutateText('Alpha beta 123', strategy, { rate: Number.MIN_VALUE })).not.toBe(
        'Alpha beta 123',
      );
    },
  );

  it('preserves newline boundaries while replacing horizontal whitespace', () => {
    const output = mutateText('first line\r\nsecond line\nthird line', 'whitespace-obfuscation', {
      rate: 1,
    });

    expect(output.match(/\r?\n/g)).toEqual(['\r\n', '\n']);
  });

  it('leaves input unchanged when no eligible characters exist', () => {
    expect(mutateText('!@#', 'zero-width', { rate: 1 })).toBe('!@#');
    expect(mutateText('---', 'random-case', { rate: 1 })).toBe('---');
  });

  it('rejects invalid configuration', () => {
    expect(() => mutateText('test', 'zero-width', { rate: -0.1 })).toThrow(/rate/);
    expect(() => mutateText('test', 'unicode-noise', { rate: 1.1 })).toThrow(/rate/);
    expect(() => mutateText('test', 'zalgo', { intensity: 0 })).toThrow(/intensity/);
    expect(() => mutateText('test', 'zalgo', { intensity: 9 })).toThrow(/intensity/);
    expect(() => mutateText('test', 'random-case', { seed: {} })).toThrow(/seed/);
    expect(() => mutateText('test', 'random-case', { seed: Number.NaN })).toThrow(/seed/);
  });

  it('preserves test case fields and records provenance metadata', () => {
    const testCase: TestCaseWithPlugin = {
      vars: { prompt: 'Alpha beta', untouched: 'value' },
      metadata: { pluginId: 'harmful:test', existing: true },
      assert: [{ type: 'contains', value: 'x', metric: 'Safety' }, { type: 'is-json' }],
      description: 'original description',
    };

    const [result] = addTextMutation([testCase], 'prompt', 'zero-width', {
      rate: 1,
      seed: 'stable',
    });

    expect(result.description).toBe('original description');
    expect(result.vars?.untouched).toBe('value');
    expect(result.vars?.prompt).not.toBe('Alpha beta');
    expect(result.metadata).toMatchObject({
      pluginId: 'harmful:test',
      existing: true,
      originalText: 'Alpha beta',
      strategyId: 'zero-width',
    });
    expect(result.assert).toEqual([
      { type: 'contains', value: 'x', metric: 'Safety/ZeroWidth' },
      { type: 'is-json' },
    ]);
  });
});
