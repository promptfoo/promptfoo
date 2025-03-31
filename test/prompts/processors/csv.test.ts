import fs from 'fs';
import path from 'path';
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
"Tell me about {{topic}}"
"Explain {{topic}} in simple terms"
"Write a poem about {{topic}}"`;

    (fs.readFileSync as jest.Mock).mockReturnValue(csvContent);

    const result = await processCsvPrompts('prompts.csv', {});
    
    expect(result.length).toBe(3);
    expect(result[0].raw).toBe('Tell me about {{topic}}');
    expect(result[1].raw).toBe('Explain {{topic}} in simple terms');
    expect(result[2].raw).toBe('Write a poem about {{topic}}');
  });

  it('should process a single column CSV without header', async () => {
    // Example CSV without header
    const csvContent = `"Tell me about {{topic}}"
"Explain {{topic}} in simple terms"
"Write a poem about {{topic}}"`;

    (fs.readFileSync as jest.Mock).mockReturnValue(csvContent);

    const result = await processCsvPrompts('prompts.csv', {});
    
    expect(result.length).toBe(3);
    expect(result[0].raw).toBe('Tell me about {{topic}}');
    expect(result[1].raw).toBe('Explain {{topic}} in simple terms');
    expect(result[2].raw).toBe('Write a poem about {{topic}}');
  });

  it('should process a two column CSV with prompt and label', async () => {
    // Example CSV with prompt and label columns
    const csvContent = `prompt,label
"Tell me about {{topic}}","Basic Query"
"Explain {{topic}} in simple terms","Simple Explanation"
"Write a poem about {{topic}}","Poetry Generator"`;

    (fs.readFileSync as jest.Mock).mockReturnValue(csvContent);

    const result = await processCsvPrompts('prompts.csv', {});
    
    expect(result.length).toBe(3);
    expect(result[0].raw).toBe('Tell me about {{topic}}');
    expect(result[0].label).toBe('Basic Query');
    expect(result[1].raw).toBe('Explain {{topic}} in simple terms');
    expect(result[1].label).toBe('Simple Explanation');
    expect(result[2].raw).toBe('Write a poem about {{topic}}');
    expect(result[2].label).toBe('Poetry Generator');
  });

  it('should process a multi-column CSV with additional fields', async () => {
    // Example CSV with multiple columns
    const csvContent = `prompt,label,id,config
"Tell me about {{topic}}","Basic Query","query1","{\"temperature\":0.5}"
"Explain {{topic}} in simple terms","Simple Explanation","explain1","{\"max_tokens\":100}"`;

    (fs.readFileSync as jest.Mock).mockReturnValue(csvContent);

    const result = await processCsvPrompts('prompts.csv', {});
    
    expect(result.length).toBe(2);
    expect(result[0].raw).toBe('Tell me about {{topic}}');
    expect(result[0].label).toBe('Basic Query');
    expect(result[0].id).toBe('query1');
    expect(result[0].config).toEqual({ temperature: 0.5 });
    
    expect(result[1].raw).toBe('Explain {{topic}} in simple terms');
    expect(result[1].label).toBe('Simple Explanation');
    expect(result[1].id).toBe('explain1');
    expect(result[1].config).toEqual({ max_tokens: 100 });
  });

  it('should handle invalid JSON in config column', async () => {
    // Example CSV with invalid JSON in config
    const csvContent = `prompt,label,config
"Tell me about {{topic}}","Basic Query","{temperature:0.5}"`;

    (fs.readFileSync as jest.Mock).mockReturnValue(csvContent);

    const result = await processCsvPrompts('prompts.csv', {});
    
    expect(result.length).toBe(1);
    expect(result[0].raw).toBe('Tell me about {{topic}}');
    expect(result[0].label).toBe('Basic Query');
    expect(result[0].config).toBeUndefined();
  });

  it('should throw an error if prompt column is missing', async () => {
    // Example CSV without prompt column
    const csvContent = `label,id
"Basic Query","query1"
"Simple Explanation","explain1"`;

    (fs.readFileSync as jest.Mock).mockReturnValue(csvContent);

    await expect(processCsvPrompts('prompts.csv', {})).rejects.toThrow(/must contain a 'prompt' column/);
  });

  it('should handle empty CSV file', async () => {
    // Empty CSV
    const csvContent = '';

    (fs.readFileSync as jest.Mock).mockReturnValue(csvContent);

    const result = await processCsvPrompts('prompts.csv', {});
    expect(result.length).toBe(0);
  });

  it('should handle case-insensitive column names', async () => {
    // Example CSV with mixed case column names
    const csvContent = `Prompt,LABEL,ID
"Tell me about {{topic}}","Basic Query","query1"`;

    (fs.readFileSync as jest.Mock).mockReturnValue(csvContent);

    const result = await processCsvPrompts('prompts.csv', {});
    
    expect(result.length).toBe(1);
    expect(result[0].raw).toBe('Tell me about {{topic}}');
    expect(result[0].label).toBe('Basic Query');
    expect(result[0].id).toBe('query1');
  });

  it('should generate labels from prompt content when not provided', async () => {
    // Example CSV without label column
    const csvContent = `prompt,id
"This is a very long prompt that should be truncated for the label","query1"`;

    (fs.readFileSync as jest.Mock).mockReturnValue(csvContent);

    const result = await processCsvPrompts('prompts.csv', {});
    
    expect(result.length).toBe(1);
    expect(result[0].raw).toBe('This is a very long prompt that should be truncated for the label');
    expect(result[0].label).toBe('This is a very long prompt that...');
  });

  it('should use base prompt properties if provided', async () => {
    // Example CSV with prompt column
    const csvContent = `prompt
"Tell me about {{topic}}"`;

    (fs.readFileSync as jest.Mock).mockReturnValue(csvContent);

    const basePrompt: Partial<Prompt> = {
      label: 'Base Label',
      id: 'base-id',
    };

    const result = await processCsvPrompts('prompts.csv', basePrompt);
    
    expect(result.length).toBe(1);
    expect(result[0].raw).toBe('Tell me about {{topic}}');
    expect(result[0].label).toBe('Base Label');
    expect(result[0].id).toBe('base-id');
  });

  it('should skip rows with missing prompt values', async () => {
    // Example CSV with some empty cells
    const csvContent = `prompt,label
"Tell me about {{topic}}","Basic Query"
,"Empty Prompt Row"
"Write a poem about {{topic}}","Poetry Generator"`;

    (fs.readFileSync as jest.Mock).mockReturnValue(csvContent);

    const result = await processCsvPrompts('prompts.csv', {});
    
    expect(result.length).toBe(2);
    expect(result[0].raw).toBe('Tell me about {{topic}}');
    expect(result[1].raw).toBe('Write a poem about {{topic}}');
  });
}); 