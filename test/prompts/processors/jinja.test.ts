import * as fs from 'fs';
import { processJinjaFile } from '../../../src/prompts/processors/jinja';

jest.mock('fs');

describe('processJinjaFile', () => {
  const mockReadFileSync = jest.mocked(fs.readFileSync);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process a Jinja2 file without a label', () => {
    const filePath = 'template.j2';
    const fileContent =
      'You are a helpful assistant for Promptfoo.\nPlease answer the following question about {{ topic }}: {{ question }}';
    mockReadFileSync.mockReturnValue(fileContent);

    const result = processJinjaFile(filePath, {});

    expect(result).toEqual([
      {
        raw: fileContent,
        label: `${filePath}: ${fileContent.slice(0, 50)}...`,
        config: undefined,
      },
    ]);
    expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf8');
  });

  it('should process a Jinja2 file with a label', () => {
    const filePath = 'template.j2';
    const fileContent =
      'You are a helpful assistant for Promptfoo.\nPlease answer the following question about {{ topic }}: {{ question }}';
    mockReadFileSync.mockReturnValue(fileContent);

    const result = processJinjaFile(filePath, { label: 'Custom Label' });

    expect(result).toEqual([
      {
        raw: fileContent,
        label: 'Custom Label',
        config: undefined,
      },
    ]);
    expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf8');
  });

  it('should include config when provided', () => {
    const filePath = 'template.j2';
    const fileContent =
      'You are a helpful assistant for Promptfoo.\nPlease answer the following question about {{ topic }}: {{ question }}';
    const config = { temperature: 0.7, max_tokens: 150 };
    mockReadFileSync.mockReturnValue(fileContent);

    const result = processJinjaFile(filePath, { config });

    expect(result).toEqual([
      {
        raw: fileContent,
        label: `${filePath}: ${fileContent.slice(0, 50)}...`,
        config,
      },
    ]);
    expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf8');
  });

  it('should throw an error if the file cannot be read', () => {
    const filePath = 'nonexistent.j2';
    mockReadFileSync.mockImplementation(() => {
      throw new Error('File not found');
    });

    expect(() => processJinjaFile(filePath, {})).toThrow('File not found');
    expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf8');
  });

  it('should handle variable interpolation syntax properly', () => {
    const filePath = 'complex.j2';
    const fileContent = `
    {% if condition %}
      Handle {{ variable1 }} with condition
    {% else %}
      Handle {{ variable2 }} without condition
    {% endif %}
    `;
    mockReadFileSync.mockReturnValue(fileContent);

    const result = processJinjaFile(filePath, {});

    expect(result).toEqual([
      {
        raw: fileContent,
        label: `${filePath}: ${fileContent.slice(0, 50)}...`,
        config: undefined,
      },
    ]);
    expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf8');
  });
});
