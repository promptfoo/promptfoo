import { describe, expect, it } from 'vitest';
import { InputsSchema } from '../../src/contracts/shared';
import {
  ApiProviderSchema,
  ProviderOptionsSchema,
  ProviderSchema,
} from '../../src/validators/providers';
import { createMockProvider } from '../factories/provider';

describe('ProviderOptionsSchema', () => {
  it('uses the canonical input schema for configured and callable providers', () => {
    expect(ProviderOptionsSchema.shape.inputs.unwrap()).toBe(InputsSchema);
    expect(ApiProviderSchema.shape.inputs.unwrap()).toBe(InputsSchema);
    const inputs = { question: 'User question', context: { type: 'text', description: 'Context' } };
    expect(ProviderOptionsSchema.parse({ inputs }).inputs).toEqual(inputs);
    expect(
      ApiProviderSchema.parse({ id: () => 'local', callApi: async () => ({}), inputs }).inputs,
    ).toEqual(inputs);
  });

  it.each([{ 'invalid-name': 'question' }, { question: 42 }, { question: { type: 'unknown' } }])(
    'rejects invalid input contracts: %j',
    (inputs) => {
      expect(ProviderOptionsSchema.safeParse({ inputs }).success).toBe(false);
      expect(
        ApiProviderSchema.safeParse({ id: () => 'local', callApi: async () => ({}), inputs })
          .success,
      ).toBe(false);
    },
  );
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
    const input = createMockProvider({
      id: 'custom-provider',
      label: 'Custom Provider',
    });

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
