import { describe, expect, it } from 'vitest';
import { JsonProviderOptionsWithIdSchema } from '../../../src/types/api/providers';

describe('JSON provider PDF templates', () => {
  const templates = [
    { source: 'file', path: './invoice.pdf' },
    { source: 'generated', description: 'An invoice' },
  ];

  it.each([undefined, 'text', 'image', 'docx'])('rejects templates for input type %s', (type) => {
    for (const template of templates) {
      expect(
        JsonProviderOptionsWithIdSchema.safeParse({
          id: 'echo',
          inputs: { document: { description: 'Invoice', type, config: { template } } },
        }).success,
      ).toBe(false);
    }
  });

  it.each(templates)('preserves a $source PDF template', (template) => {
    const provider = {
      id: 'echo',
      inputs: {
        document: {
          description: 'Invoice',
          type: 'pdf',
          config: { template, benign: true },
        },
      },
    };
    expect(JsonProviderOptionsWithIdSchema.parse(provider)).toEqual(provider);
  });

  it('preserves ordinary non-PDF config behavior', () => {
    const parsed = JsonProviderOptionsWithIdSchema.parse({
      id: 'echo',
      inputs: {
        question: { description: 'Question', config: { benign: true, unrelated: 'ignored' } },
      },
    });
    expect(parsed.inputs?.question).toEqual({ description: 'Question', config: { benign: true } });
  });
});
