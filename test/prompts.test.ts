import * as fs from 'fs';
import * as path from 'path';

import { globSync } from 'glob';

import { maybeFilepath, normalizeInput, readPrompts } from '../src/prompts';

import type { Prompt } from '../src/types';

jest.mock('../src/esm');

jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('glob', () => ({
  globSync: jest.fn(),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  statSync: jest.fn(),
  readdirSync: jest.fn(),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

jest.mock('../src/database');

function toPrompt(text: string): Prompt {
  return { raw: text, label: text };
}

describe('readPrompts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  fit('rejects invalid inputs', async () => {
    await expect(readPrompts(null as any)).rejects.toThrow('Invalid input prompt: null');
    await expect(readPrompts(undefined as any)).rejects.toThrow('Invalid input prompt: undefined');
    await expect(readPrompts(1 as any)).rejects.toThrow('Invalid input prompt: 1');
    await expect(readPrompts(true as any)).rejects.toThrow('Invalid input prompt: true');
    await expect(readPrompts(false as any)).rejects.toThrow('Invalid input prompt: false');
  });

  fit('rejects empty inputs', async () => {
    await expect(readPrompts([])).rejects.toThrow('Invalid input prompt: []');
    await expect(readPrompts({} as any)).rejects.toThrow('Invalid input prompt: {}');
    await expect(readPrompts('')).rejects.toThrow('Invalid input prompt: ""');
  });

  it('reads a single prompt', async () => {
    const prompt = 'This is a test prompt';
    await expect(readPrompts(prompt)).resolves.toEqual([
      {
        raw: prompt,
        label: prompt,
      },
    ]);
  });

  it('readPrompts with empty input', async () => {
    jest.mocked(fs.readFileSync).mockReturnValue('');
    jest.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as fs.Stats);
    await expect(readPrompts(['prompts.txt'])).resolves.toEqual([
      {
        label: 'prompts.txt: ',
        raw: '',
      },
    ]);
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
  });

  it('read a list of prompts', async () => {
    const prompts = ['Sample prompt 1', 'Sample prompt 2'];
    await expect(readPrompts(prompts)).toEqual([
      {
        raw: 'Sample prompt 1',
        label: 'Sample prompt 1',
      },
      {
        raw: 'Sample prompt 2',
        label: 'Sample prompt 2',
      },
    ]);
  });

  it('readPrompts with array input single prompt file', async () => {
    jest.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as fs.Stats);
    jest.mocked(fs.readFileSync).mockReturnValue('Test prompt 1\n---\nTest prompt 2');
    jest.mocked(globSync).mockImplementation((pathOrGlob) => [pathOrGlob.toString()]);
    await expect(readPrompts(['prompts.txt'])).resolves.toEqual([
      {
        label: 'prompts.txt: Test prompt 1',
        raw: 'Test prompt 1',
      },
      {
        label: 'prompts.txt: Test prompt 2',
        raw: 'Test prompt 2',
      },
    ]);
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
  });

  it('readPrompts with string input single prompt file', async () => {
    jest.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as fs.Stats);
    jest.mocked(fs.readFileSync).mockReturnValue('Test prompt 1\n---\nTest prompt 2');
    jest.mocked(globSync).mockImplementation((pathOrGlob) => [pathOrGlob.toString()]);
    await expect(readPrompts('prompts.txt')).resolves.toEqual([
      {
        label: 'prompts.txt: Test prompt 1',
        raw: 'Test prompt 1',
      },
      {
        label: 'prompts.txt: Test prompt 2',
        raw: 'Test prompt 2',
      },
    ]);
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
  });

  it('readPrompts with multiple prompt files', async () => {
    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce('Test prompt 1')
      .mockReturnValueOnce('Test prompt 2');
    jest.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as fs.Stats);
    jest.mocked(globSync).mockImplementation((pathOrGlob) => [pathOrGlob.toString()]);
    await expect(readPrompts(['prompt1.txt', 'prompt2.txt'])).resolves.toEqual([
      {
        label: 'prompt1.txt: Test prompt 1',
        raw: 'Test prompt 1',
      },
      {
        label: 'prompt2.txt: Test prompt 2',
        raw: 'Test prompt 2',
      },
    ]);
    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
  });

  it('readPrompts with directory', async () => {
    jest.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);
    jest.mocked(globSync).mockImplementation((pathOrGlob) => [pathOrGlob].flat());
    jest.mocked(fs.readdirSync).mockReturnValue(['prompt1.txt', 'prompt2.txt']);
    jest.mocked(fs.readFileSync).mockImplementation((filePath) => {
      if (filePath.toString().endsWith(path.join('prompts', 'prompt1.txt'))) {
        return 'Test prompt 1';
      } else if (filePath.toString().endsWith(path.join('prompts', 'prompt2.txt'))) {
        return 'Test prompt 2';
      }
      throw new Error('Unexpected file path in test');
    });
    await expect(readPrompts(['prompts'])).toEqual([
      {
        label: 'prompts1.txt: Test prompt 1',
        raw: 'Test prompt 1',
      },
      {
        label: 'prompts2.txt: Test prompt 2',
        raw: 'Test prompt 2',
      },
    ]);
    expect(fs.statSync).toHaveBeenCalledTimes(1);
    expect(fs.readdirSync).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
  });

  it('readPrompts with map input', async () => {
    jest.mocked(fs.readFileSync).mockReturnValue('some raw text');
    jest.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false });

    const result = await readPrompts({
      'prompts.txt': 'foo1',
      'prompts.py': 'foo2',
    });

    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ raw: 'some raw text', label: 'foo1' });
    expect(result[1]).toEqual(expect.objectContaining({ raw: 'some raw text', label: 'foo2' }));
  });

  it('readPrompts with JSONL file', async () => {
    const data = [
      [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Who won the world series in {{ year }}?' },
      ],
      [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Who won the superbowl in {{ year }}?' },
      ],
    ];

    jest.mocked(fs.readFileSync).mockReturnValue(data.map((o) => JSON.stringify(o)).join('\n'));
    jest.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false });
    const promptPaths = ['prompts.jsonl'];

    const result = await readPrompts(promptPaths);

    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual([toPrompt(JSON.stringify(data[0])), toPrompt(JSON.stringify(data[1]))]);
  });

  it('readPrompts with .py file', async () => {
    const code = `print('dummy prompt')`;
    jest.mocked(fs.readFileSync).mockReturnValue(code);
    const result = await readPrompts('prompt.py');
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result[0].raw).toEqual(code);
    expect(result[0].label).toEqual(code);
    expect(result[0].function).toBeDefined();
  });

  it('readPrompts with Prompt object array', async () => {
    const prompts = [
      { id: 'prompts.py:prompt1', label: 'First prompt' },
      { id: 'prompts.py:prompt2', label: 'Second prompt' },
    ];

    const code = `def prompt1:
  return 'First prompt'
def prompt2:
  return 'Second prompt'`;
    jest.mocked(fs.readFileSync).mockReturnValue(code);

    const result = await readPrompts(prompts);

    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      raw: code,
      label: 'First prompt',
      function: expect.any(Function),
    });
    expect(result[1]).toEqual({
      raw: code,
      label: 'Second prompt',
      function: expect.any(Function),
    });
  });

  it('readPrompts with .js file', async () => {
    jest.doMock(
      path.resolve('prompt.js'),
      () => {
        return jest.fn(() => console.log('dummy prompt'));
      },
      { virtual: true },
    );
    const result = await readPrompts('prompt.js');
    expect(result[0].function).toBeDefined();
  });

  it('readPrompts with glob pattern for .txt files', async () => {
    const fileContents: Record<string, string> = {
      '1.txt': 'First text file content',
      '2.txt': 'Second text file content',
    };

    jest.mocked(fs.readFileSync).mockImplementation((path: string) => {
      if (path.includes('1.txt')) {
        return fileContents['1.txt'];
      } else if (path.includes('2.txt')) {
        return fileContents['2.txt'];
      }
      throw new Error('Unexpected file path in test');
    });
    jest.mocked(fs.statSync).mockImplementation((path: string) => ({
      isDirectory: () => path.includes('prompts'),
    }));
    jest.mocked(fs.readdirSync).mockImplementation((path: string) => {
      if (path.includes('prompts')) {
        return ['prompt1.txt', 'prompt2.txt'];
      }
      throw new Error('Unexpected directory path in test');
    });

    const promptPaths = ['file://./prompts/*.txt'];

    const result = await readPrompts(promptPaths);

    expect(fs.readdirSync).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    expect(fs.statSync).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ raw: fileContents['1.txt'], label: fileContents['1.txt'] });
    expect(result[1]).toEqual({ raw: fileContents['2.txt'], label: fileContents['2.txt'] });
  });
});

