import * as fs from 'fs';
import { PROMPT_DELIMITER } from '../../../src/prompts/constants';
import { processTxtFile } from '../../../src/prompts/processors/text';

jest.mock('fs');

describe('processTxtFile', () => {
  const mockReadFileSync = jest.mocked(fs.readFileSync);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process a text file with single prompt and no label', () => {
    const filePath = 'file.txt';
    const fileContent = 'This is a prompt';
    mockReadFileSync.mockReturnValue(fileContent);
    expect(processTxtFile(filePath, {})).toEqual([
      {
        raw: 'This is a prompt',
        label: 'file.txt: This is a prompt',
      },
    ]);
    expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf-8');
  });

  it('should process a text file with single prompt and a label', () => {
    const filePath = 'file.txt';
    const fileContent = 'This is a prompt';
    mockReadFileSync.mockReturnValue(fileContent);
    expect(processTxtFile(filePath, { label: 'prompt 1' })).toEqual([
      {
        raw: 'This is a prompt',
        label: 'prompt 1: file.txt: This is a prompt',
      },
    ]);
    expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf-8');
  });

  it('should process a text file with multiple prompts and a label', () => {
    const fileContent = `Prompt 1${PROMPT_DELIMITER}Prompt 2${PROMPT_DELIMITER}Prompt 3`;
    mockReadFileSync.mockReturnValue(fileContent);
    expect(processTxtFile('file.txt', { label: 'Label' })).toEqual([
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
    expect(mockReadFileSync).toHaveBeenCalledWith('file.txt', 'utf-8');
  });

  it('should handle text file with leading and trailing delimiters', () => {
    const filePath = 'file.txt';
    const fileContent = `${PROMPT_DELIMITER}Prompt 1${PROMPT_DELIMITER}Prompt 2${PROMPT_DELIMITER}`;
    mockReadFileSync.mockReturnValue(fileContent);
    expect(processTxtFile(filePath, {})).toEqual([
      {
        raw: 'Prompt 1',
        label: `${filePath}: Prompt 1`,
      },
      {
        raw: 'Prompt 2',
        label: `${filePath}: Prompt 2`,
      },
    ]);
    expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf-8');
  });

  it('should return an empty array for a file with only delimiters', () => {
    const filePath = 'file.txt';
    const fileContent = `${PROMPT_DELIMITER}${PROMPT_DELIMITER}`;
    mockReadFileSync.mockReturnValue(fileContent);
    expect(processTxtFile(filePath, {})).toEqual([]);
    expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf-8');
  });

  it('should return an empty array for an empty file', () => {
    const filePath = 'file.txt';
    const fileContent = '';
    mockReadFileSync.mockReturnValue(fileContent);
    expect(processTxtFile(filePath, {})).toEqual([]);
    expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf-8');
  });
});
