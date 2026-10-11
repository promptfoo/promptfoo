import { describe, expect, it } from 'vitest';
import { isPlainObject } from './isPlainObject';

describe('isPlainObject', () => {
  it('accepts ordinary and null-prototype configuration records', () => {
    expect(isPlainObject({ url: 'https://example.com' })).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
  });
  it.each([
    null,
    undefined,
    [],
    'config',
    1,
    false,
    new Date(),
    new Map(),
    Object.create({ inherited: true }),
  ])('rejects non-record configuration values: %s', (value) => {
    expect(isPlainObject(value)).toBe(false);
  });
});
