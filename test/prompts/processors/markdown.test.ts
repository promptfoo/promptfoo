import * as fs from 'fs/promises';

import { processMarkdownFile } from '../../../src/prompts/processors/markdown';

jest.mock('fs/promises');

describe('processMarkdownFile', () => {
  const mockReadFile = jest.mocked(fs.readFile);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process a valid Markdown file without a label', async () => {
    const filePath = 'file.md';
    const fileContent = '# Heading\n\nThis is some markdown content.';
    mockReadFile.mockResolvedValue(fileContent);
    expect(await processMarkdownFile(filePath, {})).toEqual([
      {
        raw: fileContent,
        label: `${filePath}: # Heading\n\nThis is some markdown content....`,
      },
    ]);
    expect(mockReadFile).toHaveBeenCalledWith(filePath, 'utf8');
  });

  it('should process a valid Markdown file with a label', async () => {
    const filePath = 'file.md';
    const fileContent = '# Heading\n\nThis is some markdown content.';
    mockReadFile.mockResolvedValue(fileContent);
    expect(await processMarkdownFile(filePath, { label: 'Custom Label' })).toEqual([
      {
        raw: fileContent,
        label: 'Custom Label',
      },
    ]);
    expect(mockReadFile).toHaveBeenCalledWith(filePath, 'utf8');
  });

  it('should truncate the label for long Markdown files', async () => {
    const filePath = 'file.md';
    const fileContent = '# ' + 'A'.repeat(100);
    mockReadFile.mockResolvedValue(fileContent);
    expect(await processMarkdownFile(filePath, {})).toEqual([
      {
        raw: fileContent,
        label: `${filePath}: # ${'A'.repeat(48)}...`,
      },
    ]);
    expect(mockReadFile).toHaveBeenCalledWith(filePath, 'utf8');
  });

  it('should throw an error if the file cannot be read', async () => {
    const filePath = 'nonexistent.md';
    mockReadFile.mockRejectedValue(new Error('File not found'));

    await expect(processMarkdownFile(filePath, {})).rejects.toThrow('File not found');
    expect(mockReadFile).toHaveBeenCalledWith(filePath, 'utf8');
  });
});
