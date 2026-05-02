import { describe, expect, it } from 'vitest';
import {
  InputDefinitionObjectSchema,
  isTransformFunction,
  PromptSchema,
  ProviderEnvOverridesSchema,
  StringOrFunctionSchema,
} from '../../src/contracts';

describe('contracts leaf surface', () => {
  it('exports the first portable contract schemas and helpers', () => {
    expect(ProviderEnvOverridesSchema.safeParse({ OPENAI_API_KEY: 'test' }).success).toBe(true);
    expect(
      InputDefinitionObjectSchema.safeParse({
        description: 'uploaded report',
        type: 'pdf',
      }).success,
    ).toBe(true);
    expect(PromptSchema.safeParse({ raw: 'hello', label: 'greeting' }).success).toBe(true);
    expect(StringOrFunctionSchema.safeParse('output.trim()').success).toBe(true);
    expect(isTransformFunction(() => 'ok')).toBe(true);
  });
});
