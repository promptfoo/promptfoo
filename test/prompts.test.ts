import * as fs from 'fs';
import * as path from 'path';
import dedent from 'dedent';
import { importModule } from '../src/esm';

import { globSync } from 'glob';

import { readProviderPromptMap, maybeFilePath, normalizeInput, readPrompts } from '../src/prompts';

import type { Prompt, ProviderResponse, UnifiedConfig } from '../src/types';

jest.mock('../src/esm');

jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../src/esm', () => {
  const actual = jest.requireActual('../src/esm');
  return {
    ...actual,
    importModule: jest.fn(actual.importModule),
  };
});

jest.mock('glob', () => {
  const actual = jest.requireActual('glob');
  return {
    ...actual,
    globSync: jest.fn(actual.globSync),
  };
});

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    statSync: jest.fn(actual.statSync),
    readdirSync: jest.fn(actual.readdirSync),
    existsSync: jest.fn(actual.existsSync),
    mkdirSync: jest.fn(),
  };
});

jest.mock('../src/database');

describe('readPrompts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.PROMPTFOO_STRICT_FILES;
    jest.clearAllMocks();
  });

  it('should throw an error for invalid inputs', async () => {
    await expect(readPrompts(null as any)).rejects.toThrow('Invalid input prompt: null');
    await expect(readPrompts(undefined as any)).rejects.toThrow('Invalid input prompt: undefined');
    await expect(readPrompts(1 as any)).rejects.toThrow('Invalid input prompt: 1');
    await expect(readPrompts(true as any)).rejects.toThrow('Invalid input prompt: true');
    await expect(readPrompts(false as any)).rejects.toThrow('Invalid input prompt: false');
  });

  it('should throw an error for empty inputs', async () => {
    await expect(readPrompts([])).rejects.toThrow('Invalid input prompt: []');
    await expect(readPrompts({} as any)).rejects.toThrow('Invalid input prompt: {}');
    await expect(readPrompts('')).rejects.toThrow('Invalid input prompt: ""');
  });

  it('should throw an error when PROMPTFOO_STRICT_FILES is true and the file does not exist', async () => {
    process.env.PROMPTFOO_STRICT_FILES = 'true';
    await expect(readPrompts('non-existent-file.txt')).rejects.toThrow(
      "ENOENT: no such file or directory, stat 'non-existent-file.txt'",
    );
    delete process.env.PROMPTFOO_STRICT_FILES;
  });

  it('should throw an error for a .txt file with no prompts', async () => {
    jest.mocked(fs.readFileSync).mockReturnValue('');
    jest.mocked(fs.statSync).mockReturnValueOnce({ isDirectory: () => false } as fs.Stats);
    await expect(readPrompts(['prompts.txt'])).rejects.toThrow(
      'There are no prompts in "prompts.txt"',
    );
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
  });

  it('should throw an error for an unsupported file format', async () => {
    jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ id: 'test prompt' }));
    jest.mocked(fs.statSync).mockReturnValueOnce({ isDirectory: () => false } as fs.Stats);
    await expect(readPrompts(['unsupported.for.mat'])).rejects.toThrow(
      'There are no prompts in "unsupported.for.mat"',
    );
    expect(fs.readFileSync).toHaveBeenCalledTimes(0);
  });

  it('should read a single prompt', async () => {
    const prompt = 'This is a test prompt';
    await expect(readPrompts(prompt)).resolves.toEqual([
      {
        raw: prompt,
        label: prompt,
      },
    ]);
  });

  it('should read a list of prompts', async () => {
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

  it('should read a .txt file with a single prompt', async () => {
    jest.mocked(fs.readFileSync).mockReturnValue('Sample Prompt');
    jest.mocked(fs.statSync).mockReturnValueOnce({ isDirectory: () => false } as fs.Stats);
    await expect(readPrompts('prompts.txt')).resolves.toEqual([
      {
        label: 'prompts.txt: Sample Prompt',
        raw: 'Sample Prompt',
      },
    ]);
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
  });

  it.each([['prompts.txt'], 'prompts.txt'])(
    `should read a single prompt file with input:%p`,
    async (promptPath) => {
      jest.mocked(fs.statSync).mockReturnValueOnce({ isDirectory: () => false } as fs.Stats);
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

  it('should read multiple prompt files', async () => {
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

  it('should read with map input', async () => {
    jest.mocked(fs.readFileSync).mockReturnValue('some raw text');
    jest.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as fs.Stats);
    await expect(
      readPrompts({
        'prompts.txt': 'foo1',
        'prompts2.txt': 'foo2',
      }),
    ).resolves.toEqual([
      { raw: 'some raw text', label: 'foo1: prompts.txt: some raw text' },
      { raw: 'some raw text', label: 'foo2: prompts2.txt: some raw text' },
    ]);
    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
  });

  it('should read with JSONL file', async () => {
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
    jest.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as fs.Stats);
    await expect(readPrompts(['prompts.jsonl'])).resolves.toEqual([
      {
        raw: JSON.stringify(data[0]),
        label: `prompts.jsonl: ${JSON.stringify(data[0])}`,
      },
      {
        raw: JSON.stringify(data[1]),
        label: `prompts.jsonl: ${JSON.stringify(data[1])}`,
      },
    ]);
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
  });

  it('should read with .py file', async () => {
    const code = `print('dummy prompt')`;
    jest.mocked(fs.readFileSync).mockReturnValue(code);
    await expect(readPrompts('prompt.py')).resolves.toEqual([
      {
        function: expect.any(Function),
        label: `prompt.py: ${code}`,
        raw: code,
      },
    ]);
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
  });

  it('should read with Prompt object array', async () => {
    const prompts = [
      { id: 'prompts.py:prompt1', label: 'First prompt' },
      { id: 'prompts.py:prompt2', label: 'Second prompt' },
    ];

    const code = dedent`
      def prompt1:
        return 'First prompt'
      def prompt2:
        return 'Second prompt'
      `;
    jest.mocked(fs.readFileSync).mockReturnValue(code);
    await expect(readPrompts(prompts)).resolves.toEqual([
      {
        raw: code,
        label: expect.stringMatching(/\First prompt: prompts.py:prompt1/),
        function: expect.any(Function),
      },
      {
        raw: code,
        label: expect.stringMatching(/\bSecond prompt: prompts.py:prompt2/),
        function: expect.any(Function),
      },
    ]);
    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
  });

  it('should read with .js file without named function', async () => {
    const promptPath = 'prompt.js';
    const mockFunction = () => console.log('dummy prompt');

    jest.mocked(importModule).mockResolvedValueOnce(mockFunction);
    jest.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as fs.Stats);

    await expect(readPrompts(promptPath)).resolves.toEqual([
      {
        raw: "()=>console.log('dummy prompt')",
        label: "prompt.js:()=>console.log('dummy prompt')",
        function: mockFunction,
      },
    ]);
    expect(importModule).toHaveBeenCalledWith(promptPath, undefined);
    expect(fs.statSync).toHaveBeenCalledTimes(1);
  });

  it('should import and execute a named function within a JavaScript file', async () => {
    const promptPath = 'prompt.js:functionName';
    const functionName = 'functionName';
    const mockFunction = jest.fn(() => 'dummy prompt result');

    jest.mocked(importModule).mockResolvedValueOnce(mockFunction);
    jest.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as fs.Stats);

    const result = await readPrompts(promptPath);
    expect(result).toEqual([
      {
        raw: String(mockFunction),
        label: 'prompt.js:functionName',
        function: mockFunction,
      },
    ]);

    const promptFunction = result[0].function as unknown as () => string;
    expect(promptFunction()).toBe('dummy prompt result');

    expect(importModule).toHaveBeenCalledWith(promptPath, functionName);
    expect(fs.statSync).toHaveBeenCalledTimes(1);
  });

  it('should read a directory', async () => {
    jest.mocked(fs.statSync).mockReturnValue({
      isDirectory: () => true,
    } as fs.Stats);
    jest.mocked(globSync).mockImplementation((pathOrGlob) => [pathOrGlob].flat());
    jest.mocked(fs.readdirSync).mockReturnValue(['prompt1.txt', 'prompt2.txt']);
    // The mocked paths here are an artifact of our globSync mock. In a real
    // world setting we would get back `prompts/prompt1.txt` instead of `prompts/*/prompt1.txt`
    // but for the sake of this test we are just going to pretend that the globSync
    // mock is doing the right thing and giving us back the right paths.
    jest.mocked(fs.readFileSync).mockImplementation((filePath) => {
      if (
        filePath.toString().endsWith(path.join('prompts', 'prompt1.txt')) ||
        filePath.toString().endsWith(path.join('prompts', '*/prompt1.txt'))
      ) {
        return 'Test prompt 1\n---\nTest prompt 2';
      } else if (
        filePath.toString().endsWith(path.join('prompts', 'prompt2.txt')) ||
        filePath.toString().endsWith(path.join('prompts', '*/prompt2.txt'))
      ) {
        return 'Test prompt 3\n---\nTest prompt 4\n---\nTest prompt 5';
      }
      throw new Error(`Unexpected file path in test: ${filePath}`);
    });
    await expect(readPrompts(['prompts/*'])).resolves.toEqual([
      {
        label: 'prompts/*/prompt1.txt: Test prompt 1',
        raw: 'Test prompt 1',
      },
      {
        label: 'prompts/*/prompt1.txt: Test prompt 2',
        raw: 'Test prompt 2',
      },
      {
        label: 'prompts/*/prompt2.txt: Test prompt 3',
        raw: 'Test prompt 3',
      },
      {
        label: 'prompts/*/prompt2.txt: Test prompt 4',
        raw: 'Test prompt 4',
      },
      {
        label: 'prompts/*/prompt2.txt: Test prompt 5',
        raw: 'Test prompt 5',
      },
    ]);
    expect(fs.readdirSync).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    expect(fs.statSync).toHaveBeenCalledTimes(3);
  });

  it('should read with glob pattern for .txt files', async () => {
    const fileContents: Record<string, string> = {
      '1.txt': 'First text file content',
      '2.txt': 'Second text file content',
    };

    jest.mocked(fs.readFileSync).mockImplementation((path: fs.PathOrFileDescriptor) => {
      if (path.toString().includes('1.txt')) {
        return fileContents['1.txt'];
      } else if (path.toString().includes('2.txt')) {
        return fileContents['2.txt'];
      }
      throw new Error(`Unexpected file path in test: ${path}`);
    });
    jest.mocked(fs.readdirSync).mockImplementation((path: fs.PathLike) => {
      if (path.toString().includes('prompts')) {
        return ['prompt1.txt', 'prompt2.txt'];
      }
      throw new Error(`Unexpected directory path in test ${path}`);
    });
    jest.mocked(fs.statSync).mockImplementation((path: fs.PathLike) => {
      const stats = new fs.Stats();
      stats.isDirectory = () => path.toString().includes('prompts');
      return stats;
    });
    await expect(readPrompts(['file://./prompts/*.txt'])).resolves.toEqual([
      {
        raw: fileContents['1.txt'],
        label: `/prompts/*.txt/prompt1.txt: ${fileContents['1.txt']}`,
      },
      {
        raw: fileContents['2.txt'],
        label: `/prompts/*.txt/prompt2.txt: ${fileContents['2.txt']}`,
      },
    ]);
    expect(fs.readdirSync).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    expect(fs.statSync).toHaveBeenCalledTimes(3);
  });
});

