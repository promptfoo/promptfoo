import { describe, expect, it } from 'vitest';
import { NunjucksFilterMapSchema } from '../../src/validators/shared';

describe('NunjucksFilterMapSchema', () => {
  it('should accept empty object', () => {
    const result = NunjucksFilterMapSchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data).toEqual({});
  });

  it('should accept valid filter map with functions', () => {
    const input = {
      uppercase: (val: unknown) => String(val).toUpperCase(),
      lowercase: (val: unknown) => String(val).toLowerCase(),
    };
    const result = NunjucksFilterMapSchema.safeParse(input);
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('uppercase');
    expect(result.data).toHaveProperty('lowercase');
  });

  it('should accept single filter', () => {
    const input = {
      trim: (val: unknown) => String(val).trim(),
    };
    const result = NunjucksFilterMapSchema.safeParse(input);
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('trim');
  });

  it('should reject non-function values', () => {
    const result = NunjucksFilterMapSchema.safeParse({
      notAFunction: 'string-value',
    });
    expect(result.success).toBe(false);
  });

  it('should reject number values', () => {
    const result = NunjucksFilterMapSchema.safeParse({
      badFilter: 42,
    });
    expect(result.success).toBe(false);
  });

  it('should reject null values', () => {
    const result = NunjucksFilterMapSchema.safeParse({
      nullFilter: null,
    });
    expect(result.success).toBe(false);
  });

  it('should reject boolean values', () => {
    const result = NunjucksFilterMapSchema.safeParse({
      boolFilter: true,
    });
    expect(result.success).toBe(false);
  });

  it('should accept functions with multiple arguments', () => {
    const input = {
      replace: (val: unknown, search: unknown, replacement: unknown) =>
        String(val).replace(String(search), String(replacement)),
    };
    const result = NunjucksFilterMapSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject non-object input', () => {
    expect(NunjucksFilterMapSchema.safeParse('not-an-object').success).toBe(false);
    expect(NunjucksFilterMapSchema.safeParse(42).success).toBe(false);
    expect(NunjucksFilterMapSchema.safeParse(null).success).toBe(false);
    expect(NunjucksFilterMapSchema.safeParse(undefined).success).toBe(false);
  });

  it('should reject array input', () => {
    const result = NunjucksFilterMapSchema.safeParse([() => 'test']);
    expect(result.success).toBe(false);
  });

  it('should accept mix of valid function filters', () => {
    const input = {
      first: () => 'a',
      second: (_a: unknown, _b: unknown) => 'b',
      third: (..._args: unknown[]) => 'c',
    };
    const result = NunjucksFilterMapSchema.safeParse(input);
    expect(result.success).toBe(true);
    expect(Object.keys(result.data!)).toHaveLength(3);
  });
});
