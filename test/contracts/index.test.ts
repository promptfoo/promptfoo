import { describe, expect, it } from 'vitest';
import {
  buildInputPromptDescription,
  getInputDescription,
  getInputType,
  InputDefinitionObjectSchema,
  isTransformFunction,
  normalizeInputs,
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
    expect(StringOrFunctionSchema.safeParse(() => 'ok').success).toBe(true);
    expect(isTransformFunction(() => 'ok')).toBe(true);
  });

  it('normalizes typed inputs through the extracted leaf helpers', () => {
    const normalizedInputs = normalizeInputs({
      report: {
        description: 'uploaded report',
        type: 'pdf',
        config: { benign: true },
      },
      question: 'user question',
    });

    expect(normalizedInputs).toEqual({
      report: {
        config: { benign: true },
        description: 'uploaded report',
        type: 'pdf',
      },
      question: {
        description: 'user question',
        type: 'text',
      },
    });
    expect(getInputDescription('user question')).toBe('user question');
    expect(getInputType({ description: 'uploaded report', type: 'pdf' })).toBe('pdf');
    expect(buildInputPromptDescription({ description: 'uploaded report', type: 'pdf' })).toBe(
      'uploaded report (format: PDF document; provide the text or instructions that should be embedded in the file)',
    );
  });

  it('rejects document-only injection placements for image inputs', () => {
    expect(
      InputDefinitionObjectSchema.safeParse({
        description: 'screenshot',
        type: 'image',
        config: { injectionPlacements: ['comment'] },
      }).success,
    ).toBe(false);
  });
});