describe('readProviderPromptMap', () => {
  let config: Partial<UnifiedConfig>;
  let parsedPrompts: Prompt[];

  beforeEach(() => {
    parsedPrompts = [
      { label: 'prompt1', raw: 'prompt1' },
      { label: 'prompt2', raw: 'prompt2' },
    ];
  });

  it('should return an empty object if config.providers is undefined', () => {
    config = {};
    const result = readProviderPromptMap(config, parsedPrompts);
    expect(result).toEqual({});
  });

  it('should return a map with all prompts if config.providers is a string', () => {
    config = { providers: 'provider1' };
    const result = readProviderPromptMap(config, parsedPrompts);
    expect(result).toEqual({ provider1: ['prompt1', 'prompt2'] });
  });

  it('should return a map with all prompts if config.providers is a function', () => {
    config = {
      providers: () =>
        Promise.resolve({
          providerName: 'Custom function',
          prompts: ['prompt1', 'prompt2'],
        }) as Promise<ProviderResponse>,
    };
    expect(readProviderPromptMap(config, parsedPrompts)).toEqual({
      'Custom function': ['prompt1', 'prompt2'],
    });
  });

  it('should handle provider objects with id and prompts', () => {
    config = {
      providers: [{ id: 'provider1', prompts: ['customPrompt1'] }],
    };
    expect(readProviderPromptMap(config, parsedPrompts)).toEqual({ provider1: ['customPrompt1'] });
  });

  it('should handle provider objects with id, label, and prompts', () => {
    config = {
      providers: [{ id: 'provider1', label: 'providerLabel', prompts: ['customPrompt1'] }],
    };
    expect(readProviderPromptMap(config, parsedPrompts)).toEqual({
      provider1: ['customPrompt1'],
      providerLabel: ['customPrompt1'],
    });
  });

  it('should handle provider options map with id and prompts', () => {
    config = {
      providers: [
        {
          originalProvider: {
            id: 'provider1',
            prompts: ['customPrompt1'],
          },
        },
      ],
    };
    expect(readProviderPromptMap(config, parsedPrompts)).toEqual({ provider1: ['customPrompt1'] });
  });

  it('should handle provider options map without id and use original id', () => {
    config = {
      providers: [
        {
          originalProvider: {
            prompts: ['customPrompt1'],
          },
        },
      ],
    };
    expect(readProviderPromptMap(config, parsedPrompts)).toEqual({
      originalProvider: ['customPrompt1'],
    });
  });
});

