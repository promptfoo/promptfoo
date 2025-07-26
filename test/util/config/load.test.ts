import * as fs from 'fs';
import * as path from 'path';

import $RefParser from '@apidevtools/json-schema-ref-parser';
import { globSync } from 'glob';
import yaml from 'js-yaml';
import cliState from '../../../src/cliState';
import { isCI } from '../../../src/envars';
import { importModule } from '../../../src/esm';
import logger from '../../../src/logger';
import { readPrompts } from '../../../src/prompts';
import { loadApiProviders } from '../../../src/providers';
import { type UnifiedConfig } from '../../../src/types';
import { isRunningUnderNpx } from '../../../src/util';
import {
  combineConfigs,
  dereferenceConfig,
  readConfig,
  resolveConfigs,
} from '../../../src/util/config/load';
import { maybeLoadFromExternalFile } from '../../../src/util/file';
import { readTests } from '../../../src/util/testCaseReader';

jest.mock('../../../src/database', () => ({
  getDb: jest.fn(),
}));

jest.mock('fs');

jest.mock('glob', () => ({
  globSync: jest.fn(),
}));

jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../src/envars', () => {
  const originalModule = jest.requireActual('../../../src/envars');
  return {
    ...originalModule,
    getEnvBool: jest.fn(),
    isCI: jest.fn(),
  };
});

jest.mock('../../../src/esm', () => ({
  importModule: jest.fn(),
}));

jest.mock('../../../src/logger', () => ({
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
}));

jest.mock('../../../src/util', () => ({
  ...jest.requireActual('../../../src/util'),
  isRunningUnderNpx: jest.fn(),
}));

jest.mock('../../../src/util/file', () => ({
  ...jest.requireActual('../../../src/util/file'),
  maybeLoadFromExternalFile: jest.fn((x) => x),
  readFilters: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../../src/util/testCaseReader', () => ({
  readTest: jest.fn().mockImplementation(async (test, basePath, isDefaultTest) => {
    // For defaultTest, just return the test as-is since it doesn't need validation
    if (isDefaultTest) {
      return test;
    }
    // For regular tests, just return the test
    return test;
  }),
  readTests: jest.fn().mockImplementation(async (tests) => {
    if (!tests) {
      return [];
    }
    if (Array.isArray(tests)) {
      return tests;
    }
    return [];
  }),
}));

jest.mock('../../../src/providers', () => ({
  ...jest.requireActual('../../../src/providers'),
  loadApiProviders: jest.fn().mockImplementation(async (providers) => {
    return providers.map((p: any) => ({
      id: () => (typeof p === 'string' ? p : p.id),
      label: typeof p === 'string' ? p : p.label || p.id,
      config: typeof p === 'object' ? p.config : {},
    }));
  }),
}));

jest.mock('../../../src/util/templates', () => ({
  extractVariablesFromTemplate: jest.fn().mockReturnValue([]),
  getNunjucksEngine: jest.fn().mockReturnValue({
    renderString: jest.fn().mockImplementation((str) => str),
  }),
}));

jest.mock('../../../src/prompts', () => ({
  readPrompts: jest.fn().mockImplementation(async (prompts) => {
    if (!prompts) {
      return [];
    }
    if (Array.isArray(prompts)) {
      return prompts.map((p, idx) => ({
        raw: typeof p === 'string' ? p : p.raw || '',
        label: typeof p === 'string' ? `Prompt ${idx + 1}` : p.label || `Prompt ${idx + 1}`,
        config: {},
        metrics: {
          score: 0,
          testPassCount: 0,
          testFailCount: 0,
          testErrorCount: 0,
          assertPassCount: 0,
          assertFailCount: 0,
          totalLatencyMs: 0,
          tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 },
          namedScores: {},
          namedScoresCount: {},
          cost: 0,
        },
      }));
    }
    return [];
  }),
  readProviderPromptMap: jest.fn().mockReturnValue({}),
}));

jest.mock('../../../src/assertions', () => ({
  validateAssertions: jest.fn(),
}));

