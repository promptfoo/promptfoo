import dedent from 'dedent';
import * as fs from 'fs';
import { globSync } from 'glob';
import { importModule } from '../../src/esm';
import { readPrompts, readProviderPromptMap } from '../../src/prompts';
import { maybeFilePath } from '../../src/prompts/utils';
import type { ApiProvider, Prompt, ProviderResponse, UnifiedConfig } from '../../src/types';

jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

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
    existsSync: jest.fn(actual.existsSync),
    mkdirSync: jest.fn(),
    readFileSync: jest.fn(),
    statSync: jest.fn(actual.statSync),
    writeFileSync: jest.fn(),
  };
});

jest.mock('python-shell');
jest.mock('../../src/esm', () => {
  const actual = jest.requireActual('../../src/esm');
  return {
    ...actual,
    importModule: jest.fn(actual.importModule),
  };
});
jest.mock('../../src/python/wrapper');
jest.mock('../../src/prompts/utils', () => {
  const actual = jest.requireActual('../../src/prompts/utils');
  return {
    ...actual,
    maybeFilePath: jest.fn(actual.maybeFilePath),
  };
});

describe('readPrompts', () => {
  afterEach(() => {
    delete process.env.PROMPTFOO_STRICT_FILES;
    jest.mocked(fs.readFileSync).mockReset();
    jest.mocked(fs.statSync).mockReset();
    jest.mocked(globSync).mockReset();
    jest.mocked(maybeFilePath).mockClear();
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
    jest.mocked(fs.statSync).mockReturnValueOnce({ isDirectory: () => false } as fs.Stats);
    jest.mocked(fs.readFileSync).mockImplementationOnce(() => {
      throw new Error("ENOENT: no such file or directory, stat 'non-existent-file.txt'");
    });
    await expect(readPrompts('non-existent-file.txt')).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringMatching(
          /ENOENT: no such file or directory, stat '.*non-existent-file.txt'/,
        ),
      }),
    );
  });

  it('should throw an error for a .txt file with no prompts', async () => {
    jest.mocked(fs.readFileSync).mockReturnValueOnce('');
    jest.mocked(fs.statSync).mockReturnValueOnce({ isDirectory: () => false } as fs.Stats);
    await expect(readPrompts(['prompts.txt'])).rejects.toThrow(
      'There are no prompts in "prompts.txt"',
    );
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
  });

  it('should throw an error for an unsupported file format', async () => {
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
        label: 'Sample prompt A',
      },
      {
        raw: 'Sample prompt B',
        label: 'Sample prompt B',
      },
    ]);
  });

  it('should read a .txt file with a single prompt', async () => {
    jest.mocked(fs.readFileSync).mockReturnValueOnce('Sample Prompt');
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
    jest.mocked(fs.readFileSync).mockImplementation((filePath) => {
      if (filePath.toString().endsWith('prompt1.txt')) {
        return 'Test prompt 1\n---\nTest prompt 2';
      } else if (filePath.toString().endsWith('prompt2.txt')) {
        return 'Test prompt 3\n---\nTest prompt 4\n---\nTest prompt 5';
      }
      throw new Error(`Unexpected file path in test: ${filePath}`);
    });
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

  it('should read a .json file', async () => {
    const mockJsonContent = JSON.stringify([
      { name: 'You are a helpful assistant', role: 'system' },
      { name: 'How do I get to the moon?', role: 'user' },
    ]);

    jest.mocked(fs.readFileSync).mockReturnValueOnce(mockJsonContent);
    jest.mocked(fs.statSync).mockReturnValueOnce({ isDirectory: () => false } as fs.Stats);

    const filePath = 'file://path/to/mock.json';
    await expect(readPrompts([filePath])).resolves.toEqual([
      {
        raw: mockJsonContent,
        label: expect.stringContaining(`mock.json: ${mockJsonContent}`),
      },
    ]);
    expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('mock.json'), 'utf8');
    expect(fs.statSync).toHaveBeenCalledTimes(1);
  });

  it('should read a .jsonl file', async () => {
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

    jest.mocked(fs.readFileSync).mockReturnValueOnce(data.map((o) => JSON.stringify(o)).join('\n'));
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

  const yamlContent = dedent`
    - role: user
      content:
        - type: text
          text: "What's in this image?"
        - type: image_url
          image_url:
            url: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg"`;

  it('should read a .yaml file', async () => {
    const expectedJson = JSON.stringify([
      {
        role: 'user',
        content: [
          { type: 'text', text: "What's in this image?" },
          {
            type: 'image_url',
            image_url: {
              url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg',
            },
          },
        ],
      },
    ]);

    jest.mocked(fs.readFileSync).mockReturnValueOnce(yamlContent);
    jest.mocked(fs.statSync).mockReturnValueOnce({ isDirectory: () => false } as fs.Stats);

    await expect(readPrompts('prompts.yaml')).resolves.toEqual([
      {
        raw: expectedJson,
        label: expect.stringContaining(
          'prompts.yaml: [{"role":"user","content":[{"type":"text","text":"What\'s in this image?"}',
        ),
        config: undefined,
      },
    ]);
  });

  it('should read a .yml file', async () => {
    const expectedJson = JSON.stringify([
      {
        role: 'user',
        content: [
          { type: 'text', text: "What's in this image?" },
          {
            type: 'image_url',
            image_url: {
              url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg',
            },
          },
        ],
      },
    ]);

    jest.mocked(fs.readFileSync).mockReturnValueOnce(yamlContent);
    jest.mocked(fs.statSync).mockReturnValueOnce({ isDirectory: () => false } as fs.Stats);

    await expect(readPrompts('image-summary.yml')).resolves.toEqual([
      {
        raw: expectedJson,
        label: expect.stringContaining(
          'image-summary.yml: [{"role":"user","content":[{"type":"text","text":"What\'s in this image?"}',
        ),
        config: undefined,
      },
    ]);
  });

  it('should read a .py prompt object array', async () => {
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
        label: 'First prompt',
        function: expect.any(Function),
      },
      {
        raw: code,
        label: 'Second prompt',
        function: expect.any(Function),
      },
    ]);
    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
  });

  it('should read a .py file', async () => {
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

  it('should read a .js file without named function', async () => {
    const promptPath = 'prompt.js';
    const mockFunction = () => console.log('dummy prompt');

    jest.mocked(importModule).mockResolvedValueOnce(mockFunction);
    jest.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as fs.Stats);

    await expect(readPrompts(promptPath)).resolves.toEqual([
      {
        raw: "()=>console.log('dummy prompt')",
        label: 'prompt.js',
        function: expect.any(Function),
        config: {},
      },
    ]);
    expect(importModule).toHaveBeenCalledWith(promptPath, undefined);
    expect(fs.statSync).toHaveBeenCalledTimes(1);
  });

  it('should read a .js file with named function', async () => {
    const promptPath = 'prompt.js:functionName';
    const mockFunction = (context: {
      vars: Record<string, string | object>;
      provider?: ApiProvider;
    }) => 'dummy prompt result';

    jest.mocked(importModule).mockResolvedValueOnce(mockFunction);
    jest.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as fs.Stats);

    const result = await readPrompts(promptPath);
    expect(result).toEqual([
      {
        raw: String(mockFunction),
        label: 'prompt.js:functionName',
        function: expect.any(Function),
        config: {}, // Add this line
      },
    ]);

    const promptFunction = result[0].function as unknown as (context: {
      vars: Record<string, string | object>;
      provider?: ApiProvider;
    }) => string;
    expect(promptFunction({ vars: {}, provider: { id: () => 'foo' } as ApiProvider })).toBe(
      'dummy prompt result',
    );

    expect(importModule).toHaveBeenCalledWith('prompt.js', 'functionName');
    expect(fs.statSync).toHaveBeenCalledTimes(1);
  });

  it('should read a directory', async () => {
    jest.mocked(fs.statSync).mockImplementation((filePath) => {
      if (filePath.toString().endsWith('prompt1.txt')) {
        return { isDirectory: () => false } as fs.Stats;
      } else if (filePath.toString().endsWith('prompts')) {
        return { isDirectory: () => true } as fs.Stats;
      }
      throw new Error(`Unexpected file path in test: ${filePath}`);
    });
    jest.mocked(globSync).mockImplementation(() => ['prompt1.txt', 'prompt2.txt']);
    // The mocked paths here are an artifact of our globSync mock. In a real
    // world setting we would get back `prompts/prompt1.txt` instead of `prompts/*/prompt1.txt`
    // but for the sake of this test we are just going to pretend that the globSync
    // mock is doing the right thing and giving us back the right paths.
    jest.mocked(fs.readFileSync).mockImplementation((filePath) => {
      if (
        filePath.toString().endsWith('prompt1.txt') ||
        filePath.toString().endsWith('*/prompt1.txt')
      ) {
        return 'Test prompt 1\n---\nTest prompt 2';
      } else if (
        filePath.toString().endsWith('prompt2.txt') ||
        filePath.toString().endsWith('*/prompt2.txt')
      ) {
        return 'Test prompt 3\n---\nTest prompt 4\n---\nTest prompt 5';
      }
      throw new Error(`Unexpected file path in test: ${filePath}`);
    });
    await expect(readPrompts(['prompts/*'])).resolves.toEqual([
      {
        label: expect.stringMatching('prompt1.txt: Test prompt 1'),
        raw: 'Test prompt 1',
      },
      {
        label: expect.stringMatching('prompt1.txt: Test prompt 2'),
        raw: 'Test prompt 2',
      },
      {
        label: expect.stringMatching('prompt2.txt: Test prompt 3'),
        raw: 'Test prompt 3',
      },
      {
        label: expect.stringMatching('prompt2.txt: Test prompt 4'),
        raw: 'Test prompt 4',
      },
      {
        label: expect.stringMatching('prompt2.txt: Test prompt 5'),
        raw: 'Test prompt 5',
      },
    ]);
    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    expect(fs.statSync).toHaveBeenCalledTimes(3);
  });

  it('should fall back to a string if maybeFilePath is true but a file does not exist', async () => {
    jest.mocked(globSync).mockReturnValueOnce([]);
    jest.mocked(maybeFilePath).mockReturnValueOnce(true);
    await expect(readPrompts('non-existent-file.txt*')).resolves.toEqual([
      { raw: 'non-existent-file.txt*', label: 'non-existent-file.txt*' },
    ]);
  });

  it('should handle a prompt with a function', async () => {
    const promptWithFunction: Partial<Prompt> = {
      raw: 'dummy raw text',
      label: 'Function Prompt',
      function: jest.fn().mockResolvedValue('Hello, world!'),
    };

    await expect(readPrompts([promptWithFunction])).resolves.toEqual([
      {
        raw: 'dummy raw text',
        label: 'Function Prompt',
        function: expect.any(Function),
      },
    ]);
    expect(promptWithFunction.function).not.toHaveBeenCalled();
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
    expect(readProviderPromptMap(config, parsedPrompts)).toEqual({});
  });

  it('should return a map with all prompts if config.providers is a string', () => {
    config = { providers: 'provider1' };
    expect(readProviderPromptMap(config, parsedPrompts)).toEqual({
      provider1: ['prompt1', 'prompt2'],
    });
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

  it('should use rawProvider.prompts if provided for provider objects with id', () => {
    config = {
      providers: [{ id: 'provider1', prompts: ['customPrompt1'] }],
    };
    expect(readProviderPromptMap(config, parsedPrompts)).toEqual({ provider1: ['customPrompt1'] });
  });

  it('should fall back to allPrompts if no prompts provided for provider objects with id', () => {
    config = {
      providers: [{ id: 'provider1' }],
    };
    expect(readProviderPromptMap(config, parsedPrompts)).toEqual({
      provider1: ['prompt1', 'prompt2'],
    });
  });

  it('should use rawProvider.prompts for both id and label if provided', () => {
    config = {
      providers: [{ id: 'provider1', label: 'providerLabel', prompts: ['customPrompt1'] }],
    };
    expect(readProviderPromptMap(config, parsedPrompts)).toEqual({
      provider1: ['customPrompt1'],
      providerLabel: ['customPrompt1'],
    });
  });

  it('should fall back to allPrompts for both id and label if no prompts provided', () => {
    config = {
      providers: [{ id: 'provider1', label: 'providerLabel' }],
    };
    expect(readProviderPromptMap(config, parsedPrompts)).toEqual({
      provider1: ['prompt1', 'prompt2'],
      providerLabel: ['prompt1', 'prompt2'],
    });
  });

  it('should use providerObject.id from ProviderOptionsMap when provided', () => {
    config = {
      providers: [
        {
          originalProvider: {
            id: 'explicitId',
            prompts: ['customPrompt1'],
          },
        },
      ],
    };
    expect(readProviderPromptMap(config, parsedPrompts)).toEqual({ explicitId: ['customPrompt1'] });
  });

  it('should fallback to originalId when providerObject.id is not specified in ProviderOptionsMap', () => {
    config = {
      providers: [
        {
          originalProvider: {
            // 'originalProvider' is treated as originalId
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
