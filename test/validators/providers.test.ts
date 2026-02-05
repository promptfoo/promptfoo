import { describe, expect, it, vi } from 'vitest';
import { ProviderOptionsSchema, ProviderSchema } from '../../src/validators/providers';

describe('ProviderOptionsSchema', () => {
  it('should filter unknown keys without erroring', () => {
    const input = {
      id: 'test-provider',
      label: 'Test Provider',
      unknownField: 'this should be filtered',
      anotherUnknown: 123,
    };

    const result = ProviderOptionsSchema.safeParse(input);

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('id', 'test-provider');
    expect(result.data).toHaveProperty('label', 'Test Provider');
    expect(result.data).not.toHaveProperty('unknownField');
    expect(result.data).not.toHaveProperty('anotherUnknown');
  });

  it('should accept valid provider options', () => {
    const input = {
      id: 'test-provider',
      label: 'Test Provider',
      config: { temperature: 0.7 },
      prompts: ['prompt1', 'prompt2'],
      transform: 'output.toLowerCase()',
      delay: 1000,
    };

    const result = ProviderOptionsSchema.safeParse(input);

    expect(result.success).toBe(true);
    expect(result.data).toEqual(input);
  });

  it('should accept empty object', () => {
    const result = ProviderOptionsSchema.safeParse({});

    expect(result.success).toBe(true);
    expect(result.data).toEqual({});
  });
});

describe('ProviderSchema union', () => {
  it('should match ApiProviderSchema before ProviderOptionsSchema when callApi is present', () => {
    const mockCallApi = vi.fn();
    const input = {
      id: () => 'custom-provider',
      callApi: mockCallApi,
      label: 'Custom Provider',
    };

    const result = ProviderSchema.safeParse(input);

    expect(result.success).toBe(true);
    // callApi should be preserved because ApiProviderSchema matches first
    expect(result.data).toHaveProperty('callApi');
    expect(result.data).toHaveProperty('id');
    expect(result.data).toHaveProperty('label', 'Custom Provider');
  });

  it('should match ProviderOptionsSchema when no callApi function', () => {
    const input = {
      id: 'test-provider',
      label: 'Test Provider',
      unknownField: 'should be filtered',
    };

    const result = ProviderSchema.safeParse(input);

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('id', 'test-provider');
    expect(result.data).toHaveProperty('label', 'Test Provider');
    // unknownField should be filtered by ProviderOptionsSchema
    expect(result.data).not.toHaveProperty('unknownField');
  });

  it('should accept string provider', () => {
    const result = ProviderSchema.safeParse('openai:gpt-4');

    expect(result.success).toBe(true);
    expect(result.data).toBe('openai:gpt-4');
  });
});
