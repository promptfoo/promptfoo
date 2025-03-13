import { processString } from '../../../src/prompts/processors/string';
import type { Prompt } from '../../../src/types';

describe('processString', () => {
  it('should process a valid string prompt without a label', () => {
    const prompt: Partial<Prompt> = { raw: 'This is a prompt' };
    expect(processString(prompt)).toEqual([
      {
        raw: 'This is a prompt',
        label: 'This is a prompt',
      },
    ]);
  });

  it('should process a valid string prompt with a label', () => {
    const prompt: Partial<Prompt> = { raw: 'This is a prompt', label: 'Label' };
    expect(processString(prompt)).toEqual([
      {
        raw: 'This is a prompt',
        label: 'Label',
      },
    ]);
  });
});
