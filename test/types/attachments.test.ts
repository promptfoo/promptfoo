import { describe, expect, it } from 'vitest';
import { getInputRepresentations } from '../../src/types/attachments';

describe('attachment representations', () => {
  it('includes only declared file aliases and preserves original variables', () => {
    const document = 'UEZERg==';
    const uri = `data:application/pdf;base64,${document}`;
    const vars = {
      document,
      question: 'Current question',
      __prompt: JSON.stringify({
        document: uri,
        image: 'data:image/png;base64,UE5H',
        question: 'Older question',
        literal: 'data:image/png;base64,SU5MSU5F',
      }),
    };
    const original = structuredClone(vars);
    const entries = getInputRepresentations(
      vars,
      { image: { type: 'image', description: 'Receipt' }, question: 'Question' },
      'document',
    );
    expect(entries).toContainEqual(['document', uri]);
    expect(entries).toContainEqual(['image', 'data:image/png;base64,UE5H']);
    expect(entries).not.toContainEqual(['question', 'Older question']);
    expect(entries.some(([key]) => key === 'literal')).toBe(false);
    expect(
      entries.indexOf(entries.find(([key, value]) => key === 'document' && value === uri)!),
    ).toBeLessThan(
      entries.indexOf(entries.find(([key, value]) => key === 'document' && value === document)!),
    );
    expect(vars).toEqual(original);
  });

  it.each([undefined, 'Task text', '[]', 'null', '"A question"'])(
    'handles a non-object input envelope: %s',
    (__prompt) => {
      const vars = { document: 'UEZERg==', __prompt };
      expect(getInputRepresentations(vars, undefined, 'document')).toEqual(
        expect.arrayContaining(Object.entries(vars)),
      );
      expect(getInputRepresentations(vars, undefined, 'document')).toHaveLength(2);
    },
  );
});
