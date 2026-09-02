import { describe, expect, it } from 'vitest';
import {
  describeLlamaGuardCategory,
  LLAMAGUARD_CATEGORY_DESCRIPTIONS,
  parseLlamaGuardOutput,
} from '../../src/util/llamaGuard';

describe('parseLlamaGuardOutput', () => {
  it('should parse a safe verdict', () => {
    const result = parseLlamaGuardOutput('safe');
    expect(result).toEqual({
      safe: true,
      categories: [],
      unknownCategories: [],
      raw: 'safe',
    });
  });

  it('should parse an unsafe verdict with a single category', () => {
    const result = parseLlamaGuardOutput('unsafe\nS1');
    expect(result.safe).toBe(false);
    expect(result.categories).toEqual(['S1']);
    expect(result.unknownCategories).toEqual([]);
  });

  it('should parse an unsafe verdict with multiple comma-separated categories', () => {
    const result = parseLlamaGuardOutput('unsafe\nS1,S10');
    expect(result.safe).toBe(false);
    expect(result.categories).toEqual(['S1', 'S10']);
  });

  it('should tolerate whitespace around categories and a trailing newline', () => {
    const result = parseLlamaGuardOutput('unsafe\n S1 ,  S10  \n');
    expect(result.categories).toEqual(['S1', 'S10']);
  });

  it('should preserve unrecognized category codes instead of silently dropping them', () => {
    // Forward-compat: a future LlamaGuard release could add S15+.
    const result = parseLlamaGuardOutput('unsafe\nS1,S99');
    expect(result.categories).toEqual(['S1']);
    expect(result.unknownCategories).toEqual(['S99']);
  });

  it('should treat any non-"safe" first line as unsafe, even with no second line', () => {
    // Mirrors the lenient behavior already shipped in
    // ReplicateModerationProvider.callModerationApi: a malformed or unexpected first
    // line does not throw, it just yields no categories.
    const result = parseLlamaGuardOutput('unsafe');
    expect(result.safe).toBe(false);
    expect(result.categories).toEqual([]);
  });

  it('should treat unrecognized garbled output as unsafe with no categories', () => {
    const result = parseLlamaGuardOutput('I cannot classify this content');
    expect(result.safe).toBe(false);
    expect(result.categories).toEqual([]);
    expect(result.unknownCategories).toEqual([]);
  });

  it('should trim leading/trailing whitespace on the raw output', () => {
    const result = parseLlamaGuardOutput('  safe  \n');
    expect(result.raw).toBe('safe');
    expect(result.safe).toBe(true);
  });
});

describe('describeLlamaGuardCategory', () => {
  it('should return the human-readable description for a known code', () => {
    expect(describeLlamaGuardCategory('S1')).toBe('Violent Crimes');
    expect(describeLlamaGuardCategory('S10')).toBe('Hate');
  });

  it('should include the LlamaGuard-4-only S14 category', () => {
    expect(LLAMAGUARD_CATEGORY_DESCRIPTIONS.S14).toBe('Code Interpreter Abuse');
  });

  it('should fall back to the raw code for an unknown category', () => {
    expect(describeLlamaGuardCategory('S99')).toBe('S99');
  });
});