describe('combineConfigs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    jest.spyOn(process, 'cwd').mockReturnValue('/mock/cwd');
    jest.mocked(globSync).mockImplementation((pathOrGlob) => {
      const filePart =
        typeof pathOrGlob === 'string'
          ? path.basename(pathOrGlob)
          : Array.isArray(pathOrGlob)
            ? path.basename(pathOrGlob[0])
            : pathOrGlob;
      return [filePart];
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads from existing configs', async () => {
    const config1 = {
      description: 'test1',
      tags: { tag1: 'value1' },
      providers: ['provider1'],
      prompts: ['prompt1'],
      tests: ['test1'],
      scenarios: ['scenario1'],
      defaultTest: {
        description: 'defaultTest1',
        metadata: {},
        vars: { var1: 'value1' },
        assert: [{ type: 'equals', value: 'expected1' }],
      },
      nunjucksFilters: { filter1: 'filter1' },
      redteam: {
        plugins: ['plugin1'],
        strategies: ['strategy1'],
      },
      env: { envVar1: 'envValue1' },
      evaluateOptions: { maxConcurrency: 1 },
      outputPath: [],
      commandLineOptions: { verbose: true },
      sharing: false,
    };
    const config2 = {
      description: 'test2',
      providers: ['provider2'],
      prompts: ['prompt2'],
      tests: ['test2'],
      scenarios: ['scenario2'],
      defaultTest: {
        description: 'defaultTest2',
        metadata: {},
        vars: { var2: 'value2' },
        assert: [{ type: 'equals', value: 'expected2' }],
      },
      nunjucksFilters: { filter2: 'filter2' },
      redteam: {
        plugins: ['plugin2'],
        strategies: [],
      },
      env: { envVar2: 'envValue2' },
      evaluateOptions: { maxConcurrency: 2 },
      outputPath: [],
      commandLineOptions: { verbose: false },
      sharing: true,
    };

    jest
      .mocked(fs.readFileSync)
      .mockImplementation(
        (
          path: fs.PathOrFileDescriptor,
          options?: fs.ObjectEncodingOptions | BufferEncoding | null,
        ): string | Buffer => {
          if (typeof path === 'string' && path === 'config1.json') {
            return JSON.stringify(config1);
          } else if (typeof path === 'string' && path === 'config2.json') {
            return JSON.stringify(config2);
          }
          return Buffer.from('');
        },
      )
      .mockReturnValueOnce(JSON.stringify(config1))
      .mockReturnValueOnce(JSON.stringify(config2))
      .mockReturnValueOnce(JSON.stringify(config1))
      .mockReturnValueOnce(JSON.stringify(config2))
      .mockReturnValue(Buffer.from(''));

    jest.mocked(fs.readdirSync).mockReturnValue([]);
    jest.mocked(fs.statSync).mockImplementation(() => {
      throw new Error('File does not exist');
    });

    const config1Result = await combineConfigs(['config1.json']);
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config1.json'),
      expect.anything(),
    );

    expect(config1Result).toEqual({
      description: 'test1',
      tags: { tag1: 'value1' },
      providers: ['provider1'],
      prompts: ['prompt1'],
      extensions: [],
      tests: ['test1'],
      scenarios: ['scenario1'],
      defaultTest: {
        description: 'defaultTest1',
        metadata: {},
        options: {},
        vars: { var1: 'value1' },
        assert: [{ type: 'equals', value: 'expected1' }],
      },
      nunjucksFilters: { filter1: 'filter1' },
      derivedMetrics: undefined,
      redteam: {
        plugins: ['plugin1'],
        strategies: ['strategy1'],
      },
      env: { envVar1: 'envValue1' },
      evaluateOptions: { maxConcurrency: 1 },
      outputPath: [],
      commandLineOptions: { verbose: true },
      metadata: {},
      sharing: false,
    });

    const config2Result = await combineConfigs(['config2.json']);
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config2.json'),
      expect.anything(),
    );

    expect(config2Result).toEqual({
      description: 'test2',
      tags: {},
      providers: ['provider2'],
      prompts: ['prompt2'],
      extensions: [],
      tests: ['test2'],
      scenarios: ['scenario2'],
      defaultTest: {
        description: 'defaultTest2',
        metadata: {},
        options: {},
        vars: { var2: 'value2' },
        assert: [{ type: 'equals', value: 'expected2' }],
      },
      nunjucksFilters: { filter2: 'filter2' },
      derivedMetrics: undefined,
      redteam: {
        plugins: ['plugin2'],
        strategies: [],
      },
      env: { envVar2: 'envValue2' },
      evaluateOptions: { maxConcurrency: 2 },
      outputPath: [],
      commandLineOptions: { verbose: false },
      metadata: {},
      sharing: true,
    });

    const result = await combineConfigs(['config1.json', 'config2.json']);
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config1.json'),
      expect.anything(),
    );
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config2.json'),
      expect.anything(),
    );

    expect(fs.readFileSync).toHaveBeenCalledTimes(4);
    expect(result).toEqual({
      description: 'test1, test2',
      tags: { tag1: 'value1' },
      providers: ['provider1', 'provider2'],
      prompts: ['prompt1', 'prompt2'],
      tests: ['test1', 'test2'],
      extensions: [],
      scenarios: ['scenario1', 'scenario2'],
      defaultTest: {
        description: 'defaultTest2',
        metadata: {},
        options: {},
        vars: { var1: 'value1', var2: 'value2' },
        assert: [
          { type: 'equals', value: 'expected1' },
          { type: 'equals', value: 'expected2' },
        ],
      },
      nunjucksFilters: { filter1: 'filter1', filter2: 'filter2' },
      derivedMetrics: undefined,
      redteam: {
        plugins: ['plugin1', 'plugin2'],
        strategies: ['strategy1'],
      },
      env: { envVar1: 'envValue1', envVar2: 'envValue2' },
      evaluateOptions: { maxConcurrency: 2 },
      outputPath: [],
      commandLineOptions: { verbose: false },
      metadata: {},
      sharing: false,
    });
  });

  it('combines configs with provider-specific prompts', async () => {
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockImplementation((path: fs.PathOrFileDescriptor) => {
      if (typeof path === 'string' && path.endsWith('config.json')) {
        return JSON.stringify({
          prompts: [
            { id: 'file://prompt1.txt', label: 'My first prompt' },
            { id: 'file://prompt2.txt', label: 'My second prompt' },
          ],
          providers: [
            {
              id: 'openai:gpt-4o-mini',
              prompts: ['My first prompt', 'My second prompt'],
            },
            {
              id: 'openai:gpt-4',
              prompts: ['My first prompt'],
            },
          ],
          tests: [{ vars: { topic: 'bananas' } }],
        });
      }
      return Buffer.from('');
    });

    const result = await combineConfigs(['config.json']);
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config.json'),
      expect.anything(),
    );

    // Check that the prompts have the right structure but don't verify exact path format
    expect(result.prompts).toHaveLength(2);

    // Use type assertions to handle the array elements
    const prompts = result.prompts as Array<{ id?: string; label: string }>;

    expect(prompts[0]).toEqual(
      expect.objectContaining({
        label: 'My first prompt',
      }),
    );
    expect(typeof prompts[0].id).toBe('string');
    // Check the file:// URL format
    expect(prompts[0].id).toMatch(/^file:\/\//);
    expect(prompts[0].id).toMatch(/prompt1\.txt$/);

    expect(prompts[1]).toEqual(
      expect.objectContaining({
        label: 'My second prompt',
      }),
    );
    expect(typeof prompts[1].id).toBe('string');
    // Check the file:// URL format
    expect(prompts[1].id).toMatch(/^file:\/\//);
    expect(prompts[1].id).toMatch(/prompt2\.txt$/);

    expect(result.providers).toEqual([
      {
        id: 'openai:gpt-4o-mini',
        prompts: ['My first prompt', 'My second prompt'],
      },
      {
        id: 'openai:gpt-4',
        prompts: ['My first prompt'],
      },
    ]);

    expect(Array.isArray(result.tests)).toBe(true);
    // Use type assertion after confirming it's an array
    const tests = result.tests as any[];
    expect(tests).toHaveLength(1);
    expect(tests[0]).toEqual({ vars: { topic: 'bananas' } });
  });

  it('throws error for unsupported configuration file format', async () => {
    jest.mocked(fs.existsSync).mockReturnValue(true);

    await expect(combineConfigs(['config1.unsupported'])).rejects.toThrow(
      'Unsupported configuration file format: .unsupported',
    );
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config1.unsupported'),
      expect.anything(),
    );
  });

  it('makeAbsolute should resolve file:// syntax and plaintext prompts', async () => {
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest
      .mocked(fs.readFileSync)
      .mockImplementation(
        (
          path: fs.PathOrFileDescriptor,
          options?: fs.ObjectEncodingOptions | BufferEncoding | null,
        ): string | Buffer => {
          if (typeof path === 'string' && path.endsWith('config1.json')) {
            return JSON.stringify({
              description: 'test1',
              prompts: ['file://prompt1.txt', 'prompt2'],
            });
          } else if (typeof path === 'string' && path.endsWith('config2.json')) {
            return JSON.stringify({
              description: 'test2',
              prompts: ['file://prompt3.txt', 'prompt4'],
            });
          }
          return Buffer.from('');
        },
      );

    const configPaths = ['config1.json', 'config2.json'];
    const result = await combineConfigs(configPaths);
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config1.json'),
      expect.anything(),
    );
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config2.json'),
      expect.anything(),
    );

    // Check that we have the expected number of prompts
    expect(result.prompts).toHaveLength(4);

    // Validate that each prompt has the expected format
    const prompts = result.prompts as string[];

    // Check first prompt - should be a file:// URL ending with prompt1.txt
    expect(prompts[0]).toMatch(/^file:\/\//);
    expect(prompts[0]).toMatch(/prompt1\.txt$/);

    // Check second prompt - should be plain string
    expect(prompts[1]).toBe('prompt2');

    // Check third prompt - should be a file:// URL ending with prompt3.txt
    expect(prompts[2]).toMatch(/^file:\/\//);
    expect(prompts[2]).toMatch(/prompt3\.txt$/);

    // Check fourth prompt - should be plain string
    expect(prompts[3]).toBe('prompt4');
  });

  it('de-duplicates prompts when reading configs', async () => {
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest
      .mocked(fs.readFileSync)
      .mockImplementation(
        (
          path: fs.PathOrFileDescriptor,
          options?: fs.ObjectEncodingOptions | BufferEncoding | null,
        ): string | Buffer => {
          if (typeof path === 'string' && path.endsWith('config1.json')) {
            return JSON.stringify({
              description: 'test1',
              prompts: ['prompt1', 'file://prompt2.txt', 'prompt3'],
            });
          } else if (typeof path === 'string' && path.endsWith('config2.json')) {
            return JSON.stringify({
              description: 'test2',
              prompts: ['prompt3', 'file://prompt2.txt', 'prompt4'],
            });
          }
          return Buffer.from('');
        },
      );

    const configPaths = ['config1.json', 'config2.json'];
    const result = await combineConfigs(configPaths);
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config1.json'),
      expect.anything(),
    );
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config2.json'),
      expect.anything(),
    );

    // Check that we have the expected number of prompts
    expect(result.prompts).toHaveLength(4);

    // Validate that each prompt has the expected format
    const prompts = result.prompts as string[];

    // Check prompts
    expect(prompts[0]).toBe('prompt1');

    // Check the file:// URL
    expect(prompts[1]).toMatch(/^file:\/\//);
    expect(prompts[1]).toMatch(/prompt2\.txt$/);

    expect(prompts[2]).toBe('prompt3');
    expect(prompts[3]).toBe('prompt4');
  });

  it('merges metadata correctly', async () => {
    const config1 = {
      defaultTest: {
        metadata: { key1: 'value1' },
      },
    };
    const config2 = {
      defaultTest: {
        metadata: { key2: 'value2' },
      },
    };

    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify(config1))
      .mockReturnValueOnce(JSON.stringify(config2));

    const result = await combineConfigs(['config1.json', 'config2.json']);
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config1.json'),
      expect.anything(),
    );
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config2.json'),
      expect.anything(),
    );

    expect(typeof result.defaultTest).toBe('object');
    expect(result.defaultTest).toBeDefined();
    // Type assertion since we've verified it's an object above
    const defaultTest = result.defaultTest as { metadata?: Record<string, any> };
    expect(defaultTest.metadata).toEqual({
      key1: 'value1',
      key2: 'value2',
    });
  });

  it('combines extensions from multiple configs', async () => {
    const config1 = {
      extensions: ['extension1', 'extension2'],
    };
    const config2 = {
      extensions: ['extension3'],
    };

    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify(config1))
      .mockReturnValueOnce(JSON.stringify(config2));
    jest.spyOn(console, 'warn').mockImplementation();

    const result = await combineConfigs(['config1.json', 'config2.json']);
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config1.json'),
      expect.anything(),
    );
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config2.json'),
      expect.anything(),
    );

    expect(result.extensions).toEqual(['extension1', 'extension2', 'extension3']);
  });

  it('handles configs without extensions', async () => {
    const config1 = {
      description: 'Config without extensions',
    };
    const config2 = {
      extensions: ['extension1'],
    };

    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify(config1))
      .mockReturnValueOnce(JSON.stringify(config2));

    const result = await combineConfigs(['config1.json', 'config2.json']);
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config1.json'),
      expect.anything(),
    );
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config2.json'),
      expect.anything(),
    );

    expect(result.extensions).toEqual(['extension1']);
  });

  it('warns when multiple configs and extensions are detected', async () => {
    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(
        JSON.stringify({
          extensions: ['extension1'],
        }),
      )
      .mockReturnValueOnce(
        JSON.stringify({
          extensions: ['extension2'],
        }),
      );

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    await combineConfigs(['config1.json', 'config2.json']);
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config1.json'),
      expect.anything(),
    );
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config2.json'),
      expect.anything(),
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      'Warning: Multiple configurations and extensions detected. Currently, all extensions are run across all configs and do not respect their original promptfooconfig. Please file an issue on our GitHub repository if you need support for this use case.',
    );

    consoleSpy.mockRestore();
  });

  it('warns when multiple extensions are detected and multiple configs are provided', async () => {
    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(
        JSON.stringify({
          extensions: ['extension1', 'extension2'],
        }),
      )
      .mockReturnValueOnce(
        JSON.stringify({
          description: 'Config without extensions',
        }),
      );

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    await combineConfigs(['config1.json', 'config2.json']);
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config1.json'),
      expect.anything(),
    );
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config2.json'),
      expect.anything(),
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      'Warning: Multiple configurations and extensions detected. Currently, all extensions are run across all configs and do not respect their original promptfooconfig. Please file an issue on our GitHub repository if you need support for this use case.',
    );
    consoleSpy.mockRestore();
  });

  it('should only set redteam config when at least one individual config has redteam settings', async () => {
    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(
        JSON.stringify({
          description: 'Config without redteam',
          providers: ['provider1'],
        }),
      )
      .mockReturnValueOnce(
        JSON.stringify({
          description: 'Config with redteam',
          providers: ['provider2'],
          redteam: {
            plugins: ['plugin1'],
            strategies: ['strategy1'],
          },
        }),
      )
      .mockReturnValueOnce(
        JSON.stringify({
          description: 'Another config without redteam',
          providers: ['provider3'],
        }),
      );

    const result = await combineConfigs(['config1.json', 'config2.json', 'config3.json']);
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config1.json'),
      expect.anything(),
    );
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config2.json'),
      expect.anything(),
    );
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config3.json'),
      expect.anything(),
    );

    expect(result.redteam).toBeDefined();
    expect(result.redteam).toEqual({
      plugins: ['plugin1'],
      strategies: ['strategy1'],
    });
  });

  it('should not set redteam config when no individual configs have redteam settings', async () => {
    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(
        JSON.stringify({
          description: 'Config without redteam',
          providers: ['provider1'],
        }),
      )
      .mockReturnValueOnce(
        JSON.stringify({
          description: 'Another config without redteam',
          providers: ['provider2'],
        }),
      );

    const result = await combineConfigs(['config1.json', 'config2.json']);
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config1.json'),
      expect.anything(),
    );
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config2.json'),
      expect.anything(),
    );

    expect(result.redteam).toBeUndefined();
  });

  it('should combine redteam entities from multiple configs', async () => {
    const config1 = {
      prompts: ['prompt1'],
      providers: ['provider1'],
      redteam: {
        entities: ['entity1', 'entity2'],
        plugins: ['plugin1'],
        strategies: ['strategy1'],
      },
    };
    const config2 = {
      prompts: ['prompt2'],
      providers: ['provider2'],
      redteam: {
        entities: ['entity2', 'entity3'],
        plugins: ['plugin2'],
        strategies: ['strategy2'],
      },
    };

    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify(config1))
      .mockReturnValueOnce(JSON.stringify(config2));

    const result = await combineConfigs(['config1.json', 'config2.json']);
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config1.json'),
      expect.anything(),
    );
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config2.json'),
      expect.anything(),
    );

    expect(result.redteam).toEqual({
      entities: ['entity1', 'entity2', 'entity3'],
      plugins: ['plugin1', 'plugin2'],
      strategies: ['strategy1', 'strategy2'],
    });
  });

  it('should handle redteam config with undefined arrays', async () => {
    const config1 = {
      prompts: ['prompt1'],
      providers: ['provider1'],
      redteam: {
        entities: undefined,
        plugins: ['plugin1'],
        strategies: undefined,
      },
    };
    const config2 = {
      prompts: ['prompt2'],
      providers: ['provider2'],
      redteam: {
        entities: ['entity1'],
        plugins: undefined,
        strategies: ['strategy1'],
      },
    };

    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify(config1))
      .mockReturnValueOnce(JSON.stringify(config2));

    const result = await combineConfigs(['config1.json', 'config2.json']);
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config1.json'),
      expect.anything(),
    );
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config2.json'),
      expect.anything(),
    );

    expect(result.redteam).toEqual({
      entities: ['entity1'],
      plugins: ['plugin1'],
      strategies: ['strategy1'],
    });
  });

  it('should preserve non-array redteam properties', async () => {
    const config1 = {
      prompts: ['prompt1'],
      providers: ['provider1'],
      redteam: {
        entities: ['entity1'],
        plugins: ['plugin1'],
        strategies: ['strategy1'],
        delay: 1000,
        language: 'en',
        provider: 'openai:gpt-4',
      },
    };
    const config2 = {
      prompts: ['prompt2'],
      providers: ['provider2'],
      redteam: {
        entities: ['entity2'],
        plugins: ['plugin2'],
        strategies: ['strategy2'],
        delay: 2000,
        purpose: 'testing',
      },
    };

    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify(config1))
      .mockReturnValueOnce(JSON.stringify(config2));

    const result = await combineConfigs(['config1.json', 'config2.json']);
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config1.json'),
      expect.anything(),
    );
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config2.json'),
      expect.anything(),
    );

    expect(result.redteam).toEqual({
      entities: ['entity1', 'entity2'],
      plugins: ['plugin1', 'plugin2'],
      strategies: ['strategy1', 'strategy2'],
      delay: 2000,
      language: 'en',
      provider: 'openai:gpt-4',
      purpose: 'testing',
    });
  });

  it('should handle empty redteam arrays', async () => {
    const config1 = {
      prompts: ['prompt1'],
      providers: ['provider1'],
      redteam: {
        entities: [],
        plugins: ['plugin1'],
        strategies: [],
      },
    };
    const config2 = {
      prompts: ['prompt2'],
      providers: ['provider2'],
      redteam: {
        entities: ['entity1'],
        plugins: [],
        strategies: ['strategy1'],
      },
    };

    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify(config1))
      .mockReturnValueOnce(JSON.stringify(config2));

    const result = await combineConfigs(['config1.json', 'config2.json']);
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config1.json'),
      expect.anything(),
    );
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config2.json'),
      expect.anything(),
    );

    expect(result.redteam).toEqual({
      entities: ['entity1'],
      plugins: ['plugin1'],
      strategies: ['strategy1'],
    });
  });

  it('should merge shared object from multiple configs with urls', async () => {
    const config1 = {
      sharing: {
        apiBaseUrl: 'http://localhost',
        appBaseUrl: 'http://localhost',
      },
    };
    const config2 = {};

    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify(config1))
      .mockReturnValueOnce(JSON.stringify(config2));

    const result = await combineConfigs(['config1.json', 'config2.json']);
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config1.json'),
      expect.anything(),
    );
    expect(globSync).toHaveBeenCalledWith(
      path.resolve('/mock/cwd', 'config2.json'),
      expect.anything(),
    );

    expect(result.sharing).toEqual({
      apiBaseUrl: 'http://localhost',
      appBaseUrl: 'http://localhost',
    });
  });

  it('should load defaultTest from external file when string starts with file://', async () => {
    const externalDefaultTest = {
      assert: [{ type: 'equals', value: 'test' }],
      vars: { foo: 'bar' },
      options: { provider: 'openai:gpt-4' },
    };

    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockReturnValue(yaml.dump(externalDefaultTest));
    jest.mocked(maybeLoadFromExternalFile).mockResolvedValue(externalDefaultTest);

    const config = {
      providers: ['provider1'],
      prompts: ['prompt1'],
      tests: ['test1'],
      defaultTest: 'file://path/to/defaultTest.yaml',
    };

    jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config));

    const result = await combineConfigs(['config.json']);

    // combineConfigs should preserve the string reference, not load it
    expect(result.defaultTest).toBe('file://path/to/defaultTest.yaml');
  });

  it('should preserve string defaultTest when combining configs with file:// reference', async () => {
    const config1 = {
      providers: ['provider1'],
      prompts: ['prompt1'],
      tests: ['test1'],
      defaultTest: { vars: { inline: true } },
    };

    const config2 = {
      providers: ['provider2'],
      prompts: ['prompt2'],
      tests: ['test2'],
      defaultTest: 'file://external/defaultTest.yaml',
    };

    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify(config1))
      .mockReturnValueOnce(JSON.stringify(config2));

    const result = await combineConfigs(['config1.json', 'config2.json']);

    // Should preserve the file:// reference from the second config
    expect(result.defaultTest).toBe('file://external/defaultTest.yaml');
  });

  it('should merge inline defaultTest objects when combining configs', async () => {
    const config1 = {
      providers: ['provider1'],
      prompts: ['prompt1'],
      tests: ['test1'],
      defaultTest: {
        vars: { var1: 'value1' },
        assert: [{ type: 'equals', value: 'expected1' }],
      },
    };

    const config2 = {
      providers: ['provider2'],
      prompts: ['prompt2'],
      tests: ['test2'],
      defaultTest: {
        vars: { var2: 'value2' },
        assert: [{ type: 'contains', value: 'expected2' }],
        options: { provider: 'openai:gpt-4' },
      },
    };

    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify(config1))
      .mockReturnValueOnce(JSON.stringify(config2));

    const result = await combineConfigs(['config1.json', 'config2.json']);

    expect(result.defaultTest).toEqual({
      vars: { var1: 'value1', var2: 'value2' },
      assert: [
        { type: 'equals', value: 'expected1' },
        { type: 'contains', value: 'expected2' },
      ],
      options: { provider: 'openai:gpt-4' },
      metadata: {},
    });
  });

  it('should handle undefined defaultTest in configs', async () => {
    const config = {
      providers: ['provider1'],
      prompts: ['prompt1'],
      tests: ['test1'],
      // No defaultTest
    };

    jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config));

    const result = await combineConfigs(['config.json']);

    // When no defaultTest is provided, combineConfigs returns undefined
    expect(result.defaultTest).toBeUndefined();
  });
});

