import * as fs from 'fs';
import * as path from 'path';

import { globSync } from 'glob';

import { maybeFilePath, normalizeInput, readPrompts } from '../src/prompts';

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

  it('rejects invalid inputs', async () => {
    await expect(readPrompts(null as any)).rejects.toThrow('Invalid input prompt: null');
    await expect(readPrompts(undefined as any)).rejects.toThrow('Invalid input prompt: undefined');
    await expect(readPrompts(1 as any)).rejects.toThrow('Invalid input prompt: 1');
    await expect(readPrompts(true as any)).rejects.toThrow('Invalid input prompt: true');
    await expect(readPrompts(false as any)).rejects.toThrow('Invalid input prompt: false');
  });

  it('rejects empty inputs', async () => {
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

  it('read a list of prompts', async () => {
    const prompts = ['Sample prompt A', 'Sample prompt B'];
    await expect(readPrompts(prompts)).resolves.toEqual([
      {
        raw: 'Sample prompt A',
        label: '0: Sample prompt A',
      },
      {
        raw: 'Sample prompt B',
        label: '1: Sample prompt B',
      },
    ]);
  });

  it('readPrompts throws an error for a .txt file with no prompts', async () => {
    jest.mocked(fs.readFileSync).mockReturnValue('');
    jest.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as fs.Stats);
    await expect(readPrompts(['prompts.txt'])).rejects.toThrow(
      'There are no prompts in "prompts.txt"',
    );
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
  });

  it('readPrompts reads a .txt file with a single prompt', async () => {
    jest.mocked(fs.readFileSync).mockReturnValue('Sample Prompt');
    jest.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as fs.Stats);
    await expect(readPrompts('prompts.txt')).resolves.toEqual([
      {
        label: 'prompts.txt: Sample Prompt',
        raw: 'Sample Prompt',
      },
    ]);
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
  });

  it.each([['prompts.txt'], 'prompts.txt'])(
    `readPrompts single prompt file with input:%p`,
    async (promptPath) => {
      jest.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as fs.Stats);
      jest.mocked(fs.readFileSync).mockReturnValue('Test prompt 1\n---\nTest prompt 2');
      jest.mocked(globSync).mockImplementation((pathOrGlob) => [pathOrGlob.toString()]);
      await expect(readPrompts(promptPath)).resolves.toEqual([
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
    },
  );

  it('readPrompts with multiple prompt files', async () => {
    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce('Test prompt 1\n---\nTest prompt 2')
      .mockReturnValueOnce('Test prompt 3\n---\nTest prompt 4\n---\nTest prompt 5');
    jest.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as fs.Stats);
    jest.mocked(globSync).mockImplementation((pathOrGlob) => [pathOrGlob.toString()]);
    await expect(readPrompts(['prompt1.txt', 'prompt2.txt'])).resolves.toEqual([
      {
        label: 'prompt1.txt: Test prompt 1',
        raw: 'Test prompt 1',
      },
      {
        label: 'prompt1.txt: Test prompt 2',
        raw: 'Test prompt 2',
      },
      {
        label: 'prompt2.txt: Test prompt 3',
        raw: 'Test prompt 3',
      },
      {
        label: 'prompt2.txt: Test prompt 4',
        raw: 'Test prompt 4',
      },
      {
        label: 'prompt2.txt: Test prompt 5',
        raw: 'Test prompt 5',
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
        return 'Test prompt 1\n---\nTest prompt 2';
      } else if (filePath.toString().endsWith(path.join('prompts', 'prompt2.txt'))) {
        return 'Test prompt 3\n---\nTest prompt 4\n---\nTest prompt 5';
      }
      throw new Error('Unexpected file path in test');
    });
    await expect(readPrompts(['prompts/*'])).toEqual([
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

  fit('readPrompts with map input', async () => {
    jest.mocked(fs.readFileSync).mockReturnValue('some raw text');
    jest.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as fs.Stats);
    await expect(
      readPrompts({
        'prompts.txt': 'foo1',
        'prompts.py': 'foo2',
      }),
    ).resolves.toEqual([
      { raw: 'some raw text', label: 'foo1' },
      { raw: 'some raw text', label: 'foo2' },
    ]);
    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
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

describe('maybeFilePath', () => {
  it('should return true for valid file paths', () => {
    expect(maybeFilePath('path/to/file.txt')).toBe(true);
    expect(maybeFilePath('C:\\path\\to\\file.txt')).toBe(true);
    expect(maybeFilePath('file.*')).toBe(true);
    expect(maybeFilePath('filename.ext')).toBe(true);
  });

  it('should return false for strings with new lines', () => {
    expect(maybeFilePath('path/to\nfile.txt')).toBe(false);
    expect(maybeFilePath('file\nname.ext')).toBe(false);
  });

  it('should return false for strings with "portkey://"', () => {
    expect(maybeFilePath('portkey://path/to/file')).toBe(false);
  });

  it('should return false for strings with "langfuse://"', () => {
    expect(maybeFilePath('langfuse://path/to/file')).toBe(false);
  });

  it('should return false for strings without file path indicators', () => {
    expect(maybeFilePath('justastring')).toBe(false);
    expect(maybeFilePath('anotherstring')).toBe(false);
    expect(maybeFilePath('stringwith.dotbutnotfile')).toBe(false);
  });

  it('should return true for strings with file:// prefix', () => {
    expect(maybeFilePath('file://path/to/file.txt')).toBe(true);
  });

  it('should return true for strings with wildcard character', () => {
    expect(maybeFilePath('*.txt')).toBe(true);
    expect(maybeFilePath('path/to/*.txt')).toBe(true);
  });

  it('should return true for strings with file extension at the third or fourth last position', () => {
    expect(maybeFilePath('filename.e')).toBe(false);
    expect(maybeFilePath('file.ext')).toBe(true);
    expect(maybeFilePath('filename.ex')).toBe(true);
    expect(maybeFilePath('file.name.ext')).toBe(true);
  });

  // Additional tests
  it('should return false for empty strings', () => {
    expect(maybeFilePath('')).toBe(false);
  });

  it('should return false for whitespace strings', () => {
    expect(maybeFilePath('   ')).toBe(false);
    expect(maybeFilePath('\t')).toBe(false);
  });

  it('should return false for non-string inputs', () => {
    expect(() => maybeFilePath(123 as never)).toThrow('Invalid input: 123');
    expect(() => maybeFilePath({} as never)).toThrow('Invalid input: {}');
    expect(() => maybeFilePath([] as never)).toThrow('Invalid input: []');
  });

  it('should return false for strings with invalid and valid indicators mixed', () => {
    expect(maybeFilePath('file://path/to\nfile.txt')).toBe(false);
    expect(maybeFilePath('path/to/file.txtportkey://')).toBe(false);
  });

  it('should return true for very long valid file paths', () => {
    const longPath = 'a/'.repeat(100) + 'file.txt';
    expect(maybeFilePath(longPath)).toBe(true);
  });

  it('should return false for very long invalid file paths', () => {
    const longInvalidPath = 'a/'.repeat(100) + 'file\n.txt';
    expect(maybeFilePath(longInvalidPath)).toBe(false);
  });
});

describe('normalizeInput', () => {
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
  });

  it('returns array with single string when input is a non-empty string', () => {
    expect(normalizeInput('valid string')).toEqual([{ raw: 'valid string' }]);
  });

  it('returns input array when input is a non-empty array', () => {
    const inputArray = ['prompt1', { raw: 'prompt2' }];
    expect(normalizeInput(inputArray)).toEqual([
      { raw: 'prompt1', source: '0' },
      { raw: 'prompt2', source: '1' },
    ]);
  });

  // NOTE: Legacy mode. This is deprecated and will be removed in a future version.
  it('normalizes object input to array of prompts', () => {
    const inputObject = {
      'prompts1.txt': 'label A',
      'prompts2.txt': 'label B',
    };
    expect(normalizeInput(inputObject)).toEqual([
      {
        label: 'label A',
        raw: 'prompts1.txt',
        source: 'prompts1.txt',
      },
      {
        label: 'label B',
        raw: 'prompts2.txt',
        source: 'prompts2.txt',
      },
    ]);
  });
});
