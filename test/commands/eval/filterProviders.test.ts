import { filterProviders } from '../../../src/commands/eval/filterProviders';
import type { ApiProvider } from '../../../src/types';

describe('filterProviders', () => {
  const mockProviders: ApiProvider[] = [
    {
      id: () => 'openai:gpt-4',
      label: 'GPT-4',
      callApi: async () => ({ output: '' }),
    },
    {
      id: () => 'openai:gpt-3.5-turbo',
      label: 'GPT-3.5',
      callApi: async () => ({ output: '' }),
    },
    {
      id: () => 'anthropic:claude-2',
      label: 'Claude',
      callApi: async () => ({ output: '' }),
    },
    {
      id: () => 'custom:provider',
      callApi: async () => ({ output: '' }),
      // No label
    },
  ];

  it('should return all providers if no filter is provided', () => {
    const result = filterProviders(mockProviders);
    expect(result).toEqual(mockProviders);
  });

  it('should filter providers by ID', () => {
    const result = filterProviders(mockProviders, 'openai');
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.id())).toEqual(['openai:gpt-4', 'openai:gpt-3.5-turbo']);
  });

  it('should filter providers by label', () => {
    const result = filterProviders(mockProviders, 'GPT');
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.label)).toEqual(['GPT-4', 'GPT-3.5']);
  });

  it('should handle providers without labels', () => {
    const result = filterProviders(mockProviders, 'custom');
    expect(result).toHaveLength(1);
    expect(result[0].id()).toBe('custom:provider');
  });

  it('should handle regex patterns', () => {
    const result = filterProviders(mockProviders, '(gpt|claude)');
    expect(result).toHaveLength(3);
    expect(result.map((p) => p.id())).toEqual([
      'openai:gpt-4',
      'openai:gpt-3.5-turbo',
      'anthropic:claude-2',
    ]);
  });

  it('should return empty array if no providers match filter', () => {
    const result = filterProviders(mockProviders, 'nonexistent');
    expect(result).toHaveLength(0);
  });

  it('should handle case sensitivity', () => {
    const result = filterProviders(mockProviders, 'GPT');
    expect(result).toHaveLength(2);
  });
});
