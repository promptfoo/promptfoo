import * as fs from 'fs/promises';

import dedent from 'dedent';
import {
  processPythonFile,
  pythonPromptFunction,
  pythonPromptFunctionLegacy,
} from '../../../src/prompts/processors/python';

jest.mock('fs/promises');
jest.mock('../../../src/prompts/processors/python', () => {
  const actual = jest.requireActual('../../../src/prompts/processors/python');
  return {
    ...actual,
    pythonPromptFunction: jest.fn(),
    pythonPromptFunctionLegacy: jest.fn(),
  };
});

describe('processPythonFile', () => {
  const mockReadFile = jest.mocked(fs.readFile);

  it('should process a valid Python file without a function name or label', async () => {
    const filePath = 'file.py';
    const fileContent = 'print("Hello, world!")';
    mockReadFile.mockResolvedValue(fileContent);
    jest.mocked(pythonPromptFunctionLegacy).mockResolvedValueOnce('mocked result');
    expect(await processPythonFile(filePath, {}, undefined)).toEqual([
      {
        function: expect.any(Function),
        label: `${filePath}: ${fileContent}`,
        raw: fileContent,
      },
    ]);
  });

  it('should process a valid Python file with a function name without a label', async () => {
    const filePath = 'file.py';
    const fileContent = dedent`
    def testFunction(context):
      print("Hello, world!")`;
    mockReadFile.mockResolvedValue(fileContent);
    jest.mocked(pythonPromptFunction).mockResolvedValueOnce('mocked result');
    expect(await processPythonFile(filePath, {}, 'testFunction')).toEqual([
      {
        function: expect.any(Function),
        raw: fileContent,
        label: `file.py:testFunction`,
      },
    ]);
  });

  it('should process a valid Python file with a label without a function name', async () => {
    const filePath = 'file.py';
    const fileContent = 'print("Hello, world!")';
    mockReadFile.mockResolvedValue(fileContent);
    jest.mocked(pythonPromptFunctionLegacy).mockResolvedValueOnce('mocked result');
    expect(await processPythonFile(filePath, { label: 'Label' }, undefined)).toEqual([
      {
        function: expect.any(Function),
        label: `Label`,
        raw: fileContent,
      },
    ]);
  });

  it('should process a valid Python file with a label and function name', async () => {
    const filePath = 'file.py';
    const fileContent = dedent`
    def testFunction(context):
      print("Hello, world!")`;
    mockReadFile.mockResolvedValue(fileContent);
    jest.mocked(pythonPromptFunction).mockResolvedValueOnce('mocked result');
    expect(await processPythonFile(filePath, { label: 'Label' }, 'testFunction')).toEqual([
      {
        function: expect.any(Function),
        label: `Label`,
        raw: fileContent,
      },
    ]);
  });

  it('should process a valid Python file with config', async () => {
    const filePath = 'file.py';
    const fileContent = 'print("Hello, world!")';
    mockReadFile.mockResolvedValue(fileContent);
    jest.mocked(pythonPromptFunctionLegacy).mockResolvedValueOnce('mocked result');
    const config = { key: 'value' };
    expect(await processPythonFile(filePath, { config }, undefined)).toEqual([
      {
        function: expect.any(Function),
        label: `${filePath}: ${fileContent}`,
        raw: fileContent,
        config: { key: 'value' },
      },
    ]);
  });
});
