import dedent from 'dedent';
import * as fs from 'fs';
import {
  processPythonFile,
  pythonPromptFunction,
  pythonPromptFunctionLegacy,
} from '../../../src/prompts/processors/python';
import { loadFile } from '../../../src/util/fileLoader';

jest.mock('fs');
jest.mock('../../../src/prompts/processors/python', () => {
  const original = jest.requireActual('../../../src/prompts/processors/python');
  return {
    ...original,
    processPythonFile: jest.fn(original.processPythonFile),
    pythonPromptFunction: jest.fn(),
    pythonPromptFunctionLegacy: jest.fn(),
  };
});

jest.mock('../../../src/util/fileLoader', () => ({
  loadFile: jest.fn(),
}));

describe('processPythonFile', () => {
  const mockLoadFile = jest.mocked(loadFile);
  const mockPythonPromptFunction = jest.mocked(pythonPromptFunction);
  const mockPythonPromptFunctionLegacy = jest.mocked(pythonPromptFunctionLegacy);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process a valid Python file without a function name or label', async () => {
    const filePath = 'file.py';
    const fileContent = 'print("Hello, world!")';
    mockLoadFile.mockResolvedValue(fileContent);
    mockPythonPromptFunctionLegacy.mockResolvedValueOnce('mocked result');
    
    const result = await processPythonFile(filePath, {}, undefined);
    
    expect(result).toEqual([
      {
        raw: 'mocked result',
        label: 'file.py',
        config: undefined,
      },
    ]);
    expect(mockLoadFile).toHaveBeenCalledWith(filePath);
    expect(mockPythonPromptFunctionLegacy).toHaveBeenCalledWith(fileContent, {});
  });

  it('should process a valid Python file with a function name but no label', async () => {
    const filePath = 'file.py';
    const fileContent = `
      def testFunction(context):
        print("Hello, world!")`;
    mockLoadFile.mockResolvedValue(fileContent);
    mockPythonPromptFunction.mockResolvedValueOnce('mocked result');
    
    const result = await processPythonFile(filePath, {}, 'testFunction');
    
    expect(result).toEqual([
      {
        raw: 'mocked result',
        label: 'file.py: testFunction',
        config: undefined,
      },
    ]);
    expect(mockLoadFile).toHaveBeenCalledWith(filePath);
    expect(mockPythonPromptFunction).toHaveBeenCalledWith(fileContent, 'testFunction', {});
  });

  it('should process a valid Python file without a function name but with a label', async () => {
    const filePath = 'file.py';
    const fileContent = 'print("Hello, world!")';
    mockLoadFile.mockResolvedValue(fileContent);
    mockPythonPromptFunctionLegacy.mockResolvedValueOnce('mocked result');
    
    const result = await processPythonFile(filePath, { label: 'Label' }, undefined);
    
    expect(result).toEqual([
      {
        raw: 'mocked result',
        label: 'Label',
        config: undefined,
      },
    ]);
    expect(mockLoadFile).toHaveBeenCalledWith(filePath);
    expect(mockPythonPromptFunctionLegacy).toHaveBeenCalledWith(fileContent, { label: 'Label' });
  });

  it('should process a valid Python file with a function name and a label', async () => {
    const filePath = 'file.py';
    const fileContent = `
      def testFunction(context):
        print("Hello, world!")`;
    mockLoadFile.mockResolvedValue(fileContent);
    mockPythonPromptFunction.mockResolvedValueOnce('mocked result');
    
    const result = await processPythonFile(filePath, { label: 'Label' }, 'testFunction');
    
    expect(result).toEqual([
      {
        raw: 'mocked result',
        label: 'Label: testFunction',
        config: undefined,
      },
    ]);
    expect(mockLoadFile).toHaveBeenCalledWith(filePath);
    expect(mockPythonPromptFunction).toHaveBeenCalledWith(fileContent, 'testFunction', { label: 'Label' });
  });

  it('should process a valid Python file with config', async () => {
    const filePath = 'file.py';
    const fileContent = 'print("Hello, world!")';
    mockLoadFile.mockResolvedValue(fileContent);
    mockPythonPromptFunctionLegacy.mockResolvedValueOnce('mocked result');
    const config = { key: 'value' };
    
    const result = await processPythonFile(filePath, { config }, undefined);
    
    expect(result).toEqual([
      {
        raw: 'mocked result',
        label: 'file.py',
        config,
      },
    ]);
    expect(mockLoadFile).toHaveBeenCalledWith(filePath);
    expect(mockPythonPromptFunctionLegacy).toHaveBeenCalledWith(fileContent, { config });
  });

  it('should throw an error if the file cannot be read', async () => {
    const filePath = 'nonexistent.py';
    mockLoadFile.mockRejectedValue(new Error('File not found'));

    await expect(processPythonFile(filePath, {})).rejects.toThrow('File not found');
    expect(mockLoadFile).toHaveBeenCalledWith(filePath);
  });
});
