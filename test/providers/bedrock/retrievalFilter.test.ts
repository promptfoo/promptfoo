import { describe, expect, it } from 'vitest';
import { isValidBedrockRetrievalFilter } from '../../../src/providers/bedrock/retrievalFilter';

const tenant = { equals: { key: 'tenant', value: 'fixture' } };

describe('Bedrock retrieval filter validation', () => {
  it.each([
    'equals',
    'notEquals',
    'greaterThan',
    'greaterThanOrEquals',
    'lessThan',
    'lessThanOrEquals',
    'in',
    'notIn',
    'startsWith',
    'listContains',
    'stringContains',
  ])('accepts the native %s operator without dropping its restriction', (operator) => {
    expect(isValidBedrockRetrievalFilter({ [operator]: { key: 'tenant', value: 'fixture' } })).toBe(
      true,
    );
  });

  it.each(['andAll', 'orAll'])('validates every nested restriction under %s', (operator) => {
    expect(
      isValidBedrockRetrievalFilter({ [operator]: [tenant, { orAll: [tenant, tenant] }] }),
    ).toBe(true);
    expect(
      isValidBedrockRetrievalFilter({ [operator]: [tenant, { tenant: 'unrecognized' }] }),
    ).toBe(false);
    expect(isValidBedrockRetrievalFilter({ [operator]: [tenant] })).toBe(false);
    expect(isValidBedrockRetrievalFilter({ [operator]: tenant })).toBe(false);
  });

  it.each([
    null,
    undefined,
    [],
    'tenant',
    {},
    { equals: undefined },
    { equals: tenant.equals, notEquals: tenant.equals },
    { tenant: 'fixture' },
    { equals: null },
    { equals: [] },
    { equals: 'tenant' },
    { equals: { key: 1, value: 'fixture' } },
    { equals: { key: 'tenant' } },
  ])('rejects malformed filters before AWS serialization: %j', (filter) => {
    expect(isValidBedrockRetrievalFilter(filter)).toBe(false);
  });

  it('preserves false and zero document values and ignores absent optional union members', () => {
    expect(
      isValidBedrockRetrievalFilter({
        equals: { key: 'active', value: false },
        notEquals: undefined,
      }),
    ).toBe(true);
    expect(isValidBedrockRetrievalFilter({ equals: { key: 'count', value: 0 } })).toBe(true);
  });

  it('accepts only a complete SDK unknown-union tuple', () => {
    expect(
      isValidBedrockRetrievalFilter({
        $unknown: ['futureFilter', { key: 'tenant', value: 'fixture' }],
      }),
    ).toBe(true);
    for (const operand of [null, {}, [], ['futureFilter'], [1, {}], ['futureFilter', undefined]]) {
      expect(isValidBedrockRetrievalFilter({ $unknown: operand })).toBe(false);
    }
  });
});