describe('dereferenceConfig', () => {
  it('should dereference a config with no $refs', async () => {
    const rawConfig = {
      prompts: ['Hello world'],
      description: 'Test config',
      providers: ['provider1'],
      tests: ['test1'],
      evaluateOptions: {},
      commandLineOptions: {},
    };
    const dereferencedConfig = await dereferenceConfig(rawConfig);
    expect(dereferencedConfig).toEqual(rawConfig);
  });

  it('should dereference a config with $refs', async () => {
    const rawConfig = {
      prompts: [],
      tests: [],
      evaluateOptions: {},
      commandLineOptions: {},
      providers: [{ $ref: '#/definitions/provider' }],
      definitions: {
        provider: {
          name: 'provider1',
          config: { setting: 'value' },
        },
      },
    };
    const expectedConfig = {
      prompts: [],
      tests: [],
      evaluateOptions: {},
      commandLineOptions: {},
      providers: [{ name: 'provider1', config: { setting: 'value' } }],
      definitions: {
        provider: {
          name: 'provider1',
          config: { setting: 'value' },
        },
      },
    };
    const dereferencedConfig = await dereferenceConfig(rawConfig as UnifiedConfig);
    expect(dereferencedConfig).toEqual(expectedConfig);
  });

  it('should preserve regular functions when dereferencing', async () => {
    const rawConfig = {
      description: 'Test config with function parameters',
      prompts: [],
      tests: [],
      evaluateOptions: {},
      commandLineOptions: {},
      providers: [
        {
          name: 'provider1',
          config: {
            functions: [
              {
                name: 'function1',
                parameters: { param1: 'value1' },
              },
            ],
            tools: [
              {
                function: {
                  name: 'toolFunction1',
                  parameters: { param2: 'value2' },
                },
              },
            ],
          },
        },
      ],
    };
    const dereferencedConfig = await dereferenceConfig(rawConfig as UnifiedConfig);
    expect(dereferencedConfig).toEqual(rawConfig);
  });

  it('should preserve tools with references and definitions when dereferencing', async () => {
    const rawConfig = {
      prompts: [{ $ref: '#/definitions/prompt' }],
      tests: [],
      evaluateOptions: {},
      commandLineOptions: {},
      providers: [
        {
          name: 'openai:gpt-4',
          config: {
            tools: [
              {
                type: 'function',
                function: {
                  name: 'kubectl_describe',
                  parameters: {
                    $defs: {
                      KubernetesResourceKind: {
                        enum: ['deployment', 'node'],
                        title: 'KubernetesResourceKind',
                        type: 'string',
                      },
                    },
                    properties: {
                      kind: { $ref: '#/$defs/KubernetesResourceKind' },
                      namespace: {
                        anyOf: [{ type: 'string' }, { type: 'null' }],
                        default: null,
                        title: 'Namespace',
                      },
                      name: { title: 'Name', type: 'string' },
                    },
                    required: ['kind', 'name'],
                    title: 'KubectlDescribe',
                    type: 'object',
                  },
                },
              },
            ],
          },
        },
      ],
      definitions: {
        prompt: 'hello world',
      },
    };
    const dereferencedConfig = await dereferenceConfig(rawConfig as unknown as UnifiedConfig);
    const expectedOutput = {
      prompts: ['hello world'],
      tests: [],
      evaluateOptions: {},
      commandLineOptions: {},
      providers: [
        {
          name: 'openai:gpt-4',
          config: {
            tools: [
              {
                type: 'function',
                function: {
                  name: 'kubectl_describe',
                  parameters: {
                    $defs: {
                      KubernetesResourceKind: {
                        enum: ['deployment', 'node'],
                        title: 'KubernetesResourceKind',
                        type: 'string',
                      },
                    },
                    properties: {
                      kind: { $ref: '#/$defs/KubernetesResourceKind' },
                      namespace: {
                        anyOf: [{ type: 'string' }, { type: 'null' }],
                        default: null,
                        title: 'Namespace',
                      },
                      name: { title: 'Name', type: 'string' },
                    },
                    required: ['kind', 'name'],
                    title: 'KubectlDescribe',
                    type: 'object',
                  },
                },
              },
            ],
          },
        },
      ],
      definitions: {
        prompt: 'hello world',
      },
    };
    expect(dereferencedConfig).toEqual(expectedOutput);
  });

  it('should preserve handle string functions/tools when dereferencing', async () => {
    const rawConfig = {
      description: 'Test config with function parameters',
      prompts: [],
      tests: [],
      evaluateOptions: {},
      commandLineOptions: {},
      providers: [
        {
          name: 'provider2',
          config: {
            functions: 'file://external_functions.yaml',
            tools: 'file://external_tools.yaml',
          },
        },
      ],
    };
    const dereferencedConfig = await dereferenceConfig(rawConfig as UnifiedConfig);
    expect(dereferencedConfig).toEqual(rawConfig);
  });
});

