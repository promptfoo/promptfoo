import * as fs from 'fs/promises';

import { processJinjaFile } from '../../../src/prompts/processors/jinja';

jest.mock('fs/promises');

describe('processJinjaFile', () => {
  const mockReadFile = jest.mocked(fs.readFile);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process a Jinja2 file without a label', async () => {
    const filePath = 'template.j2';
    const fileContent =
      'You are a helpful assistant for Promptfoo.\nPlease answer the following question about {{ topic }}: {{ question }}';
    mockReadFile.mockResolvedValue(fileContent);

    const result = await processJinjaFile(filePath, {});

    expect(result).toEqual([
      {
        raw: fileContent,
        label: `${filePath}: ${fileContent.slice(0, 50)}...`,
        config: undefined,
      },
    ]);
    expect(mockReadFile).toHaveBeenCalledWith(filePath, 'utf8');
  });

  it('should process a Jinja2 file with a label', async () => {
    const filePath = 'template.j2';
    const fileContent =
      'You are a helpful assistant for Promptfoo.\nPlease answer the following question about {{ topic }}: {{ question }}';
    mockReadFile.mockResolvedValue(fileContent);

    const result = await processJinjaFile(filePath, { label: 'Custom Label' });

    expect(result).toEqual([
      {
        raw: fileContent,
        label: 'Custom Label',
        config: undefined,
      },
    ]);
    expect(mockReadFile).toHaveBeenCalledWith(filePath, 'utf8');
  });

  it('should include config when provided', async () => {
    const filePath = 'template.j2';
    const fileContent =
      'You are a helpful assistant for Promptfoo.\nPlease answer the following question about {{ topic }}: {{ question }}';
    const config = { temperature: 0.7, max_tokens: 150 };
    mockReadFile.mockResolvedValue(fileContent);

    const result = await processJinjaFile(filePath, { config });

    expect(result).toEqual([
      {
        raw: fileContent,
        label: `${filePath}: ${fileContent.slice(0, 50)}...`,
        config,
      },
    ]);
    expect(mockReadFile).toHaveBeenCalledWith(filePath, 'utf8');
  });

  it('should throw an error if the file cannot be read', async () => {
    const filePath = 'nonexistent.j2';
    mockReadFile.mockRejectedValue(new Error('File not found'));

    await expect(processJinjaFile(filePath, {})).rejects.toThrow('File not found');
    expect(mockReadFile).toHaveBeenCalledWith(filePath, 'utf8');
  });

  it('should handle variable interpolation syntax properly', async () => {
    const filePath = 'complex.j2';
    const fileContent = `
    {% if condition %}
      Handle {{ variable1 }} with condition
    {% else %}
      Handle {{ variable2 }} without condition
    {% endif %}
    `;
    mockReadFile.mockResolvedValue(fileContent);

    const result = await processJinjaFile(filePath, {});

    expect(result).toEqual([
      {
        raw: fileContent,
        label: `${filePath}: ${fileContent.slice(0, 50)}...`,
        config: undefined,
      },
    ]);
    expect(mockReadFile).toHaveBeenCalledWith(filePath, 'utf8');
  });
});