describe('maybeFilePath', () => {
  it('should return true for valid file paths', () => {
    expect(maybeFilePath('C:\\path\\to\\file.txt')).toBe(true);
    expect(maybeFilePath('file.*')).toBe(true);
    expect(maybeFilePath('filename.ext')).toBe(true);
    expect(maybeFilePath('path/to/file.txt')).toBe(true);
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
    expect(maybeFilePath('anotherstring')).toBe(false);
    expect(maybeFilePath('justastring')).toBe(false);
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
    expect(maybeFilePath('file.ext')).toBe(true);
    expect(maybeFilePath('file.name.ext')).toBe(true);
    expect(maybeFilePath('filename.e')).toBe(false);
    expect(maybeFilePath('filename.ex')).toBe(true);
  });

  it('should work for files that end with specific allowed extensions', () => {
    expect(maybeFilePath('filename.cjs')).toBe(true);
    expect(maybeFilePath('filename.js')).toBe(true);
    expect(maybeFilePath('filename.js:functionName')).toBe(true);
    expect(maybeFilePath('filename.json')).toBe(true);
    expect(maybeFilePath('filename.jsonl')).toBe(true);
    expect(maybeFilePath('filename.mjs')).toBe(true);
    expect(maybeFilePath('filename.py')).toBe(true);
    expect(maybeFilePath('filename.py:functionName')).toBe(true);
    expect(maybeFilePath('filename.txt')).toBe(true);
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
  it('returns array of prompts when input is an object', () => {
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
