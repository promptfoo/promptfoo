import * as fs from 'fs';

import dedent from 'dedent';
import { describe, expect, it, vi } from 'vitest';
import {
  processPythonFile,
  pythonPromptFunction,
  pythonPromptFunctionLegacy,
} from '../../../src/prompts/processors/python';

vi.mock('fs');
vi.mock('../../../src/prompts/processors/python', async () => {
  const actual = await vi.importActual('../../../src/prompts/processors/python');
  return {
    ...actual,
    pythonPromptFunction: vi.fn(),
    pythonPromptFunctionLegacy: vi.fn(),
  };
});

describe('processPythonFile', () => {
  const mockReadFileSync = vi.mocked(fs.readFileSync);

  it('should process a valid Python file without a function name or label', () => {
    const filePath = 'file.py';
    const fileContent = 'print("Hello, world!")';
    mockReadFileSync.mockReturnValue(fileContent);
    vi.mocked(pythonPromptFunctionLegacy).mockResolvedValueOnce('mocked result');
    expect(processPythonFile(filePath, {}, undefined)).toEqual([
      {
        function: expect.any(Function),
        label: `${filePath}: ${fileContent}`,
        raw: fileContent,
      },
    ]);
  });

  it('should process a valid Python file with a function name without a label', () => {
    const filePath = 'file.py';
    const fileContent = dedent`
    def testFunction(context):
      print("Hello, world!")`;
    mockReadFileSync.mockReturnValue(fileContent);
    vi.mocked(pythonPromptFunction).mockResolvedValueOnce('mocked result');
    expect(processPythonFile(filePath, {}, 'testFunction')).toEqual([
      {
        function: expect.any(Function),
        raw: fileContent,
        label: `file.py:testFunction`,
      },
    ]);
  });

  it('should process a valid Python file with a label without a function name', () => {
    const filePath = 'file.py';
    const fileContent = 'print("Hello, world!")';
    mockReadFileSync.mockReturnValue(fileContent);
    vi.mocked(pythonPromptFunctionLegacy).mockResolvedValueOnce('mocked result');
    expect(processPythonFile(filePath, { label: 'Label' }, undefined)).toEqual([
      {
        function: expect.any(Function),
        label: `Label`,
        raw: fileContent,
      },
    ]);
  });

  it('should process a valid Python file with a label and function name', () => {
    const filePath = 'file.py';
    const fileContent = dedent`
    def testFunction(context):
      print("Hello, world!")`;
    mockReadFileSync.mockReturnValue(fileContent);
    vi.mocked(pythonPromptFunction).mockResolvedValueOnce('mocked result');
    expect(processPythonFile(filePath, { label: 'Label' }, 'testFunction')).toEqual([
      {
        function: expect.any(Function),
        label: `Label`,
        raw: fileContent,
      },
    ]);
  });

  it('should process a valid Python file with config', () => {
    const filePath = 'file.py';
    const fileContent = 'print("Hello, world!")';
    mockReadFileSync.mockReturnValue(fileContent);
    vi.mocked(pythonPromptFunctionLegacy).mockResolvedValueOnce('mocked result');
    const config = { key: 'value' };
    expect(processPythonFile(filePath, { config }, undefined)).toEqual([
      {
        function: expect.any(Function),
        label: `${filePath}: ${fileContent}`,
        raw: fileContent,
        config: { key: 'value' },
      },
    ]);
  });
});
