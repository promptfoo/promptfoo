import { describe, expect, it } from 'vitest';
import { SequenceProvider } from '../../src/providers/sequence';

import type { ApiProvider } from '../../src/types/providers';

describe('SequenceProvider response separators', () => {
  it.each([
    { name: 'an explicitly empty separator', separator: '', expected: 'ab' },
    { name: 'the default separator when omitted', separator: undefined, expected: 'a\n---\nb' },
    { name: 'a custom separator', separator: ' | ', expected: 'a | b' },
  ])('uses $name', async ({ separator, expected }) => {
    const calls: string[] = [];
    const originalProvider: ApiProvider = {
      id: () => 'local-echo',
      async callApi(input) {
        calls.push(input);
        return { output: input };
      },
    };
    const provider = new SequenceProvider({
      config: {
        inputs: ['{{first}}', '{{second}}'],
        ...(separator === undefined ? {} : { separator }),
      },
    });

    const result = await provider.callApi('unused prompt', {
      originalProvider,
      prompt: { raw: 'unused prompt', label: 'unused prompt' },
      vars: { first: 'a', second: 'b' },
    });

    expect(calls).toEqual(['a', 'b']);
    expect(result.output).toBe(expected);
  });
});
