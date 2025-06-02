import fs from 'fs';
import { getAuthor, getUserEmail } from '../../../src/globalConfig/accounts';
import { cloudConfig } from '../../../src/globalConfig/cloud';
import logger from '../../../src/logger';
import { synthesize } from '../../../src/redteam';
import {
  doTargetPurposeDiscovery,
  mergeTargetPurposeDiscoveryResults,
} from '../../../src/redteam/commands/discover';
import { doGenerateRedteam } from '../../../src/redteam/commands/generate';
import type { RedteamCliGenerateOptions, RedteamPluginObject } from '../../../src/redteam/types';
import type { ApiProvider } from '../../../src/types';
import * as configModule from '../../../src/util/config/load';
import { writePromptfooConfig } from '../../../src/util/config/manage';

jest.mock('fs');
jest.mock('../../../src/redteam');
jest.mock('../../../src/telemetry');
jest.mock('../../../src/util/config/load', () => ({
  combineConfigs: jest.fn(),
  resolveConfigs: jest.fn(),
}));

jest.mock('../../../src/envars', () => ({
  ...jest.requireActual('../../../src/envars'),
  getEnvBool: jest.fn().mockImplementation((key) => {
    if (key === 'PROMPTFOO_REDTEAM_ENABLE_PURPOSE_DISCOVERY_AGENT') {
      return true;
    }
    return false;
  }),
}));

jest.mock('../../../src/globalConfig/cloud', () => ({
  CloudConfig: jest.fn().mockImplementation(() => ({
    isEnabled: jest.fn().mockReturnValue(false),
    getApiHost: jest.fn().mockReturnValue('https://api.promptfoo.app'),
  })),
  cloudConfig: {
    getApiHost: jest.fn().mockReturnValue('https://api.promptfoo.app'),
  },
}));

jest.mock('../../../src/redteam/commands/discover', () => ({
  doTargetPurposeDiscovery: jest.fn(),
  mergeTargetPurposeDiscoveryResults: jest.fn(),
}));

jest.mock('../../../src/redteam/remoteGeneration', () => ({
  shouldGenerateRemote: jest.fn().mockReturnValue(false),
  neverGenerateRemote: jest.fn().mockReturnValue(false),
  getRemoteGenerationUrl: jest.fn().mockReturnValue('http://test-url'),
}));

jest.mock('../../../src/util/config/manage');
jest.mock('../../../src/globalConfig/accounts', () => ({
  getAuthor: jest.fn(),
  getUserEmail: jest.fn(),
}));
jest.mock('../../../src/providers', () => ({
  loadApiProviders: jest.fn().mockResolvedValue([
    {
      id: () => 'test-provider',
      callApi: jest.fn(),
      cleanup: jest.fn(),
    },
  ]),
}));

