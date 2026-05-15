import { describe, expect, it } from 'vitest';
import {
  BaseTokenUsageSchema,
  buildInputPromptDescription,
  CompletionTokenDetailsSchema,
  DocumentMediaInjectionPlacementSchema,
  DocxInjectionPlacementSchema,
  getInputDescription,
  getInputType,
  InputDefinitionObjectSchema,
  InputsSchema,
  isTransformFunction,
  NunjucksFilterMapSchema,
  normalizeInputDefinition,
  normalizeInputs,
  PromptConfigSchema,
  PromptSchema,
  ProviderEnvOverridesSchema,
  StringOrFunctionSchema,
} from '../../src/contracts';

describe('contracts leaf surface', () => {
  describe('barrel exports', () => {
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
  });

  describe('ProviderEnvOverridesSchema', () => {
    it('parses a known env key', () => {
      const parsed = ProviderEnvOverridesSchema.safeParse({ OPENAI_API_KEY: 'sk-known' });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.OPENAI_API_KEY).toBe('sk-known');
      }
    });

    it('strips unknown keys at parse time (strict z.object)', () => {
      const parsed = ProviderEnvOverridesSchema.safeParse({
        OPENAI_API_KEY: 'sk-known',
        MY_CUSTOM_VAR: 'custom',
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        // The schema is strict on its declared shape; consumers that need
        // arbitrary keys read them off the original source object.
        expect((parsed.data as Record<string, unknown>).MY_CUSTOM_VAR).toBeUndefined();
      }
    });

    it('rejects non-string values for known keys', () => {
      expect(
        ProviderEnvOverridesSchema.safeParse({
          OPENAI_API_KEY: 123,
        }).success,
      ).toBe(false);
    });
  });

  describe('token usage schemas', () => {
    it('parses BaseTokenUsageSchema with completionDetails and nested assertions', () => {
      const parsed = BaseTokenUsageSchema.safeParse({
        prompt: 10,
        completion: 5,
        total: 15,
        numRequests: 1,
        completionDetails: {
          reasoning: 4,
          cacheReadInputTokens: 1,
        },
        assertions: {
          prompt: 1,
          completion: 1,
          numRequests: 1,
          completionDetails: { reasoning: 1 },
        },
      });
      expect(parsed.success).toBe(true);
    });

    it('parses CompletionTokenDetailsSchema with all fields', () => {
      const parsed = CompletionTokenDetailsSchema.safeParse({
        reasoning: 10,
        acceptedPrediction: 1,
        rejectedPrediction: 0,
        cacheReadInputTokens: 5,
        cacheCreationInputTokens: 0,
      });
      expect(parsed.success).toBe(true);
    });

    it('rejects non-number token counts', () => {
      expect(BaseTokenUsageSchema.safeParse({ prompt: '10' }).success).toBe(false);
    });
  });

  describe('NunjucksFilterMapSchema', () => {
    it('accepts a record of string -> function', () => {
      const filters = { upper: (s: string) => s.toUpperCase() };
      expect(NunjucksFilterMapSchema.safeParse(filters).success).toBe(true);
    });

    it('rejects non-function values', () => {
      expect(NunjucksFilterMapSchema.safeParse({ upper: 'not a fn' }).success).toBe(false);
    });
  });

  describe('PromptConfigSchema', () => {
    it('parses optional prefix and suffix', () => {
      expect(PromptConfigSchema.safeParse({ prefix: 'a', suffix: 'b' }).success).toBe(true);
      expect(PromptConfigSchema.safeParse({}).success).toBe(true);
    });

    it('rejects non-string prefix', () => {
      expect(PromptConfigSchema.safeParse({ prefix: 1 }).success).toBe(false);
    });
  });

  describe('InputsSchema', () => {
    it('accepts valid identifier keys', () => {
      expect(InputsSchema.safeParse({ valid_name: 'desc' }).success).toBe(true);
      expect(InputsSchema.safeParse({ _underscore: 'desc' }).success).toBe(true);
    });

    it('rejects keys starting with a digit', () => {
      const parsed = InputsSchema.safeParse({ '1invalid': 'desc' });
      expect(parsed.success).toBe(false);
    });

    it('rejects keys with hyphens or whitespace', () => {
      expect(InputsSchema.safeParse({ 'has-hyphen': 'd' }).success).toBe(false);
      expect(InputsSchema.safeParse({ 'has space': 'd' }).success).toBe(false);
    });
  });

  describe('Docx and DocumentMedia placement schemas', () => {
    it('accepts each docx placement', () => {
      for (const placement of ['body', 'comment', 'footnote', 'header', 'footer']) {
        expect(DocxInjectionPlacementSchema.safeParse(placement).success).toBe(true);
      }
    });

    it('only accepts body/header/footer for document media', () => {
      expect(DocumentMediaInjectionPlacementSchema.safeParse('body').success).toBe(true);
      expect(DocumentMediaInjectionPlacementSchema.safeParse('header').success).toBe(true);
      expect(DocumentMediaInjectionPlacementSchema.safeParse('footer').success).toBe(true);
      expect(DocumentMediaInjectionPlacementSchema.safeParse('comment').success).toBe(false);
      expect(DocumentMediaInjectionPlacementSchema.safeParse('footnote').success).toBe(false);
    });
  });

  describe('InputDefinitionObjectSchema', () => {
    it('accepts text input with no placements', () => {
      expect(
        InputDefinitionObjectSchema.safeParse({ description: 'a', type: 'text' }).success,
      ).toBe(true);
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

    it('accepts header placement for pdf inputs', () => {
      expect(
        InputDefinitionObjectSchema.safeParse({
          description: 'doc',
          type: 'pdf',
          config: { injectionPlacements: ['header'] },
        }).success,
      ).toBe(true);
    });
  });

  describe('input helpers', () => {
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

    it('normalizeInputs returns undefined when given undefined', () => {
      expect(normalizeInputs(undefined)).toBeUndefined();
    });

    it('normalizeInputDefinition defaults type to text when missing', () => {
      expect(normalizeInputDefinition({ description: 'd' })).toEqual({
        config: undefined,
        description: 'd',
        type: 'text',
      });
    });

    it('buildInputPromptDescription appends benign guidance when config.benign is true', () => {
      const description = buildInputPromptDescription({
        description: 'a question',
        type: 'text',
        config: { benign: true },
      });
      expect(description).toContain('a question');
      expect(description).toContain('benign');
      expect(description).toContain('non-adversarial');
    });

    it('buildInputPromptDescription handles all non-text format labels', () => {
      expect(buildInputPromptDescription({ description: 'x', type: 'pdf' })).toContain(
        'PDF document',
      );
      expect(buildInputPromptDescription({ description: 'x', type: 'docx' })).toContain(
        'DOCX document',
      );
      expect(buildInputPromptDescription({ description: 'x', type: 'image' })).toContain('image');
    });
  });
});
