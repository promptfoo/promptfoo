import * as fs from 'fs';
import { processJinjaFile } from '../../../src/prompts/processors/jinja';
import { loadFile } from '../../../src/util/fileLoader';

jest.mock('fs');
jest.mock('../../../src/util/fileLoader', () => ({
  loadFile: jest.fn(),
}));

describe('processJinjaFile', () => {
  const mockLoadFile = jest.mocked(loadFile);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process a Jinja2 file without a label', async () => {
    const filePath = 'template.j2';
    const fileContent =
      'You are a helpful assistant for Promptfoo.\nPlease answer the following question about {{ topic }}: {{ question }}';
    mockLoadFile.mockResolvedValue(fileContent);

    const result = await processJinjaFile(filePath, {});

    expect(result).toEqual([
      {
        raw: fileContent,
        label: `${filePath}: ${fileContent.slice(0, 50)}...`,
        config: undefined,
      },
    ]);
    expect(mockLoadFile).toHaveBeenCalledWith(filePath);
  });

  it('should process a Jinja2 file with a label', async () => {
    const filePath = 'template.j2';
    const fileContent =
      'You are a helpful assistant for Promptfoo.\nPlease answer the following question about {{ topic }}: {{ question }}';
    mockLoadFile.mockResolvedValue(fileContent);

    const result = await processJinjaFile(filePath, { label: 'Custom Label' });

    expect(result).toEqual([
      {
        raw: fileContent,
        label: 'Custom Label',
        config: undefined,
      },
    ]);
    expect(mockLoadFile).toHaveBeenCalledWith(filePath);
  });

  it('should include config when provided', async () => {
    const filePath = 'template.j2';
    const fileContent =
      'You are a helpful assistant for Promptfoo.\nPlease answer the following question about {{ topic }}: {{ question }}';
    const config = { temperature: 0.7, max_tokens: 150 };
    mockLoadFile.mockResolvedValue(fileContent);

    const result = await processJinjaFile(filePath, { config });

    expect(result).toEqual([
      {
        raw: fileContent,
        label: `${filePath}: ${fileContent.slice(0, 50)}...`,
        config,
      },
    ]);
    expect(mockLoadFile).toHaveBeenCalledWith(filePath);
  });

  it('should throw an error if the file cannot be read', async () => {
    const filePath = 'nonexistent.j2';
    mockLoadFile.mockRejectedValue(new Error('File not found'));

    await expect(processJinjaFile(filePath, {})).rejects.toThrow('File not found');
    expect(mockLoadFile).toHaveBeenCalledWith(filePath);
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
    mockLoadFile.mockResolvedValue(fileContent);

    const result = await processJinjaFile(filePath, {});

    expect(result).toEqual([
      {
        raw: fileContent,
        label: `${filePath}: ${fileContent.slice(0, 50)}...`,
        config: undefined,
      },
    ]);
    expect(mockLoadFile).toHaveBeenCalledWith(filePath);
  });
});