describe('resolveConfigs', () => {
  let mockExit: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    jest.spyOn(process, 'cwd').mockReturnValue('/mock/cwd');
    mockExit = jest.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
      throw new Error(`Process exited with code ${code}`);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    mockExit.mockRestore();
  });

  it('should set cliState.basePath', async () => {
    const cmdObj = { config: ['config.json'] };
    const defaultConfig = {};

    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        prompts: ['prompt1'],
        providers: ['openai:foobar'],
      }),
    );
    jest.mocked(globSync).mockReturnValueOnce(['config.json']);

    await resolveConfigs(cmdObj, defaultConfig);

    expect(cliState.basePath).toBe(path.dirname('config.json'));
  });

  it('should load scenarios and tests from external files', async () => {
    const cmdObj = { config: ['config.json'] };
    const defaultConfig = {};
    const scenarios = [{ description: 'Scenario', tests: 'file://tests.yaml' }];
    const externalTests = [
      { vars: { testPrompt: 'What services do you offer?' } },
      { vars: { testPrompt: 'How can I confirm an order?' } },
    ];

    const prompt =
      'You are a helpful assistant. You are given a prompt and you must answer it. {{testPrompt}}';
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        prompts: [prompt],
        providers: ['openai:gpt-4'],
        scenarios: 'file://scenarios.yaml',
      }),
    );

    jest
      .mocked(maybeLoadFromExternalFile)
      .mockResolvedValueOnce(scenarios)
      .mockResolvedValueOnce(externalTests);

    jest.mocked(readTests).mockResolvedValue(externalTests);

    jest.mocked(globSync).mockReturnValue(['config.json']);

    // Mock readPrompts to return the expected format
    jest.mocked(readPrompts).mockResolvedValue([
      {
        raw: prompt,
        label: prompt,
        config: {},
      },
    ]);

    // Mock loadApiProviders to return the expected format
    jest.mocked(loadApiProviders).mockResolvedValue([
      {
        id: () => 'openai:gpt-4',
        label: 'openai:gpt-4',
        modelName: 'gpt-4',
      } as any,
    ]);

    const { testSuite } = await resolveConfigs(cmdObj, defaultConfig);

    expect(maybeLoadFromExternalFile).toHaveBeenCalledWith(['file://scenarios.yaml']);
    expect(maybeLoadFromExternalFile).toHaveBeenCalledWith('file://tests.yaml');

    expect(testSuite).toMatchObject({
      prompts: [
        {
          raw: prompt,
          label: prompt,
        },
      ],
      providers: [
        expect.objectContaining({
          modelName: 'gpt-4',
        }),
      ],
      scenarios,
      tests: externalTests,
      defaultTest: expect.objectContaining({
        metadata: {},
      }),
    });

    expect(testSuite.prompts[0].raw).toBe(prompt);
    expect(testSuite.tests).toEqual(externalTests);
    expect(testSuite.scenarios).toEqual(scenarios);
  });

  it('should warn and exit when no config file, no prompts, no providers, and not in CI', async () => {
    jest.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
      throw new Error(`Process exited with code ${code}`);
    });
    jest.mocked(isCI).mockReturnValue(false);
    jest.mocked(isRunningUnderNpx).mockReturnValue(true);

    const cmdObj = {};
    const defaultConfig = {};

    await expect(resolveConfigs(cmdObj, defaultConfig)).rejects.toThrow(
      'Process exited with code 1',
    );

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('No promptfooconfig found'));
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('npx promptfoo eval -c'));
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('npx promptfoo init'));
  });

  it('should throw an error if no providers are provided', async () => {
    const cmdObj = { config: ['config.json'] };
    const defaultConfig = {};
    const promptfooConfig = {
      prompts: ['Act as a travel guide for {{location}}'],
    };

    jest.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify(promptfooConfig));
    jest.mocked(globSync).mockReturnValueOnce(['config.json']);

    await expect(resolveConfigs(cmdObj, defaultConfig)).rejects.toThrow(
      'Process exited with code 1',
    );

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('You must specify at least 1 provider (for example, openai:gpt-4.1)'),
    );
  });

  it('should allow dataset generation configs to omit providers', async () => {
    const cmdObj = { config: ['config.json'] };
    const defaultConfig = {};
    const promptfooConfig = {
      prompts: ['Act as a travel guide for {{location}}'],
    };

    jest.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify(promptfooConfig));
    jest.mocked(globSync).mockReturnValueOnce(['config.json']);

    expect(
      async () => await resolveConfigs(cmdObj, defaultConfig, 'DatasetGeneration'),
    ).not.toThrow();
  });

  it('should load defaultTest with embedding provider configuration', async () => {
    const configWithDefaultTest = {
      prompts: ['Test prompt: {{input}}'],
      providers: ['openai:gpt-3.5-turbo'],
      defaultTest: {
        options: {
          provider: {
            embedding: {
              id: 'bedrock:embeddings:amazon.titan-embed-text-v2:0',
              config: {
                region: 'us-east-1',
                profile: 'test-profile',
              },
            },
          },
        },
      },
      tests: [
        {
          vars: {
            input: 'test input',
          },
          assert: [
            {
              type: 'similar',
              value: 'expected output',
              threshold: 0.8,
            },
          ],
        },
      ],
    };

    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockImplementation((path: fs.PathOrFileDescriptor) => {
      if (typeof path === 'string' && path.endsWith('config.yaml')) {
        return yaml.dump(configWithDefaultTest);
      }
      return Buffer.from('');
    });
    jest.mocked(globSync).mockReturnValue(['config.yaml']);
    jest.mocked(isCI).mockReturnValue(true); // Avoid triggering exit

    // Mock readTests to return the specific test for this case
    jest.mocked(readTests).mockResolvedValue([
      {
        vars: {
          input: 'test input',
        },
        assert: [
          {
            type: 'similar',
            value: 'expected output',
            threshold: 0.8,
          },
        ],
      },
    ]);

    const cmdObj = { config: ['config.yaml'] };
    const result = await resolveConfigs(cmdObj, {});

    // Verify the defaultTest was loaded with the embedding provider configuration
    expect(result.testSuite.defaultTest).toBeDefined();
    expect((result.testSuite.defaultTest as any)?.options?.provider).toEqual({
      embedding: {
        id: 'bedrock:embeddings:amazon.titan-embed-text-v2:0',
        config: {
          region: 'us-east-1',
          profile: 'test-profile',
        },
      },
    });

    // Verify the test case was loaded
    expect(result.testSuite.tests).toBeDefined();
    expect(result.testSuite.tests).toHaveLength(1);
    expect(result.testSuite.tests![0].vars).toEqual({ input: 'test input' });
  });

  it('should load defaultTest with model-graded eval provider', async () => {
    const configWithDefaultTest = {
      prompts: ['Test prompt: {{input}}'],
      providers: ['openai:gpt-3.5-turbo'],
      defaultTest: {
        options: {
          provider: 'openai:gpt-4',
        },
      },
      tests: [
        {
          vars: {
            input: 'test input',
          },
          assert: [
            {
              type: 'llm-rubric',
              value: 'Output should be helpful',
            },
          ],
        },
      ],
    };

    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockImplementation((path: fs.PathOrFileDescriptor) => {
      if (typeof path === 'string' && path.endsWith('config.yaml')) {
        return yaml.dump(configWithDefaultTest);
      }
      return Buffer.from('');
    });
    jest.mocked(globSync).mockReturnValue(['config.yaml']);
    jest.mocked(isCI).mockReturnValue(true); // Avoid triggering exit

    const cmdObj = { config: ['config.yaml'] };
    const result = await resolveConfigs(cmdObj, {});

    // Verify the defaultTest was loaded with the provider string
    expect(result.testSuite.defaultTest).toBeDefined();
    expect((result.testSuite.defaultTest as any)?.options?.provider).toBe('openai:gpt-4');
  });
});

