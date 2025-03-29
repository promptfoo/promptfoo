import * as fs from 'fs';
import { globSync } from 'glob';
import { readPrompts, readProviderPromptMap, processPrompts } from '../../src/prompts';
import { processJinjaFile } from '../../src/prompts/processors/jinja';
import { processTxtFile } from '../../src/prompts/processors/text';
import { maybeFilePath } from '../../src/prompts/utils';
import type { Prompt, ProviderResponse, UnifiedConfig } from '../../src/types';

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

jest.mock('../../src/prompts/processors/text', () => ({
  processTxtFile: jest.fn(),
}));

jest.mock('../../src/prompts/processors/jinja', () => ({
  processJinjaFile: jest.fn(),
}));

describe('readPrompts', () => {
  afterEach(() => {
    delete process.env.PROMPTFOO_STRICT_FILES;
    jest.mocked(fs.readFileSync).mockReset();
    jest.mocked(fs.statSync).mockReset();
    jest.mocked(globSync).mockReset();
    jest.mocked(maybeFilePath).mockClear();
  });

  it('should throw an error when PROMPTFOO_STRICT_FILES is true and the file does not exist', async () => {
    // Start with a clean slate by clearing all mocks
    jest.resetAllMocks();

    // Set the environment variable
    process.env.PROMPTFOO_STRICT_FILES = 'true';

    // Mock essential functions
    jest.mocked(maybeFilePath).mockReturnValue(true);
    jest.mocked(fs.existsSync).mockReturnValue(false);

    // For parsePathOrGlob behavior
    jest.mocked(fs.statSync).mockImplementation(() => {
      throw new Error("ENOENT: no such file or directory, stat 'non-existent-file.txt'");
    });

    // Now expect the error to be thrown
    await expect(async () => {
      await readPrompts('non-existent-file.txt');
    }).rejects.toThrow(/ENOENT: no such file or directory/);

    // Clean up
    delete process.env.PROMPTFOO_STRICT_FILES;
  });

  it('should read a .txt file with a single prompt', async () => {
    // Start with a clean slate by clearing all mocks
    jest.resetAllMocks();

    // Mock essential functions
    jest.mocked(maybeFilePath).mockReturnValue(true);
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as fs.Stats);

    // Mock the text processor specifically
    jest.mocked(processTxtFile).mockImplementation(async (filePath, prompt) => {
      return [
        {
          raw: 'Sample Prompt',
          label: `${filePath}: Sample Prompt`,
          config: prompt.config,
        },
      ];
    });

    // Test reading a text file
    const result = await readPrompts('prompts.txt');

    // Verify the result
    expect(result).toEqual([
      {
        label: 'prompts.txt: Sample Prompt',
        raw: 'Sample Prompt',
        config: undefined,
      },
    ]);
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
    expect(readProviderPromptMap(config, parsedPrompts)).toEqual({
      provider1: ['customPrompt1'],
    });
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

describe('processPrompts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process function prompts', async () => {
    function testFunction(vars: any) {
      return `Hello ${vars.name}`;
    }

    const result = await processPrompts([testFunction]);

    expect(result).toEqual([
      {
        raw: testFunction.toString(),
        label: 'testFunction',
        function: testFunction,
      },
    ]);
  });

  it('should process function prompts with no name', async () => {
    function promptFn(vars: any) {
      return `Hello ${vars.name}`;
    }
    Object.defineProperty(promptFn, 'name', { value: '' });

    const result = await processPrompts([promptFn]);

    expect(result).toEqual([
      {
        raw: promptFn.toString(),
        label: '',
        function: expect.any(Function),
      },
    ]);
    expect(fs.readFileSync).toHaveBeenCalledTimes(0);
  });

  it('should process string prompts by calling readPrompts', async () => {
    // Start with a clean slate by clearing all mocks
    jest.resetAllMocks();

    // Mock essential functions
    jest.mocked(maybeFilePath).mockReturnValue(true);
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as fs.Stats);

    // Mock the text processor for the expected result
    jest.mocked(processTxtFile).mockImplementation(async (filePath, prompt) => {
      return [
        {
          raw: 'test prompt',
          label: `${filePath}: test prompt`,
          config: prompt.config,
        },
      ];
    });

    // Test processing a string prompt
    const result = await processPrompts(['test.txt']);

    // Verify the result
    expect(result).toEqual([
      {
        raw: 'test prompt',
        label: 'test.txt: test prompt',
        config: undefined,
      },
    ]);
  });

  it('should process Jinja2 files', async () => {
    // Start with a clean slate by clearing all mocks
    jest.resetAllMocks();

    // Set up test data
    const jinjaContent =
      'You are a helpful assistant for {{ user }}.\nPlease provide information about {{ topic }}.';

    // Mock essential functions
    jest.mocked(maybeFilePath).mockReturnValue(true);
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as fs.Stats);

    // Mock the Jinja processor specifically
    jest.mocked(processJinjaFile).mockImplementation(async (filePath, prompt) => {
      return [
        {
          raw: jinjaContent,
          label: `${filePath}: ${jinjaContent.slice(0, 30)}...`,
          config: prompt.config,
        },
      ];
    });

    // Test processing a Jinja2 file
    const result = await processPrompts(['template.j2']);

    // Check that we get a result with the right content
    expect(result).toHaveLength(1);
    expect(result[0].raw).toEqual(jinjaContent);
    expect(result[0].config).toBeUndefined();

    // Check that the label contains the expected text but don't test exact truncation
    expect(result[0].label).toContain('template.j2: You are a helpful assistant');
  });

  it('should process valid prompt schema objects', async () => {
    const validPrompt = {
      raw: 'test prompt',
      label: 'test label',
    };

    const result = await processPrompts([validPrompt]);

    expect(result).toEqual([validPrompt]);
  });

  it('should fall back to JSON serialization for invalid prompt schema objects', async () => {
    const invalidPrompt = {
      invalidField: 'some value',
      anotherField: 123,
    };

    const result = await processPrompts([invalidPrompt]);

    expect(result).toEqual([
      {
        raw: JSON.stringify(invalidPrompt),
        label: JSON.stringify(invalidPrompt),
      },
    ]);
  });

  it('should process multiple prompts of different types', async () => {
    // Start with a clean slate by clearing all mocks
    jest.resetAllMocks();

    // Mock essential functions
    jest.mocked(maybeFilePath).mockReturnValue(true);
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as fs.Stats);

    // Mock the text processor specifically
    jest.mocked(processTxtFile).mockImplementation(async (filePath, prompt) => {
      return [
        {
          raw: 'file prompt',
          label: `${filePath}: file prompt`,
          config: prompt.config,
        },
      ];
    });

    // Set up test data
    const testFunction = function testFunction(vars) {
      return `Hello ${vars.name}`;
    };

    const validPrompt = {
      raw: 'test prompt',
      label: 'test label',
    };

    // Test processing multiple prompts of different types
    const result = await processPrompts([testFunction, 'test.txt', validPrompt]);

    // Verify the result
    expect(result).toEqual([
      {
        raw: testFunction.toString(),
        label: 'testFunction',
        function: testFunction,
      },
      {
        raw: 'file prompt',
        label: 'test.txt: file prompt',
        config: undefined,
      },
      {
        label: 'test label',
        raw: 'test prompt',
      },
    ]);
  });

  it('should flatten array results from readPrompts', async () => {
    // Start with a clean slate by clearing all mocks
    jest.resetAllMocks();

    // Mock essential functions
    jest.mocked(maybeFilePath).mockReturnValue(true);
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as fs.Stats);

    // Mock the text processor for the expected result
    jest.mocked(processTxtFile).mockImplementation(async (filePath, prompt) => {
      return [
        {
          raw: 'prompt1',
          label: `${filePath}: prompt1`,
          config: prompt.config,
        },
        {
          raw: 'prompt2',
          label: `${filePath}: prompt2`,
          config: prompt.config,
        },
      ];
    });

    // Test processing a string prompt that returns multiple prompts
    const result = await processPrompts(['test.txt']);

    // Verify the result
    expect(result).toEqual([
      { raw: 'prompt1', label: 'test.txt: prompt1', config: undefined },
      { raw: 'prompt2', label: 'test.txt: prompt2', config: undefined },
    ]);
  });
});
