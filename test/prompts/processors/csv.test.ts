import fs from 'fs';
import dedent from 'ts-dedent';
import { processCsvPrompts } from '../../../src/prompts/processors/csv';
import type { Prompt } from '../../../src/types';

jest.mock('fs');

describe('processCsvPrompts', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should process a single column CSV with header', async () => {
    const csvContent = dedent`
      prompt
      Tell me about {{topic}}
      Explain {{topic}} in simple terms
      Write a poem about {{topic}}
    `;

    jest.mocked(fs.readFileSync).mockReturnValue(csvContent);

    const result = await processCsvPrompts('prompts.csv', {});

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      raw: 'Tell me about {{topic}}',
      label: 'Prompt 1 - Tell me about {{topic}}',
    });
    expect(result[1]).toEqual({
      raw: 'Explain {{topic}} in simple terms',
      label: 'Prompt 2 - Explain {{topic}} in simple terms',
    });
    expect(result[2]).toEqual({
      raw: 'Write a poem about {{topic}}',
      label: 'Prompt 3 - Write a poem about {{topic}}',
    });
  });

  it('should process a single column text file without header', async () => {
    const csvContent = dedent`
      Tell me about {{topic}}
      Explain {{topic}} in simple terms
      Write a poem about {{topic}}
    `;

    jest.mocked(fs.readFileSync).mockReturnValue(csvContent);

    const result = await processCsvPrompts('prompts.csv', {});

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      raw: 'Tell me about {{topic}}',
      label: 'Prompt 1 - Tell me about {{topic}}',
    });
    expect(result[1]).toEqual({
      raw: 'Explain {{topic}} in simple terms',
      label: 'Prompt 2 - Explain {{topic}} in simple terms',
    });
    expect(result[2]).toEqual({
      raw: 'Write a poem about {{topic}}',
      label: 'Prompt 3 - Write a poem about {{topic}}',
    });
  });

  it('should process a two column CSV with prompt and label', async () => {
    const csvContent = dedent`
      prompt,label
      Tell me about {{topic}},Basic Query
      Explain {{topic}} in simple terms,Simple Explanation
      Write a poem about {{topic}},Poetry Generator
    `;

    jest.mocked(fs.readFileSync).mockReturnValue(csvContent);

    const result = await processCsvPrompts('prompts.csv', {});

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      raw: 'Tell me about {{topic}}',
      label: 'Basic Query',
    });
    expect(result[1]).toEqual({
      raw: 'Explain {{topic}} in simple terms',
      label: 'Simple Explanation',
    });
    expect(result[2]).toEqual({
      raw: 'Write a poem about {{topic}}',
      label: 'Poetry Generator',
    });
  });

  it('should generate labels from prompt content when not provided', async () => {
    const csvContent = dedent`
      prompt
      This is a very long prompt that should be truncated for the label
    `;

    jest.mocked(fs.readFileSync).mockReturnValue(csvContent);

    const result = await processCsvPrompts('prompts.csv', {});

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      raw: 'This is a very long prompt that should be truncated for the label',
      label: 'Prompt 1 - This is a very long prompt that should be truncated for the label',
    });
  });

  it('should use base prompt properties if provided', async () => {
    const csvContent = dedent`
      prompt
      Tell me about {{topic}}
    `;

    jest.mocked(fs.readFileSync).mockReturnValue(csvContent);

    const basePrompt: Partial<Prompt> = {
      label: 'Base Label',
      id: 'base-id',
    };

    const result = await processCsvPrompts('prompts.csv', basePrompt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      raw: 'Tell me about {{topic}}',
      label: 'Base Label',
      id: 'base-id',
    });
  });

  it('should skip rows with missing prompt values', async () => {
    const csvContent = dedent`
      prompt,label
      Tell me about {{topic}},Basic Query

      Write a poem about {{topic}},Poetry Generator
    `;

    jest.mocked(fs.readFileSync).mockReturnValue(csvContent);

    const result = await processCsvPrompts('prompts.csv', {});

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      raw: 'Tell me about {{topic}}',
      label: 'Basic Query',
    });
    expect(result[1]).toEqual({
      raw: 'Write a poem about {{topic}}',
      label: 'Poetry Generator',
    });
  });

  it('should handle custom delimiters', async () => {
    const csvContent = dedent`
      prompt;label
      Tell me about {{topic}};Basic Query
      Explain {{topic}} in simple terms;Simple Explanation
    `;

    jest.mocked(fs.readFileSync).mockReturnValue(csvContent);
    process.env.PROMPTFOO_CSV_DELIMITER = ';';

    const result = await processCsvPrompts('prompts.csv', {});

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      raw: 'Tell me about {{topic}}',
      label: 'Basic Query',
    });
    expect(result[1]).toEqual({
      raw: 'Explain {{topic}} in simple terms',
      label: 'Simple Explanation',
    });

    delete process.env.PROMPTFOO_CSV_DELIMITER;
  });

  it('should handle empty files', async () => {
    jest.mocked(fs.readFileSync).mockReturnValue('');

    const result = await processCsvPrompts('prompts.csv', {});

    expect(result).toHaveLength(0);
  });
});