describe('readConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should read JSON config file', async () => {
    const mockConfig = {
      description: 'Test config',
      providers: ['openai:gpt-4o'],
      prompts: ['Hello, world!'],
    };
    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockConfig));
    jest.spyOn(path, 'parse').mockReturnValue({ ext: '.json' } as any);

    const result = await readConfig('config.json');

    expect(result).toEqual(mockConfig);
    expect(fs.readFileSync).toHaveBeenCalledWith('config.json', 'utf-8');
  });

  it('should read YAML config file', async () => {
    const mockConfig = {
      description: 'Test config',
      providers: ['openai:gpt-4o'],
      prompts: ['Hello, world!'],
    };
    jest.spyOn(fs, 'readFileSync').mockReturnValue(yaml.dump(mockConfig));
    jest.spyOn(path, 'parse').mockReturnValue({ ext: '.yaml' } as any);

    const result = await readConfig('config.yaml');

    expect(result).toEqual(mockConfig);
    expect(fs.readFileSync).toHaveBeenCalledWith('config.yaml', 'utf-8');
  });

  it('should read JavaScript config file', async () => {
    const mockConfig = {
      description: 'Test config',
      providers: ['openai:gpt-4o'],
      prompts: ['Hello, world!'],
    };

    jest.spyOn(path, 'parse').mockReturnValue({ ext: '.js' } as any);
    jest.mocked(importModule).mockResolvedValue(mockConfig);
    const result = await readConfig('config.js');

    expect(result).toEqual(mockConfig);
    expect(importModule).toHaveBeenCalledWith('config.js');
  });

  it('should throw error for unsupported file format', async () => {
    jest.spyOn(path, 'parse').mockReturnValue({ ext: '.txt' } as any);

    await expect(readConfig('config.txt')).rejects.toThrow(
      'Unsupported configuration file format: .txt',
    );
  });

  it('should rewrite targets to providers', async () => {
    const mockConfig = {
      description: 'Test config',
      targets: ['openai:gpt-4o'],
      prompts: ['Hello, world!'],
    };
    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockConfig));
    jest.spyOn(path, 'parse').mockReturnValue({ ext: '.json' } as any);

    const result = await readConfig('config.json');

    expect(result).toEqual({
      description: 'Test config',
      providers: ['openai:gpt-4o'],
      prompts: ['Hello, world!'],
    });
  });

  it('should rewrite plugins and strategies to redteam', async () => {
    const mockConfig = {
      description: 'Test config',
      providers: ['openai:gpt-4o'],
      prompts: ['Hello, world!'],
      plugins: ['plugin1'],
      strategies: ['strategy1'],
    };
    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockConfig));
    jest.spyOn(path, 'parse').mockReturnValue({ ext: '.json' } as any);

    const result = await readConfig('config.json');

    expect(result).toEqual({
      description: 'Test config',
      providers: ['openai:gpt-4o'],
      prompts: ['Hello, world!'],
      redteam: {
        plugins: ['plugin1'],
        strategies: ['strategy1'],
      },
    });
  });

  it('should set default prompt when no prompts are provided', async () => {
    const mockConfig = {
      description: 'Test config',
      providers: ['openai:gpt-4o'],
      tests: [
        { vars: { someVar: 'value', prompt: 'abc' } },
        { vars: { anotherVar: 'anotherValue', prompt: 'yo mama' } },
      ],
    };
    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockConfig));
    jest.spyOn(path, 'parse').mockReturnValue({ ext: '.json' } as any);

    const result = await readConfig('config.json');

    expect(result).toEqual({
      ...mockConfig,
      prompts: ['{{prompt}}'],
    });
  });

  it('should resolve YAML references before validation', async () => {
    const mockConfig = {
      description: 'test_config',
      prompts: ['test {{text}}'],
      providers: [{ $ref: 'defaultParams.yaml#/model' }],
      temperature: 1,
      tests: [{ vars: { text: 'test text' } }],
    };

    const dereferencedConfig = {
      description: 'test_config',
      prompts: ['test {{text}}'],
      providers: ['echo'],
      temperature: 1,
      tests: [{ vars: { text: 'test text' } }],
    };

    jest.mocked(fs.readFileSync).mockReturnValueOnce(yaml.dump(mockConfig));
    jest.spyOn($RefParser.prototype, 'dereference').mockResolvedValueOnce(dereferencedConfig);

    const result = await readConfig('config.yaml');
    expect(result).toEqual(dereferencedConfig);
    expect(fs.readFileSync).toHaveBeenCalledWith('config.yaml', 'utf-8');
  });

  it('should throw validation error for invalid dereferenced config', async () => {
    const mockConfig = {
      description: 'invalid_config',
      providers: [{ $ref: 'defaultParams.yaml#/invalidKey' }],
    };

    const dereferencedConfig = {
      description: 'invalid_config',
      providers: [{ invalid: true }],
    };

    jest.mocked(fs.readFileSync).mockReturnValueOnce(yaml.dump(mockConfig));
    jest.spyOn($RefParser.prototype, 'dereference').mockResolvedValueOnce(dereferencedConfig);
    jest.mocked(fs.existsSync).mockReturnValueOnce(true);

    await readConfig('config.yaml');

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'Invalid configuration file config.yaml:\nValidation error: Unrecognized key(s) in object: \'invalid\' at "providers[0]"',
    );
    const calls = jest.mocked(logger.warn).mock.calls;
    expect(calls[0][0]).toContain('Invalid configuration file');
  });

  it('should handle empty YAML file by defaulting to empty object', async () => {
    jest.spyOn(fs, 'readFileSync').mockReturnValue('');
    jest.spyOn(path, 'parse').mockReturnValue({ ext: '.yaml' } as any);
    jest.spyOn(yaml, 'load').mockReturnValue(null);
    jest.spyOn($RefParser.prototype, 'dereference').mockResolvedValue({});

    const result = await readConfig('empty.yaml');

    expect(result).toEqual({
      prompts: ['{{prompt}}'],
    });
    expect(fs.readFileSync).toHaveBeenCalledWith('empty.yaml', 'utf-8');
  });
});

