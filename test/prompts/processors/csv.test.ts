import fs from 'fs';
import { processCsvPrompts } from '../../../src/prompts/processors/csv';
import type { Prompt } from '../../../src/types';

// Mock fs
jest.mock('fs');

describe('processCsvPrompts', () => {
  // Reset mocks before each test
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should process a single column CSV with header', async () => {
    // Example CSV with header
    const csvContent = `prompt
Tell me about {{topic}}
Explain {{topic}} in simple terms
Write a poem about {{topic}}`;

    jest.mocked(fs.readFileSync).mockReturnValue(csvContent);

    const result = await processCsvPrompts('prompts.csv', {});

    // Should skip the header row
    expect(result).toHaveLength(3);
    expect(result[0].raw).toBe('Tell me about {{topic}}');
    expect(result[1].raw).toBe('Explain {{topic}} in simple terms');
    expect(result[2].raw).toBe('Write a poem about {{topic}}');
    expect(result[0].label).toBe('Prompt 1');
    expect(result[1].label).toBe('Prompt 2');
    expect(result[2].label).toBe('Prompt 3');
  });

  it('should process a single column text file without header', async () => {
    // Example text file without header and without commas
    const csvContent = `Tell me about {{topic}}
Explain {{topic}} in simple terms
Write a poem about {{topic}}`;

    jest.mocked(fs.readFileSync).mockReturnValue(csvContent);

    const result = await processCsvPrompts('prompts.csv', {});

    expect(result).toHaveLength(3);
    expect(result[0].raw).toBe('Tell me about {{topic}}');
    expect(result[1].raw).toBe('Explain {{topic}} in simple terms');
    expect(result[2].raw).toBe('Write a poem about {{topic}}');
    expect(result[0].label).toBe('Prompt 1');
    expect(result[1].label).toBe('Prompt 2');
    expect(result[2].label).toBe('Prompt 3');
  });

  it('should process a two column CSV with prompt and label', async () => {
    // Example CSV with prompt and label columns
    const csvContent = `prompt,label
Tell me about {{topic}},Basic Query
Explain {{topic}} in simple terms,Simple Explanation
Write a poem about {{topic}},Poetry Generator`;

    jest.mocked(fs.readFileSync).mockReturnValue(csvContent);

    const result = await processCsvPrompts('prompts.csv', {});

    expect(result).toHaveLength(3);
    expect(result[0].raw).toBe('Tell me about {{topic}}');
    expect(result[0].label).toBe('Basic Query');
    expect(result[1].raw).toBe('Explain {{topic}} in simple terms');
    expect(result[1].label).toBe('Simple Explanation');
    expect(result[2].raw).toBe('Write a poem about {{topic}}');
    expect(result[2].label).toBe('Poetry Generator');
  });

  it('should handle empty CSV file', async () => {
    // Empty CSV
    const csvContent = '';

    jest.mocked(fs.readFileSync).mockReturnValue(csvContent);

    const result = await processCsvPrompts('prompts.csv', {});
    expect(result).toHaveLength(0);
  });

  it('should generate labels from prompt content when not provided', async () => {
    // Example CSV without label column - just a single column with a header
    const csvContent = `prompt
This is a very long prompt that should be truncated for the label`;

    jest.mocked(fs.readFileSync).mockReturnValue(csvContent);

    const result = await processCsvPrompts('prompts.csv', {});

    expect(result).toHaveLength(1);
    expect(result[0].raw).toBe('This is a very long prompt that should be truncated for the label');
    expect(result[0].label).toBe('Prompt 1');
  });

  it('should use base prompt properties if provided', async () => {
    // Example CSV with prompt column and a row of data
    const csvContent = `prompt
Tell me about {{topic}}`;

    jest.mocked(fs.readFileSync).mockReturnValue(csvContent);

    const basePrompt: Partial<Prompt> = {
      label: 'Base Label',
      id: 'base-id',
    };

    const result = await processCsvPrompts('prompts.csv', basePrompt);

    expect(result).toHaveLength(1);
    expect(result[0].raw).toBe('Tell me about {{topic}}');
    expect(result[0].label).toBe('Base Label');
    expect(result[0].id).toBe('base-id');
  });

  it('should skip rows with missing prompt values', async () => {
    // Example CSV with some empty cells
    const csvContent = `prompt,label
Tell me about {{topic}},Basic Query

Write a poem about {{topic}},Poetry Generator`;

    jest.mocked(fs.readFileSync).mockReturnValue(csvContent);

    const result = await processCsvPrompts('prompts.csv', {});

    expect(result).toHaveLength(2);
    expect(result[0].raw).toBe('Tell me about {{topic}}');
    expect(result[1].raw).toBe('Write a poem about {{topic}}');
  });
});
