import { describe, expect, it } from 'vitest';
import { isUuid } from '../../src/util/uuid';

describe('isUuid', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('accepts UUID version %i', (version) => {
    expect(isUuid(`550e8400-e29b-${version}1d4-a716-446655440000`)).toBe(true);
  });

  it.each(['8', '9', 'a', 'b'])('accepts UUID variant %s', (variant) => {
    expect(isUuid(`550e8400-e29b-71d4-${variant}716-446655440000`)).toBe(true);
  });

  it('accepts uppercase hex digits', () => {
    expect(isUuid('550E8400-E29B-71D4-A716-446655440000')).toBe(true);
  });

  it.each([
    '550e8400-e29b-01d4-a716-446655440000',
    '550e8400-e29b-91d4-a716-446655440000',
    '550e8400-e29b-71d4-7716-446655440000',
    '550e8400-e29b-71d4-c716-446655440000',
    '550e8400e29b71d4a716446655440000',
    'not-a-uuid',
    '',
  ])('rejects invalid UUID: %s', (value) => {
    expect(isUuid(value)).toBe(false);
  });
});