describe('maybeFilepath', () => {
  it('should return true for valid file paths', () => {
    expect(maybeFilepath('path/to/file.txt')).toBe(true);
    expect(maybeFilepath('C:\\path\\to\\file.txt')).toBe(true);
    expect(maybeFilepath('file.*')).toBe(true);
    expect(maybeFilepath('filename.ext')).toBe(true);
  });

  it('should return false for strings with new lines', () => {
    expect(maybeFilepath('path/to\nfile.txt')).toBe(false);
  });

  it('should return false for strings with "portkey://"', () => {
    expect(maybeFilepath('portkey://path/to/file.txt')).toBe(false);
  });

  it('should return false for strings with "langfuse://"', () => {
    expect(maybeFilepath('langfuse://path/to/file.txt')).toBe(false);
  });

  it('should return false for strings without file path indicators', () => {
    expect(maybeFilepath('justastring')).toBe(false);
    expect(maybeFilepath('anotherstring')).toBe(false);
    expect(maybeFilepath('stringwith.dotbutnotfile')).toBe(false);
  });

  it('should return true for strings with wildcard character', () => {
    expect(maybeFilepath('*.txt')).toBe(true);
    expect(maybeFilepath('path/to/*.txt')).toBe(true);
  });

  it('should return true for strings with file extension at the third or fourth last position', () => {
    expect(maybeFilepath('filename.e')).toBe(false);
    expect(maybeFilepath('file.ext')).toBe(true);
    expect(maybeFilepath('filename.ex')).toBe(true);
    expect(maybeFilepath('file.name.ext')).toBe(true);
  });
});