describe('resolveConfigs with external defaultTest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    cliState.basePath = '/mock/base';
  });

  it('should resolve defaultTest from external file in resolveConfigs', async () => {
    const externalDefaultTest = {
      assert: [{ type: 'contains', value: 'resolved' }],
      vars: { resolved: true },
    };

    const fileConfig = {
      providers: ['openai:gpt-4'],
      prompts: ['Test prompt'],
      tests: [{ vars: { test: 'value' } }],
      defaultTest: 'file://shared/defaultTest.yaml',
    };

    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(fileConfig));
    jest.mocked(maybeLoadFromExternalFile).mockResolvedValue(externalDefaultTest);
    jest.mocked(readTests).mockResolvedValue([{ vars: { test: 'value' } }]);

    const result = await resolveConfigs({ config: ['config.json'] }, {});

    expect(maybeLoadFromExternalFile).toHaveBeenCalledWith('file://shared/defaultTest.yaml');
    expect(result.testSuite.defaultTest).toEqual(
      expect.objectContaining({
        assert: externalDefaultTest.assert,
        vars: externalDefaultTest.vars,
      }),
    );
  });

  it('should handle inline defaultTest object in resolveConfigs', async () => {
    const inlineDefaultTest = {
      assert: [{ type: 'equals', value: 'inline' }],
      vars: { inline: true },
    };

    const fileConfig = {
      providers: ['openai:gpt-4'],
      prompts: ['Test prompt'],
      tests: [{ vars: { test: 'value' } }],
      defaultTest: inlineDefaultTest,
    };

    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(fileConfig));
    jest.mocked(readTests).mockResolvedValue([{ vars: { test: 'value' } }]);
    jest.mocked(globSync).mockReturnValue(['config.json']);

    const result = await resolveConfigs({ config: ['config.json'] }, {});

    // maybeLoadFromExternalFile should not be called for inline defaultTest
    expect(maybeLoadFromExternalFile).toHaveBeenCalledTimes(0);
    expect(result.testSuite.defaultTest).toEqual(
      expect.objectContaining({
        assert: inlineDefaultTest.assert,
        vars: inlineDefaultTest.vars,
      }),
    );
  });
});
