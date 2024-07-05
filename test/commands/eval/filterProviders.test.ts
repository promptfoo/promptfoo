import { filterProviders } from '../../../src/commands/eval/filterProviders';
import type { ApiProvider } from '../../../src/types';

describe('filterProviders', () => {
  const mockProviders: ApiProvider[] = [
    {
      id: () => 'provider1',
      label: 'Provider One',
      callApi: async () => ({ output: '' }),
    },
    {
      id: () => 'provider2',
      label: 'Provider Two',
      callApi: async () => ({ output: '' }),
    },
    {
      id: () => 'provider3',
      callApi: async () => ({ output: '' }),
    },
  ];

  it('should return all providers when no filter is provided', () => {
    const result = filterProviders(mockProviders);
    expect(result).toEqual(mockProviders);
  });

  it('should filter providers by id', () => {
    const result = filterProviders(mockProviders, 'provider1');
    expect(result).toHaveLength(1);
    expect(result[0].id()).toBe('provider1');
  });

  it('should filter providers by label', () => {
    const result = filterProviders(mockProviders, 'Two');
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Provider Two');
  });

  it('should return empty array when no providers match the filter', () => {
    const result = filterProviders(mockProviders, 'nonexistent');
    expect(result).toHaveLength(0);
  });

  it('should handle regex patterns in filter', () => {
    const result = filterProviders(mockProviders, 'provider[12]');
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.id())).toEqual(['provider1', 'provider2']);
  });

  it('should handle providers without labels', () => {
    const result = filterProviders(mockProviders, 'provider3');
    expect(result).toHaveLength(1);
    expect(result[0].id()).toBe('provider3');
  });
});
