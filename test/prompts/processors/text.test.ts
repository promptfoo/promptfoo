import * as fs from 'fs';
import { PROMPT_DELIMITER } from '../../../src/prompts/constants';
import { processTxtFile } from '../../../src/prompts/processors/text';
import { loadFile } from '../../../src/util/fileLoader';

// Mock the fileLoader module
jest.mock('../../../src/util/fileLoader', () => ({
  __esModule: true,
  loadFile: jest.fn(),
}));

// Mock the constants
jest.mock('../../../src/prompts/constants', () => ({
  __esModule: true,
  PROMPT_DELIMITER: '---',
  VALID_FILE_EXTENSIONS: ['.txt', '.json', '.yaml', '.yml'],
}));

jest.mock('fs');

describe('processTxtFile', () => {
  const _mockReadFileSync = jest.mocked(fs.readFileSync);
  const mockLoadFileImpl = jest.mocked(loadFile);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process a text file with single prompt and no label', async () => {
    const filePath = 'file.txt';
    const fileContent = 'This is a prompt';
    mockLoadFileImpl.mockResolvedValue(fileContent);

    await expect(processTxtFile(filePath, {})).resolves.toEqual([
      {
        raw: 'This is a prompt',
        label: 'file.txt: This is a prompt',
      },
    ]);
    expect(mockLoadFileImpl).toHaveBeenCalledWith(filePath);
  });

  it('should process a text file with single prompt and a label', async () => {
    const filePath = 'file.txt';
    const fileContent = 'This is a prompt';
    mockLoadFileImpl.mockResolvedValue(fileContent);

    await expect(processTxtFile(filePath, { label: 'prompt 1' })).resolves.toEqual([
      {
        raw: 'This is a prompt',
        label: 'prompt 1: file.txt: This is a prompt',
      },
    ]);
    expect(mockLoadFileImpl).toHaveBeenCalledWith(filePath);
  });

  it('should process a text file with multiple prompts and a label', async () => {
    const fileContent = `Prompt 1${PROMPT_DELIMITER}Prompt 2${PROMPT_DELIMITER}Prompt 3`;
    mockLoadFileImpl.mockResolvedValue(fileContent);

    await expect(processTxtFile('file.txt', { label: 'Label' })).resolves.toEqual([
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
    expect(mockLoadFileImpl).toHaveBeenCalledWith('file.txt');
  });

  it('should handle text file with leading and trailing delimiters', async () => {
    const filePath = 'file.txt';
    const fileContent = `${PROMPT_DELIMITER}Prompt 1${PROMPT_DELIMITER}Prompt 2${PROMPT_DELIMITER}`;
    mockLoadFileImpl.mockResolvedValue(fileContent);

    await expect(processTxtFile(filePath, {})).resolves.toEqual([
      {
        raw: 'Prompt 1',
        label: `${filePath}: Prompt 1`,
      },
      {
        raw: 'Prompt 2',
        label: `${filePath}: Prompt 2`,
      },
    ]);
    expect(mockLoadFileImpl).toHaveBeenCalledWith(filePath);
  });

  it('should return an empty array for a file with only delimiters', async () => {
    const filePath = 'file.txt';
    const fileContent = `${PROMPT_DELIMITER}${PROMPT_DELIMITER}`;
    mockLoadFileImpl.mockResolvedValue(fileContent);

    await expect(processTxtFile(filePath, {})).resolves.toEqual([]);
    expect(mockLoadFileImpl).toHaveBeenCalledWith(filePath);
  });

  it('should return an empty array for an empty file', async () => {
    const filePath = 'file.txt';
    const fileContent = '';
    mockLoadFileImpl.mockResolvedValue(fileContent);

    await expect(processTxtFile(filePath, {})).resolves.toEqual([]);
    expect(mockLoadFileImpl).toHaveBeenCalledWith(filePath);
  });
});
