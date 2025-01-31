import {
  categoryMapReverse,
  categoryLabels,
  categoryAliasesReverse,
  categoryAliases,
} from '../../src/redteam/constants';

describe('categoryMapReverse', () => {
  it('should create reverse mapping from riskCategories', () => {
    expect(categoryMapReverse['bola']).toBe('Security & Access Control');
    expect(categoryMapReverse['harmful:intellectual-property']).toBe('Compliance & Legal');
    expect(categoryMapReverse['harmful:child-exploitation']).toBe('Trust & Safety');
    expect(categoryMapReverse['competitors']).toBe('Brand');
  });

  it('should map all plugins to a category', () => {
    Object.keys(categoryMapReverse).forEach((plugin) => {
      expect(categoryMapReverse[plugin]).toBeDefined();
      expect(typeof categoryMapReverse[plugin]).toBe('string');
    });
  });
});

describe('categoryLabels', () => {
  it('should contain all plugin names from categoryMapReverse', () => {
    expect(categoryLabels).toEqual(Object.keys(categoryMapReverse));
  });

  it('should not be empty', () => {
    expect(categoryLabels.length).toBeGreaterThan(0);
  });
});

describe('categoryAliasesReverse', () => {
  it('should create reverse mapping from categoryAliases', () => {
    expect(categoryAliasesReverse['BOLAEnforcement']).toBe('bola');
    expect(categoryAliasesReverse['PIILeak']).toBe('pii:social');
    expect(categoryAliasesReverse['CompetitorEndorsement']).toBe('competitors');
  });

  it('should contain all values from categoryAliases as keys', () => {
    const aliasValues = Object.values(categoryAliases);
    aliasValues.forEach((value) => {
      expect(categoryAliasesReverse[value]).toBeDefined();
    });
  });

  it('should be a one-to-one mapping', () => {
    const reverseValues = Object.values(categoryAliasesReverse);
    const uniqueValues = new Set(reverseValues);
    expect(uniqueValues.size).toBe(reverseValues.length);
  });

  it('should handle all PII related aliases correctly', () => {
    expect(categoryAliasesReverse['PIILeak']).toBe('pii:social');
    expect(categoryAliases['pii']).toBe('PIILeak');
    expect(categoryAliases['pii:api-db']).toBe('PIILeak');
    expect(categoryAliases['pii:direct']).toBe('PIILeak');
    expect(categoryAliases['pii:session']).toBe('PIILeak');
  });
});