describe('doGenerateRedteam', () => {
  let mockProvider: ApiProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    mockProvider = {
      id: () => 'test-provider',
      callApi: jest.fn().mockResolvedValue({ output: 'test output' }),
      cleanup: jest.fn().mockResolvedValue(undefined),
    };

    jest.mocked(configModule.resolveConfigs).mockResolvedValue({
      basePath: '/mock/path',
      testSuite: {
        providers: [mockProvider],
        prompts: [],
        tests: [],
      },
      config: {
        redteam: {},
      },
    });
  });

  it('should generate redteam tests and write to output file', async () => {
    jest.mocked(configModule.combineConfigs).mockResolvedValue([
      {
        prompts: [{ raw: 'Test prompt', label: 'Test label' }],
        providers: [],
        tests: [],
      },
    ] as any);

    const options: RedteamCliGenerateOptions = {
      output: 'output.yaml',
      config: 'config.yaml',
      cache: true,
      defaultConfig: {},
      write: true,
    };

    jest.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        prompts: [{ raw: 'Test prompt' }],
        providers: [],
        tests: [],
      }),
    );

    jest.mocked(synthesize).mockResolvedValue({
      testCases: [
        {
          vars: { input: 'Test input' },
          assert: [{ type: 'equals', value: 'Test output' }],
          metadata: { pluginId: 'redteam' },
        },
      ],
      purpose: 'Test purpose',
      entities: ['Test entity'],
      injectVar: 'input',
    });

    await doGenerateRedteam(options);

    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        language: undefined,
        numTests: undefined,
        plugins: expect.any(Array),
        prompts: [],
        strategies: expect.any(Array),
      }),
    );
    expect(writePromptfooConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        prompts: [{ raw: 'Test prompt' }],
        providers: [],
        tests: [
          {
            vars: { input: 'Test input' },
            assert: [{ type: 'equals', value: 'Test output' }],
            metadata: { pluginId: 'redteam' },
          },
        ],
        redteam: expect.objectContaining({
          purpose: 'Test purpose',
          entities: ['Test entity'],
        }),
        defaultTest: {
          metadata: {
            purpose: 'Test purpose',
            entities: ['Test entity'],
          },
        },
      }),
      'output.yaml',
      expect.any(Array),
    );
  });

  it('should write to config file when write option is true', async () => {
    const options: RedteamCliGenerateOptions = {
      config: 'config.yaml',
      cache: true,
      defaultConfig: {},
      write: true,
    };

    jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));
    jest.mocked(synthesize).mockResolvedValue({
      testCases: [
        {
          vars: { input: 'Test input' },
          assert: [{ type: 'equals', value: 'Test output' }],
          metadata: { pluginId: 'redteam' },
        },
      ],
      purpose: 'Test purpose',
      entities: [],
      injectVar: 'input',
    });

    await doGenerateRedteam(options);

    expect(writePromptfooConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultTest: {
          metadata: {
            purpose: 'Test purpose',
            entities: [],
          },
        },
        redteam: expect.objectContaining({
          purpose: 'Test purpose',
          entities: [],
        }),
        tests: [
          {
            vars: { input: 'Test input' },
            assert: [{ type: 'equals', value: 'Test output' }],
            metadata: { pluginId: 'redteam' },
          },
        ],
      }),
      'config.yaml',
      expect.any(Array),
    );
  });

  it('should handle missing configuration file', async () => {
    const options = {
      cache: true,
      defaultConfig: {},
      write: true,
      output: 'redteam.yaml',
    };

    await doGenerateRedteam(options);

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("Can't generate without configuration"),
    );
  });

  it('should use purpose when no config is provided', async () => {
    const options: RedteamCliGenerateOptions = {
      purpose: 'Test purpose',
      cache: true,
      defaultConfig: {},
      write: true,
      output: 'redteam.yaml',
    };

    jest.mocked(synthesize).mockResolvedValue({
      testCases: [
        {
          vars: { input: 'Test input' },
          assert: [{ type: 'equals', value: 'Test output' }],
          metadata: { pluginId: 'redteam' },
        },
      ],
      purpose: 'Test purpose',
      entities: ['Test entity'],
      injectVar: 'input',
    });

    jest.mocked(mergeTargetPurposeDiscoveryResults).mockReturnValue('MERGED(Test purpose)');

    await doGenerateRedteam(options);

    expect(mergeTargetPurposeDiscoveryResults).toHaveBeenCalledWith('Test purpose', undefined);

    expect(synthesize).toHaveBeenCalledWith({
      language: undefined,
      numTests: undefined,
      purpose: 'MERGED(Test purpose)',
      plugins: expect.any(Array),
      prompts: expect.any(Array),
      strategies: expect.any(Array),
      targetLabels: [],
      showProgressBar: true,
    });
    expect(writePromptfooConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        tests: expect.arrayContaining([
          expect.objectContaining({
            vars: { input: 'Test input' },
            assert: [{ type: 'equals', value: 'Test output' }],
            metadata: { pluginId: 'redteam' },
          }),
        ]),
        redteam: expect.objectContaining({
          purpose: 'Test purpose',
          entities: ['Test entity'],
        }),
      }),
      'redteam.yaml',
      expect.any(Array),
    );
  });

  it('should properly handle numTests for both string and object-style plugins', async () => {
    jest.mocked(configModule.resolveConfigs).mockResolvedValue({
      basePath: '/mock/path',
      testSuite: {
        prompts: [{ raw: 'Test prompt', label: 'Test label' }],
        providers: [],
      },
      config: {
        redteam: {
          numTests: 1,
          plugins: [
            'contracts' as unknown as RedteamPluginObject,
            { id: 'competitors' },
            { id: 'overreliance', numTests: 3 },
          ],
          strategies: [],
        },
      },
    });

    jest.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        prompts: [{ raw: 'Test prompt' }],
        providers: [],
        tests: [],
      }),
    );

    jest.mocked(synthesize).mockResolvedValue({
      testCases: [
        {
          vars: { input: 'Test input' },
          assert: [{ type: 'equals', value: 'Test output' }],
          metadata: { pluginId: 'redteam' },
        },
      ],
      purpose: 'Test purpose',
      entities: ['Test entity'],
      injectVar: 'input',
    });

    const options: RedteamCliGenerateOptions = {
      output: 'output.yaml',
      cache: true,
      defaultConfig: {},
      write: true,
      force: true,
      purpose: 'Test purpose',
      config: 'config.yaml',
    };

    await doGenerateRedteam(options);

    expect(synthesize).toHaveBeenCalledTimes(1);

    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        language: undefined,
        numTests: 1,
        plugins: expect.arrayContaining([
          expect.objectContaining({ id: 'competitors', numTests: 1 }),
          expect.objectContaining({ id: 'contracts', numTests: 1 }),
          expect.objectContaining({ id: 'overreliance', numTests: 3 }),
        ]),
        prompts: ['Test prompt'],
        strategies: [],
      }),
    );
  });

  it('should pass entities from redteam config to synthesize', async () => {
    jest.mocked(configModule.resolveConfigs).mockResolvedValue({
      basePath: '/mock/path',
      testSuite: {
        prompts: [{ raw: 'Test prompt', label: 'Test label' }],
        providers: [],
      },
      config: {
        redteam: {
          entities: ['Company X', 'John Doe', 'Product Y'],
          plugins: ['harmful:hate' as unknown as RedteamPluginObject],
          strategies: [],
        },
      },
    });

    jest.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        prompts: [{ raw: 'Test prompt' }],
        providers: [],
        tests: [],
      }),
    );

    jest.mocked(synthesize).mockResolvedValue({
      testCases: [
        {
          vars: { input: 'Test input' },
          assert: [{ type: 'equals', value: 'Test output' }],
          metadata: { pluginId: 'redteam' },
        },
      ],
      purpose: 'Test purpose',
      entities: ['Company X', 'John Doe', 'Product Y'],
      injectVar: 'input',
    });

    const options: RedteamCliGenerateOptions = {
      output: 'output.yaml',
      cache: true,
      defaultConfig: {},
      write: true,
      force: true,
      config: 'config.yaml',
    };

    await doGenerateRedteam(options);

    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        entities: ['Company X', 'John Doe', 'Product Y'],
        plugins: expect.any(Array),
        prompts: ['Test prompt'],
        strategies: expect.any(Array),
      }),
    );
  });

  it('should handle undefined entities in redteam config', async () => {
    jest.mocked(configModule.resolveConfigs).mockResolvedValue({
      basePath: '/mock/path',
      testSuite: {
        prompts: [{ raw: 'Test prompt', label: 'Test label' }],
        providers: [],
      },
      config: {
        redteam: {
          plugins: ['harmful:hate' as unknown as RedteamPluginObject],
          strategies: [],
        },
      },
    });

    jest.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        prompts: [{ raw: 'Test prompt' }],
        providers: [],
        tests: [],
      }),
    );

    jest.mocked(synthesize).mockResolvedValue({
      testCases: [
        {
          vars: { input: 'Test input' },
          assert: [{ type: 'equals', value: 'Test output' }],
          metadata: { pluginId: 'redteam' },
        },
      ],
      purpose: 'Test purpose',
      entities: [],
      injectVar: 'input',
    });

    const options: RedteamCliGenerateOptions = {
      output: 'output.yaml',
      cache: true,
      defaultConfig: {},
      write: true,
      force: true,
      config: 'config.yaml',
    };

    await doGenerateRedteam(options);

    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        plugins: [expect.objectContaining({ id: 'harmful:hate', numTests: 5 })],
        prompts: ['Test prompt'],
        strategies: [],
        abortSignal: undefined,
        delay: undefined,
        language: undefined,
        maxConcurrency: undefined,
        numTests: undefined,
      }),
    );
  });

  it('should write entities to output config', async () => {
    jest.mocked(configModule.resolveConfigs).mockResolvedValue({
      basePath: '/mock/path',
      testSuite: {
        prompts: [{ raw: 'Test prompt', label: 'Test label' }],
        providers: [],
      },
      config: {
        redteam: {
          entities: ['Company X', 'John Doe', 'Product Y'],
          plugins: ['harmful:hate' as unknown as RedteamPluginObject],
          strategies: [],
        },
      },
    });

    jest.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        prompts: [{ raw: 'Test prompt' }],
        providers: [],
        tests: [],
      }),
    );

    jest.mocked(synthesize).mockResolvedValue({
      testCases: [
        {
          vars: { input: 'Test input' },
          assert: [{ type: 'equals', value: 'Test output' }],
          metadata: { pluginId: 'redteam' },
        },
      ],
      purpose: 'Test purpose',
      entities: ['Company X', 'John Doe', 'Product Y'],
      injectVar: 'input',
    });

    const options: RedteamCliGenerateOptions = {
      output: 'output.yaml',
      cache: true,
      defaultConfig: {},
      write: true,
      force: true,
      config: 'config.yaml',
    };

    await doGenerateRedteam(options);

    expect(writePromptfooConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        redteam: expect.objectContaining({
          entities: ['Company X', 'John Doe', 'Product Y'],
        }),
        defaultTest: expect.objectContaining({
          metadata: expect.objectContaining({
            entities: ['Company X', 'John Doe', 'Product Y'],
          }),
        }),
      }),
      'output.yaml',
      expect.any(Array),
    );
  });

  it('should cleanup provider after generation', async () => {
    jest.mocked(synthesize).mockResolvedValue({
      testCases: [
        {
          vars: { input: 'Test input' },
          assert: [{ type: 'equals', value: 'Test output' }],
          metadata: { pluginId: 'redteam' },
        },
      ],
      purpose: 'Test purpose',
      entities: ['Test entity'],
      injectVar: 'input',
    });

    const options: RedteamCliGenerateOptions = {
      output: 'test-output.json',
      inRedteamRun: false,
      cache: false,
      defaultConfig: {},
      write: false,
      config: 'test-config.yaml',
    };

    await doGenerateRedteam(options);

    expect(mockProvider.cleanup!).toHaveBeenCalledWith();
  });

  it('should handle provider cleanup errors gracefully', async () => {
    jest.mocked(synthesize).mockResolvedValue({
      testCases: [
        {
          vars: { input: 'Test input' },
          assert: [{ type: 'equals', value: 'Test output' }],
          metadata: { pluginId: 'redteam' },
        },
      ],
      purpose: 'Test purpose',
      entities: ['Test entity'],
      injectVar: 'input',
    });

    const options: RedteamCliGenerateOptions = {
      output: 'test-output.json',
      inRedteamRun: false,
      cache: false,
      defaultConfig: {},
      write: false,
      config: 'test-config.yaml',
    };

    if (mockProvider.cleanup) {
      jest.mocked(mockProvider.cleanup).mockRejectedValueOnce(new Error('Cleanup failed'));
    }

    await doGenerateRedteam(options);

    expect(mockProvider.cleanup).toHaveBeenCalledWith();
  });

  it('should not cleanup provider during redteam run', async () => {
    jest.mocked(synthesize).mockResolvedValue({
      testCases: [
        {
          vars: { input: 'Test input' },
          assert: [{ type: 'equals', value: 'Test output' }],
          metadata: { pluginId: 'redteam' },
        },
      ],
      purpose: 'Test purpose',
      entities: ['Test entity'],
      injectVar: 'input',
    });
    const options: RedteamCliGenerateOptions = {
      output: 'test-output.json',
      inRedteamRun: true,
      cache: false,
      defaultConfig: {},
      write: false,
      config: 'test-config.yaml',
    };

    await doGenerateRedteam(options);

    expect(mockProvider.cleanup).not.toHaveBeenCalled();
  });

  it('should handle errors during purpose discovery', async () => {
    jest.mocked(configModule.resolveConfigs).mockResolvedValue({
      basePath: '/mock/path',
      testSuite: {
        providers: [mockProvider],
        prompts: [],
        tests: [],
      },
      config: {
        redteam: {
          purpose: 'Existing purpose',
        },
        providers: ['test-provider'],
      },
    });

    const options: RedteamCliGenerateOptions = {
      output: 'output.yaml',
      config: 'config.yaml',
      cache: true,
      defaultConfig: {},
      write: true,
    };

    const mockError = new Error('Purpose discovery failed');
    jest.mocked(doTargetPurposeDiscovery).mockRejectedValue(mockError);

    await doGenerateRedteam(options);

    expect(logger.error).toHaveBeenCalledWith(
      'Target Discovery Agent failed from error, skipping: Purpose discovery failed',
    );
  });

  it('should call doTargetPurposeDiscovery and mergeTargetPurposeDiscoveryResults', async () => {
    jest.mocked(configModule.resolveConfigs).mockResolvedValue({
      basePath: '/mock/path',
      testSuite: {
        providers: [mockProvider],
        prompts: [],
        tests: [],
      },
      config: {
        redteam: {},
        providers: ['test-provider'],
      },
    });

    const options: RedteamCliGenerateOptions = {
      output: 'output.yaml',
      config: 'config.yaml',
      cache: true,
      defaultConfig: {},
      purpose: 'CLI purpose',
      write: true,
    };

    const mockedPurpose = {
      purpose: 'Generated purpose',
      limitations: 'Generated limitations',
      tools: [
        {
          name: 'search',
          description: 'search(query: string)',
          arguments: [{ name: 'query', description: 'query', type: 'string' }],
        },
      ],
      user: 'Generated user',
    };

    jest.mocked(doTargetPurposeDiscovery).mockResolvedValue(mockedPurpose);

    jest.mocked(synthesize).mockResolvedValue({
      testCases: [],
      purpose: 'CLI purpose merged with Generated purpose',
      entities: [],
      injectVar: 'injected',
    });

    await doGenerateRedteam(options);

    expect(mergeTargetPurposeDiscoveryResults).toHaveBeenCalledWith('CLI purpose', mockedPurpose);
  });

  it('should call doTargetPurposeDiscovery with the first prompt', async () => {
    jest.mocked(configModule.resolveConfigs).mockResolvedValue({
      basePath: '/mock/path',
      testSuite: {
        providers: [mockProvider],
        prompts: [{ raw: 'Test prompt', label: 'Test label' }],
        tests: [],
      },
      config: {
        redteam: {},
        providers: ['test-provider'],
      },
    });

    const options: RedteamCliGenerateOptions = {
      output: 'output.yaml',
      config: 'config.yaml',
      cache: true,
      defaultConfig: {},
      purpose: 'CLI purpose',
      write: true,
    };

    const mockedPurpose = {
      purpose: 'Generated purpose',
      limitations: 'Generated limitations',
      tools: [
        {
          name: 'search',
          description: 'search(query: string)',
          arguments: [{ name: 'query', description: 'query', type: 'string' }],
        },
      ],
      user: 'Generated user',
    };
    jest.mocked(doTargetPurposeDiscovery).mockResolvedValue(mockedPurpose);
    jest.mocked(synthesize).mockResolvedValue({
      testCases: [],
      purpose: 'CLI purpose merged with Generated purpose',
      entities: [],
      injectVar: 'injected',
    });

    await doGenerateRedteam(options);

    expect(doTargetPurposeDiscovery).toHaveBeenCalledWith(expect.any(Object), {
      raw: 'Test prompt',
      label: 'Test label',
    });
  });

  it('should handle purpose discovery error with specific error message', async () => {
    jest.mocked(configModule.resolveConfigs).mockResolvedValue({
      basePath: '/mock/path',
      testSuite: {
        providers: [mockProvider],
        prompts: [],
        tests: [],
      },
      config: {
        redteam: {},
        providers: ['test-provider'],
      },
    });

    const options: RedteamCliGenerateOptions = {
      output: 'output.yaml',
      config: 'config.yaml',
      cache: true,
      defaultConfig: {},
      write: true,
    };

    const customError = new Error('Custom purpose discovery error');
    jest.mocked(doTargetPurposeDiscovery).mockRejectedValue(customError);

    await doGenerateRedteam(options);

    expect(logger.error).toHaveBeenCalledWith(
      'Target Discovery Agent failed from error, skipping: Custom purpose discovery error',
    );
  });

  it('should properly merge purposes when both exist', async () => {
    jest.mocked(configModule.resolveConfigs).mockResolvedValue({
      basePath: '/mock/path',
      testSuite: {
        providers: [mockProvider],
        prompts: [],
        tests: [],
      },
      config: {
        redteam: {
          purpose: 'Config purpose',
        },
        providers: ['test-provider'],
      },
    });

    const options: RedteamCliGenerateOptions = {
      output: 'output.yaml',
      config: 'config.yaml',
      cache: true,
      defaultConfig: {},
      purpose: 'CLI purpose',
      write: true,
    };

    const mockedPurpose = {
      purpose: 'Generated purpose',
      limitations: 'Generated limitations',
      tools: [
        {
          name: 'search',
          description: 'search(query: string)',
          arguments: [{ name: 'query', description: 'query', type: 'string' }],
        },
      ],
      user: 'Generated user',
    };
    jest.mocked(doTargetPurposeDiscovery).mockResolvedValue(mockedPurpose);
    jest
      .mocked(mergeTargetPurposeDiscoveryResults)
      .mockImplementation((a, b) => `${a} + ${JSON.stringify(b)}`);
    jest.mocked(synthesize).mockResolvedValue({
      testCases: [],
      purpose: 'CLI purpose + Generated purpose',
      entities: [],
      injectVar: 'x',
    });

    await doGenerateRedteam(options);

    expect(mergeTargetPurposeDiscoveryResults).toHaveBeenCalledWith(
      'Config purpose',
      mockedPurpose,
    );
    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: `Config purpose + ${JSON.stringify(mockedPurpose)}`,
      }),
    );
  });

  it('should call mergeTargetPurposeDiscoveryResults even if no existing purpose', async () => {
    jest.mocked(configModule.resolveConfigs).mockResolvedValue({
      basePath: '/mock/path',
      testSuite: {
        providers: [mockProvider],
        prompts: [],
        tests: [],
      },
      config: {
        redteam: {},
        providers: ['test-provider'],
      },
    });

    const options: RedteamCliGenerateOptions = {
      output: 'output.yaml',
      config: 'config.yaml',
      cache: true,
      defaultConfig: {},
      write: true,
    };
    const mockedPurpose = {
      purpose: 'Generated purpose',
      limitations: 'Generated limitations',
      tools: [
        {
          name: 'search',
          description: 'search(query: string)',
          arguments: [{ name: 'query', description: 'query', type: 'string' }],
        },
      ],
      user: 'Generated user',
    };
    jest.mocked(doTargetPurposeDiscovery).mockResolvedValue(mockedPurpose);
    jest.mocked(synthesize).mockResolvedValue({
      testCases: [],
      purpose: 'Generated purpose',
      entities: [],
      injectVar: 'input',
    });

    await doGenerateRedteam(options);

    expect(mergeTargetPurposeDiscoveryResults).toHaveBeenCalledWith(undefined, mockedPurpose);
    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: expect.stringContaining(`undefined + ${JSON.stringify(mockedPurpose)}`),
      }),
    );
  });

  it('should log error if doTargetPurposeDiscovery throws non-Error', async () => {
    jest.mocked(configModule.resolveConfigs).mockResolvedValue({
      basePath: '/mock/path',
      testSuite: {
        providers: [mockProvider],
        prompts: [],
        tests: [],
      },
      config: {
        redteam: {},
        providers: ['test-provider'],
      },
    });

    const options: RedteamCliGenerateOptions = {
      output: 'output.yaml',
      config: 'config.yaml',
      cache: true,
      defaultConfig: {},
      write: true,
    };

    jest.mocked(doTargetPurposeDiscovery).mockRejectedValue('Some string error');
    jest.mocked(synthesize).mockResolvedValue({
      testCases: [],
      purpose: '',
      entities: [],
      injectVar: 'input',
    });

    await doGenerateRedteam(options);

    expect(logger.error).toHaveBeenCalledWith(
      'Target Discovery Agent failed from error, skipping: Some string error',
    );
  });

  it('should warn and not fail if no plugins are specified (uses default plugins)', async () => {
    jest.mocked(configModule.resolveConfigs).mockResolvedValue({
      basePath: '/mock/path',
      testSuite: {
        providers: [mockProvider],
        prompts: [{ raw: 'Prompt', label: 'L' }],
        tests: [],
      },
      config: {
        redteam: {},
        providers: ['test-provider'],
      },
    });

    jest.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        prompts: [{ raw: 'Prompt' }],
        providers: [],
        tests: [],
      }),
    );

    jest.mocked(doTargetPurposeDiscovery).mockResolvedValue({
      purpose: 'Generated purpose',
      limitations: 'Generated limitations',
      tools: [
        {
          name: 'search',
          description: 'search(query: string)',
          arguments: [{ name: 'query', description: 'query', type: 'string' }],
        },
      ],
      user: 'Generated user',
    });
    jest.mocked(synthesize).mockResolvedValue({
      testCases: [],
      purpose: 'Generated purpose',
      entities: [],
      injectVar: 'input',
    });

    const options: RedteamCliGenerateOptions = {
      output: 'output.yaml',
      config: 'config.yaml',
      cache: true,
      defaultConfig: {},
      write: true,
    };

    await doGenerateRedteam(options);

    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        plugins: expect.any(Array),
      }),
    );
  });

  it('should write targetPurposeDiscoveryResult to metadata', async () => {
    jest.mocked(configModule.resolveConfigs).mockResolvedValue({
      basePath: '/mock/path',
      testSuite: {
        providers: [mockProvider],
        prompts: [],
        tests: [],
      },
      config: {
        redteam: {},
        providers: ['test-provider'],
      },
    });

    const options: RedteamCliGenerateOptions = {
      output: 'output.yaml',
      config: 'config.yaml',
      cache: true,
      defaultConfig: {},
      write: true,
    };

    const mockedPurpose = {
      purpose: 'Generated purpose',
      limitations: 'Generated limitations',
      tools: [
        {
          name: 'search',
          description: 'search(query: string)',
          arguments: [{ name: 'query', description: 'query', type: 'string' }],
        },
      ],
      user: 'Generated user',
    };
    jest.mocked(doTargetPurposeDiscovery).mockResolvedValue(mockedPurpose);
    jest.mocked(mergeTargetPurposeDiscoveryResults).mockReturnValue('merged purpose');
    jest.mocked(synthesize).mockResolvedValue({
      testCases: [
        {
          vars: { input: 'Test input' },
          assert: [{ type: 'equals', value: 'Test output' }],
          metadata: { pluginId: 'redteam' },
        },
      ],
      purpose: 'merged purpose',
      entities: [],
      injectVar: 'input',
    });

    await doGenerateRedteam(options);

    expect(writePromptfooConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          targetPurposeDiscoveryResult: mockedPurpose,
        }),
      }),
      'output.yaml',
      expect.any(Array),
    );
  });

  describe('header comments', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should include header comments with author and cloud host when available', async () => {
      jest.mocked(getAuthor).mockReturnValue('test@example.com');
      jest.mocked(getUserEmail).mockReturnValue('test@example.com');
      jest.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.promptfoo.app');

      jest.mocked(synthesize).mockResolvedValue({
        testCases: [
          {
            vars: { input: 'Test input' },
            assert: [{ type: 'equals', value: 'Test output' }],
            metadata: { pluginId: 'redteam' },
          },
        ],
        purpose: 'Test purpose',
        entities: [],
        injectVar: 'input',
      });

      const options: RedteamCliGenerateOptions = {
        output: 'output.yaml',
        cache: true,
        defaultConfig: {},
        purpose: 'Test purpose',
        write: false,
      };

      await doGenerateRedteam(options);

      expect(writePromptfooConfig).toHaveBeenCalledWith(
        expect.any(Object),
        'output.yaml',
        expect.arrayContaining([
          expect.stringContaining('REDTEAM CONFIGURATION'),
          expect.stringContaining('Generated:'),
          expect.stringContaining('test@example.com'),
          expect.stringContaining('https://api.promptfoo.app'),
          expect.stringContaining('Test Configuration:'),
        ]),
      );
    });

    it('should show "Not logged in" when no user email', async () => {
      jest.mocked(getAuthor).mockReturnValue(null);
      jest.mocked(getUserEmail).mockReturnValue(null);

      jest.mocked(synthesize).mockResolvedValue({
        testCases: [
          {
            vars: { input: 'Test input' },
            assert: [{ type: 'equals', value: 'Test output' }],
            metadata: { pluginId: 'redteam' },
          },
        ],
        purpose: 'Test purpose',
        entities: [],
        injectVar: 'input',
      });

      const options: RedteamCliGenerateOptions = {
        output: 'output.yaml',
        cache: true,
        defaultConfig: {},
        purpose: 'Test purpose',
        write: false,
      };

      await doGenerateRedteam(options);

      expect(writePromptfooConfig).toHaveBeenCalledWith(
        expect.any(Object),
        'output.yaml',
        expect.arrayContaining([expect.stringContaining('Not logged in')]),
      );
    });

    it('should include different headers for updates vs new configs', async () => {
      jest.mocked(getAuthor).mockReturnValue('test@example.com');
      jest.mocked(getUserEmail).mockReturnValue('test@example.com');
      jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));

      jest.mocked(synthesize).mockResolvedValue({
        testCases: [
          {
            vars: { input: 'Test input' },
            assert: [{ type: 'equals', value: 'Test output' }],
            metadata: { pluginId: 'redteam' },
          },
        ],
        purpose: 'Test purpose',
        entities: [],
        injectVar: 'input',
      });

      const options: RedteamCliGenerateOptions = {
        config: 'config.yaml',
        cache: true,
        defaultConfig: {},
        write: true,
      };

      await doGenerateRedteam(options);

      expect(writePromptfooConfig).toHaveBeenCalledWith(
        expect.any(Object),
        'config.yaml',
        expect.arrayContaining([
          expect.stringContaining('REDTEAM CONFIGURATION UPDATE'),
          expect.stringContaining('Updated:'),
          expect.stringContaining('Changes:'),
          expect.stringContaining('Added'),
        ]),
      );
    });

    it('should include plugin and strategy information in headers', async () => {
      jest.mocked(getAuthor).mockReturnValue('test@example.com');
      jest.mocked(getUserEmail).mockReturnValue('test@example.com');

      jest.mocked(configModule.resolveConfigs).mockResolvedValue({
        basePath: '/mock/path',
        testSuite: {
          providers: [],
          prompts: [],
          tests: [],
        },
        config: {
          redteam: {
            plugins: [{ id: 'politics' }, { id: 'bias:gender' }],
            strategies: [{ id: 'basic' }],
          },
        },
      });

      jest.mocked(synthesize).mockResolvedValue({
        testCases: [
          {
            vars: { input: 'Test input' },
            assert: [{ type: 'equals', value: 'Test output' }],
            metadata: { pluginId: 'redteam' },
          },
        ],
        purpose: 'Test purpose',
        entities: [],
        injectVar: 'input',
      });

      const options: RedteamCliGenerateOptions = {
        output: 'output.yaml',
        config: 'config.yaml',
        cache: true,
        defaultConfig: {},
        write: false,
      };

      await doGenerateRedteam(options);

      expect(writePromptfooConfig).toHaveBeenCalledWith(
        expect.any(Object),
        'output.yaml',
        expect.arrayContaining([
          expect.stringContaining('politics, bias:gender'),
          expect.stringContaining('basic'),
        ]),
      );
    });

    it('should handle missing author gracefully', async () => {
      jest.mocked(getAuthor).mockReturnValue(null);
      jest.mocked(getUserEmail).mockReturnValue('test@example.com');
      jest.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.promptfoo.app');

      jest.mocked(synthesize).mockResolvedValue({
        testCases: [
          {
            vars: { input: 'Test input' },
            assert: [{ type: 'equals', value: 'Test output' }],
            metadata: { pluginId: 'redteam' },
          },
        ],
        purpose: 'Test purpose',
        entities: [],
        injectVar: 'input',
      });

      const options: RedteamCliGenerateOptions = {
        output: 'output.yaml',
        cache: true,
        defaultConfig: {},
        purpose: 'Test purpose',
        write: false,
      };

      await doGenerateRedteam(options);

      const headerComments = jest.mocked(writePromptfooConfig).mock.calls[0][2];
      expect(headerComments).toBeDefined();
      expect(headerComments!.some((comment) => comment.includes('Author:'))).toBe(false);
      expect(headerComments!.some((comment) => comment.includes('https://api.promptfoo.app'))).toBe(
        true,
      );
    });
  });
});
