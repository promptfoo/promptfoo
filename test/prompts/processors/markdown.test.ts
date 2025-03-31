import * as fs from 'fs';
import { processMarkdownFile } from '../../../src/prompts/processors/markdown';
import { loadFile } from '../../../src/util/fileLoader';

jest.mock('fs');
jest.mock('../../../src/util/fileLoader', () => ({
  loadFile: jest.fn(),
}));

describe('processMarkdownFile', () => {
  const mockLoadFile = jest.mocked(loadFile);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process a valid Markdown file without a label', async () => {
    const filePath = 'file.md';
    const fileContent = '# Hello\nWorld';
    mockLoadFile.mockResolvedValue(fileContent);

    const result = await processMarkdownFile(filePath, {});

    expect(result).toEqual([
      {
        raw: '# Hello\nWorld',
        label: 'file.md: # Hello\nWorld...',
        config: undefined,
      },
    ]);
    expect(mockLoadFile).toHaveBeenCalledWith(filePath);
  });

  it('should process a valid Markdown file with a label', async () => {
    const filePath = 'file.md';
    const fileContent = '# Hello\nWorld';
    mockLoadFile.mockResolvedValue(fileContent);

    const result = await processMarkdownFile(filePath, { label: 'Label' });

    expect(result).toEqual([
      {
        raw: '# Hello\nWorld',
        label: 'Label',
        config: undefined,
      },
    ]);
    expect(mockLoadFile).toHaveBeenCalledWith(filePath);
  });

  it('should process a valid Markdown file with config', async () => {
    const filePath = 'file.md';
    const fileContent = '# Hello\nWorld';
    mockLoadFile.mockResolvedValue(fileContent);
    const config = { key: 'value' };

    const result = await processMarkdownFile(filePath, { config });

    expect(result).toEqual([
      {
        raw: '# Hello\nWorld',
        label: 'file.md: # Hello\nWorld...',
        config,
      },
    ]);
    expect(mockLoadFile).toHaveBeenCalledWith(filePath);
  });

  it('should throw an error if the file cannot be read', async () => {
    const filePath = 'nonexistent.md';
    mockLoadFile.mockRejectedValue(new Error('File not found'));

    await expect(processMarkdownFile(filePath, {})).rejects.toThrow('File not found');
    expect(mockLoadFile).toHaveBeenCalledWith(filePath);
  });
});
