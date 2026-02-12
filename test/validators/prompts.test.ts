import { describe, expect, it } from 'vitest';
import { PromptConfigSchema, PromptSchema } from '../../src/validators/prompts';

describe('PromptConfigSchema', () => {
  it('should accept empty object', () => {
    const result = PromptConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data).toEqual({});
  });

  it('should accept valid prefix and suffix', () => {
    const input = { prefix: 'You are a helpful assistant.', suffix: 'Please respond.' };
    const result = PromptConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(input);
  });

  it('should accept only prefix', () => {
    const input = { prefix: 'System: ' };
    const result = PromptConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(input);
  });

  it('should accept only suffix', () => {
    const input = { suffix: '\nEnd.' };
    const result = PromptConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(input);
  });

  it('should accept empty string values', () => {
    const input = { prefix: '', suffix: '' };
    const result = PromptConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(input);
  });

  it('should reject non-string prefix', () => {
    const result = PromptConfigSchema.safeParse({ prefix: 123 });
    expect(result.success).toBe(false);
  });

  it('should reject non-string suffix', () => {
    const result = PromptConfigSchema.safeParse({ suffix: true });
    expect(result.success).toBe(false);
  });
});

describe('PromptSchema', () => {
  it('should accept valid prompt with required fields', () => {
    const input = { raw: 'Hello {{name}}', label: 'Greeting prompt' };
    const result = PromptSchema.safeParse(input);
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject(input);
  });

  it('should accept prompt with all fields', () => {
    const mockFn = async () => 'response';
    const input = {
      id: 'prompt-1',
      raw: 'Tell me about {{topic}}',
      display: 'Topic prompt (deprecated)',
      label: 'Topic prompt',
      function: mockFn,
      config: { temperature: 0.7 },
    };
    const result = PromptSchema.safeParse(input);
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('id', 'prompt-1');
    expect(result.data).toHaveProperty('raw', 'Tell me about {{topic}}');
    expect(result.data).toHaveProperty('label', 'Topic prompt');
    expect(result.data).toHaveProperty('function');
    expect(result.data).toHaveProperty('config');
  });

  it('should reject missing raw field', () => {
    const result = PromptSchema.safeParse({ label: 'No raw' });
    expect(result.success).toBe(false);
  });

  it('should reject missing label field', () => {
    const result = PromptSchema.safeParse({ raw: 'Hello' });
    expect(result.success).toBe(false);
  });

  it('should reject empty object', () => {
    const result = PromptSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should accept prompt with optional id', () => {
    const result = PromptSchema.safeParse({
      id: 'test-id',
      raw: 'prompt text',
      label: 'test label',
    });
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('id', 'test-id');
  });

  it('should accept prompt without optional fields', () => {
    const result = PromptSchema.safeParse({
      raw: 'minimal prompt',
      label: 'minimal',
    });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('id');
    expect(result.data).not.toHaveProperty('display');
    expect(result.data).not.toHaveProperty('function');
  });

  it('should reject non-function for function field', () => {
    const result = PromptSchema.safeParse({
      raw: 'test',
      label: 'test',
      function: 'not-a-function',
    });
    expect(result.success).toBe(false);
  });

  it('should accept any config value', () => {
    const result = PromptSchema.safeParse({
      raw: 'test',
      label: 'test',
      config: { nested: { deep: true }, array: [1, 2, 3] },
    });
    expect(result.success).toBe(true);
    expect(result.data?.config).toEqual({ nested: { deep: true }, array: [1, 2, 3] });
  });

  it('should reject non-string raw value', () => {
    const result = PromptSchema.safeParse({ raw: 42, label: 'test' });
    expect(result.success).toBe(false);
  });

  it('should reject non-string label value', () => {
    const result = PromptSchema.safeParse({ raw: 'test', label: 123 });
    expect(result.success).toBe(false);
  });
});
