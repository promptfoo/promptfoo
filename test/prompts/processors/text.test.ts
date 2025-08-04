import * as fs from 'fs/promises';

import { PROMPT_DELIMITER } from '../../../src/prompts/constants';
import { processTxtFile } from '../../../src/prompts/processors/text';

jest.mock('fs/promises');

describe('processTxtFile', () => {
  const mockReadFile = jest.mocked(fs.readFile);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process a text file with single prompt and no label', async () => {
    const filePath = 'file.txt';
    const fileContent = 'This is a prompt';
    mockReadFile.mockResolvedValue(fileContent);
    expect(await processTxtFile(filePath, {})).toEqual([
      {
        raw: 'This is a prompt',
        label: 'file.txt: This is a prompt',
      },
    ]);
    expect(mockReadFile).toHaveBeenCalledWith(filePath, 'utf-8');
  });

  it('should process a text file with single prompt and a label', async () => {
    const filePath = 'file.txt';
    const fileContent = 'This is a prompt';
    mockReadFile.mockResolvedValue(fileContent);
    expect(await processTxtFile(filePath, { label: 'prompt 1' })).toEqual([
      {
        raw: 'This is a prompt',
        label: 'prompt 1: file.txt: This is a prompt',
      },
    ]);
    expect(mockReadFile).toHaveBeenCalledWith(filePath, 'utf-8');
  });

  it('should process a text file with multiple prompts and a label', async () => {
    const fileContent = `Prompt 1\n${PROMPT_DELIMITER}\nPrompt 2\n${PROMPT_DELIMITER}\nPrompt 3`;
    mockReadFile.mockResolvedValue(fileContent);
    expect(await processTxtFile('file.txt', { label: 'Label' })).toEqual([
      {
        raw: 'Prompt 1',
        label: `Label: file.txt: Prompt 1`,
      },
      {
        raw: 'Prompt 2',
        label: `Label: file.txt: Prompt 2`,
      },
      {
        raw: 'Prompt 3',
        label: `Label: file.txt: Prompt 3`,
      },
    ]);
    expect(mockReadFile).toHaveBeenCalledWith('file.txt', 'utf-8');
  });

  it('should handle text file with leading and trailing delimiters', async () => {
    const filePath = 'file.txt';
    const fileContent = `${PROMPT_DELIMITER}\nPrompt 1\n${PROMPT_DELIMITER}\nPrompt 2\n${PROMPT_DELIMITER}`;
    mockReadFile.mockResolvedValue(fileContent);
    expect(await processTxtFile(filePath, {})).toEqual([
      {
        raw: 'Prompt 1',
        label: `${filePath}: Prompt 1`,
      },
      {
        raw: 'Prompt 2',
        label: `${filePath}: Prompt 2`,
      },
    ]);
    expect(mockReadFile).toHaveBeenCalledWith(filePath, 'utf-8');
  });

  it('should return an empty array for a file with only delimiters', async () => {
    const filePath = 'file.txt';
    const fileContent = `${PROMPT_DELIMITER}\n${PROMPT_DELIMITER}`;
    mockReadFile.mockResolvedValue(fileContent);
    expect(await processTxtFile(filePath, {})).toEqual([]);
    expect(mockReadFile).toHaveBeenCalledWith(filePath, 'utf-8');
  });

  it('should return an empty array for an empty file', async () => {
    const filePath = 'file.txt';
    const fileContent = '';
    mockReadFile.mockResolvedValue(fileContent);
    expect(await processTxtFile(filePath, {})).toEqual([]);
    expect(mockReadFile).toHaveBeenCalledWith(filePath, 'utf-8');
  });

  it('should not split on lines that contain repeated hyphens', async () => {
    const filePath = 'file.txt';
    const fileContent = 'Line 1\n-----------------------------------\nLine 2';
    mockReadFile.mockResolvedValue(fileContent);
    expect(await processTxtFile(filePath, {})).toEqual([
      {
        raw: 'Line 1\n-----------------------------------\nLine 2',
        label: `${filePath}: Line 1\n-----------------------------------\nLine 2`,
      },
    ]);
    expect(mockReadFile).toHaveBeenCalledWith(filePath, 'utf-8');
  });
});