fdescribe('normalizeInput', () => {
  it('rejects invalid input types', () => {
    expect(() => normalizeInput(null as any)).toThrow('Invalid input prompt: null');
    expect(() => normalizeInput(undefined as any)).toThrow('Invalid input prompt: undefined');
    expect(() => normalizeInput(1 as any)).toThrow('Invalid input prompt: 1');
    expect(() => normalizeInput(true as any)).toThrow('Invalid input prompt: true');
    expect(() => normalizeInput(false as any)).toThrow('Invalid input prompt: false');
  });

  it('rejects empty inputs', () => {
    expect(() => normalizeInput([])).toThrow('Invalid input prompt: []');
    expect(() => normalizeInput({} as any)).toThrow('Invalid input prompt: {}');
    expect(() => normalizeInput('')).toThrow('Invalid input prompt: ""');
    // TODO: should we validate that strings / keys are not empty here?
  });

  it('returns array with single string when input is a non-empty string', () => {
    const result = normalizeInput('valid string');
    expect(result).toEqual([{ raw: 'valid string', label: 'valid string' }]);
  });

  it('returns input array when input is a non-empty array', () => {
    const inputArray = ['prompt1', { raw: 'prompt2' }];
    const result = normalizeInput(inputArray);
    expect(result).toEqual([
      { raw: 'prompt1', label: 'prompt1' },
      { raw: 'prompt2' },
    ]);
  });

  it('normalizes object input to array of prompts', () => {
    const inputObject = {
      key1: 'prompt1',
      key2: 'prompt2',
    };
    const result = normalizeInput(inputObject);
    expect(result).toEqual([
      { label: 'key1', raw: 'prompt1' },
      { label: 'key2', raw: 'prompt2' },
    ]);
  });
});
