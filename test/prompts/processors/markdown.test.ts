import * as fs from 'fs';
import { processMarkdownFile } from '../../../src/prompts/processors/markdown';

jest.mock('fs');

describe('processMarkdownFile', () => {
  const mockReadFileSync = jest.mocked(fs.readFileSync);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process a valid Markdown file without a label', () => {
    const filePath = 'file.md';
    const fileContent = '# Heading\n\nThis is some markdown content.';
    mockReadFileSync.mockReturnValue(fileContent);
    expect(processMarkdownFile(filePath, {})).toEqual([
      {
        raw: fileContent,
        label: `${filePath}: # Heading\n\nThis is some markdown content....`,
      },
    ]);
    expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf8');
  });

  it('should process a valid Markdown file with a label', () => {
    const filePath = 'file.md';
    const fileContent = '# Heading\n\nThis is some markdown content.';
    mockReadFileSync.mockReturnValue(fileContent);
    expect(processMarkdownFile(filePath, { label: 'Custom Label' })).toEqual([
      {
        raw: fileContent,
        label: 'Custom Label',
      },
    ]);
    expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf8');
  });

  it('should truncate the label for long Markdown files', () => {
    const filePath = 'file.md';
    const fileContent = '# ' + 'A'.repeat(100);
    mockReadFileSync.mockReturnValue(fileContent);
    expect(processMarkdownFile(filePath, {})).toEqual([
      {
        raw: fileContent,
        label: `${filePath}: # ${'A'.repeat(48)}...`,
      },
    ]);
    expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf8');
  });

  it('should throw an error if the file cannot be read', () => {
    const filePath = 'nonexistent.md';
    mockReadFileSync.mockImplementation(() => {
      throw new Error('File not found');
    });

    expect(() => processMarkdownFile(filePath, {})).toThrow('File not found');
    expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf8');
  });
});
