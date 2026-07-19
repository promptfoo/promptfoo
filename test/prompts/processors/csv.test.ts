import fs from 'fs';

import dedent from 'ts-dedent';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { processCsvPrompts } from '../../../src/prompts/processors/csv';
import { mockProcessEnv } from '../../util/utils';

import type { Prompt } from '../../../src/types/index';

vi.mock('fs');

describe('processCsvPrompts', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should process a single column CSV with header', async () => {
    const csvContent = dedent`
      prompt
      Tell me about {{topic}}
      Explain {{topic}} in simple terms
      Write a poem about {{topic}}
    `;

    vi.mocked(fs.readFileSync).mockReturnValue(csvContent);

    const result = await processCsvPrompts('prompts.csv', {});

    expect(result).toHaveLength(3);
    expect(result).toEqual([
      {
        raw: 'Tell me about {{topic}}',
        label: 'Prompt 1 - Tell me about {{topic}}',
      },
      {
        raw: 'Explain {{topic}} in simple terms',
        label: 'Prompt 2 - Explain {{topic}} in simple terms',
      },
      {
        raw: 'Write a poem about {{topic}}',
        label: 'Prompt 3 - Write a poem about {{topic}}',
      },
    ]);
  });

  it('should process a single column text file without header', async () => {
    const csvContent = dedent`
      Tell me about {{topic}}
      Explain {{topic}} in simple terms
      Write a poem about {{topic}}
    `;

    vi.mocked(fs.readFileSync).mockReturnValue(csvContent);

    const result = await processCsvPrompts('prompts.csv', {});

    expect(result).toHaveLength(3);
    expect(result).toEqual([
      {
        raw: 'Tell me about {{topic}}',
        label: 'Prompt 1 - Tell me about {{topic}}',
      },
      {
        raw: 'Explain {{topic}} in simple terms',
        label: 'Prompt 2 - Explain {{topic}} in simple terms',
      },
      {
        raw: 'Write a poem about {{topic}}',
        label: 'Prompt 3 - Write a poem about {{topic}}',
      },
    ]);
  });

  it('should process a two column CSV with prompt and label', async () => {
    const csvContent = dedent`
      prompt,label
      Tell me about {{topic}},Basic Query
      Explain {{topic}} in simple terms,Simple Explanation
      Write a poem about {{topic}},Poetry Generator
    `;

    vi.mocked(fs.readFileSync).mockReturnValue(csvContent);

    const result = await processCsvPrompts('prompts.csv', {});

    expect(result).toHaveLength(3);
    expect(result).toEqual([
      {
        raw: 'Tell me about {{topic}}',
        label: 'Basic Query',
      },
      {
        raw: 'Explain {{topic}} in simple terms',
        label: 'Simple Explanation',
      },
      {
        raw: 'Write a poem about {{topic}}',
        label: 'Poetry Generator',
      },
    ]);
  });

  it('should generate labels from prompt content when not provided', async () => {
    const csvContent = dedent`
      prompt
      This is a very long prompt that should be truncated for the label
    `;

    vi.mocked(fs.readFileSync).mockReturnValue(csvContent);

    const result = await processCsvPrompts('prompts.csv', {});

    expect(result).toHaveLength(1);
    expect(result).toEqual([
      {
        raw: 'This is a very long prompt that should be truncated for the label',
        label: 'Prompt 1 - This is a very long prompt that should be truncated for the label',
      },
    ]);
  });

  it('should use base prompt properties if provided', async () => {
    const csvContent = dedent`
      prompt
      Tell me about {{topic}}
    `;

    vi.mocked(fs.readFileSync).mockReturnValue(csvContent);

    const basePrompt: Partial<Prompt> = {
      label: 'Base Label',
      id: 'base-id',
    };

    const result = await processCsvPrompts('prompts.csv', basePrompt);

    expect(result).toHaveLength(1);
    expect(result).toEqual([
      {
        raw: 'Tell me about {{topic}}',
        label: 'Base Label',
        id: 'base-id',
      },
    ]);
  });

  it('should disambiguate base prompt label across multiple rows instead of colliding', async () => {
    const csvContent = dedent`
      prompt
      Tell me about {{topic}}
      Explain {{topic}} in simple terms
    `;

    vi.mocked(fs.readFileSync).mockReturnValue(csvContent);

    const basePrompt: Partial<Prompt> = {
      label: 'My Labeled Prompts',
      id: 'base-id',
    };

    const result = await processCsvPrompts('prompts.csv', basePrompt);

    expect(result).toHaveLength(2);
    const labels = result.map((r) => r.label);
    // Distinct rows must not collapse onto the same label (and therefore the
    // same generateIdFromPrompt-derived prompt id).
    expect(new Set(labels).size).toBe(2);
    expect(labels).toEqual([
      'My Labeled Prompts: Tell me about {{topic}}',
      'My Labeled Prompts: Explain {{topic}} in simple terms',
    ]);
    expect(result.every((prompt) => prompt.id === undefined)).toBe(true);
  });

  it('should disambiguate base prompt label in the parsed-CSV branch while row labels win', async () => {
    const csvContent = dedent`
      prompt,label
      Tell me about {{topic}},Basic Query
      Explain {{topic}} in simple terms,
      Write a poem about {{topic}},
    `;

    vi.mocked(fs.readFileSync).mockReturnValue(csvContent);

    const result = await processCsvPrompts('prompts.csv', { label: 'My Labeled Prompts' });

    expect(result.map((r) => r.label)).toEqual([
      'Basic Query',
      'My Labeled Prompts: Explain {{topic}} in simple terms',
      'My Labeled Prompts: Write a poem about {{topic}}',
    ]);
  });

  it('should keep synthesized labels distinct from explicit row labels', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(dedent`
      prompt,label
      First prompt,
      Second prompt,Group: First prompt
    `);

    const result = await processCsvPrompts('prompts.csv', { label: 'Group', id: 'shared-id' });

    expect(result.map((prompt) => prompt.label)).toEqual([
      'Group: First prompt (row 1)',
      'Group: First prompt',
    ]);
    expect(result.every((prompt) => prompt.id === undefined)).toBe(true);
  });

  it('should keep duplicate synthesized labels distinct', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(dedent`
      prompt
      Same prompt
      Same prompt
    `);

    const result = await processCsvPrompts('prompts.csv', { label: 'Group' });

    expect(result.map((prompt) => prompt.label)).toEqual([
      'Group: Same prompt',
      'Group: Same prompt (row 2)',
    ]);
  });

  it('should disambiguate base prompt label in the malformed-CSV fallback branch', async () => {
    const csvContent = dedent`
      prompt
      "Malformed CSV with a quote problem
      Another prompt line
    `;

    vi.mocked(fs.readFileSync).mockReturnValue(csvContent);

    const result = await processCsvPrompts('prompts.csv', { label: 'My Labeled Prompts' });

    expect(result.map((r) => r.label)).toEqual([
      'My Labeled Prompts: "Malformed CSV with a quote problem',
      'My Labeled Prompts: Another prompt line',
    ]);
  });

  it('should skip rows with missing prompt values', async () => {
    const csvContent = dedent`
      prompt,label
      Tell me about {{topic}},Basic Query

      Write a poem about {{topic}},Poetry Generator
    `;

    vi.mocked(fs.readFileSync).mockReturnValue(csvContent);

    const result = await processCsvPrompts('prompts.csv', {});

    expect(result).toHaveLength(2);
    expect(result).toEqual([
      {
        raw: 'Tell me about {{topic}}',
        label: 'Basic Query',
      },
      {
        raw: 'Write a poem about {{topic}}',
        label: 'Poetry Generator',
      },
    ]);
  });

  it('should handle custom delimiters', async () => {
    const csvContent = dedent`
      prompt;label
      Tell me about {{topic}};Basic Query
      Explain {{topic}} in simple terms;Simple Explanation
    `;

    vi.mocked(fs.readFileSync).mockReturnValue(csvContent);
    const restoreEnv = mockProcessEnv({ PROMPTFOO_CSV_DELIMITER: ';' });
    try {
      const result = await processCsvPrompts('prompts.csv', {});

      expect(result).toHaveLength(2);
      expect(result).toEqual([
        {
          raw: 'Tell me about {{topic}}',
          label: 'Basic Query',
        },
        {
          raw: 'Explain {{topic}} in simple terms',
          label: 'Simple Explanation',
        },
      ]);
    } finally {
      restoreEnv();
    }
  });

  it('should handle empty files', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue('');

    const result = await processCsvPrompts('prompts.csv', {});

    expect(result).toHaveLength(0);
  });

  it('should handle malformed CSV by falling back to line-by-line processing', async () => {
    const csvContent = dedent`
      "prompt","label"
      "Tell me about {{topic}},"Basic Query"
      "Malformed line with unbalanced quotes
      "Another line
    `;

    vi.mocked(fs.readFileSync).mockReturnValue(csvContent);

    const result = await processCsvPrompts('prompts.csv', {});

    expect(result).toHaveLength(4);
    expect(result[0].raw).toBe('"prompt","label"');
    expect(result[1].raw).toBe('"Tell me about {{topic}},"Basic Query"');
    expect(result[2].raw).toBe('"Malformed line with unbalanced quotes');
    expect(result[3].raw).toBe('"Another line');
  });

  it('should handle malformed CSV with a header row correctly', async () => {
    const csvContent = dedent`
      prompt
      "Malformed CSV with a quote problem
      Another prompt line
    `;

    vi.mocked(fs.readFileSync).mockReturnValue(csvContent);

    const result = await processCsvPrompts('prompts.csv', {});

    expect(result).toHaveLength(2);
    expect(result[0].raw).toBe('"Malformed CSV with a quote problem');
    expect(result[1].raw).toBe('Another prompt line');
  });
});
