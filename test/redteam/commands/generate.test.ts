import fs from 'fs';

import { Command } from 'commander';
import * as yaml from 'js-yaml';
import { getAuthor, getUserEmail } from '../../../src/globalConfig/accounts';
import { cloudConfig } from '../../../src/globalConfig/cloud';
import logger from '../../../src/logger';
import { synthesize } from '../../../src/redteam';
import { doTargetPurposeDiscovery } from '../../../src/redteam/commands/discover';
import { doGenerateRedteam, redteamGenerateCommand } from '../../../src/redteam/commands/generate';
import { Severity } from '../../../src/redteam/constants';
import { extractMcpToolsInfo } from '../../../src/redteam/extraction/mcpTools';
import { getConfigFromCloud } from '../../../src/util/cloud';
import { checkCloudPermissions, ConfigPermissionError } from '../../../src/util/cloud';
import * as configModule from '../../../src/util/config/load';
import { readConfig } from '../../../src/util/config/load';
import { writePromptfooConfig } from '../../../src/util/config/manage';

import type { RedteamCliGenerateOptions, RedteamPluginObject } from '../../../src/redteam/types';
import type { ApiProvider } from '../../../src/types';

jest.mock('fs');
jest.mock('../../../src/redteam');
jest.mock('../../../src/telemetry');
jest.mock('uuid', () => ({
  validate: jest.fn((str: string) => {
    // Simple UUID validation for testing
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }),
}));
jest.mock('../../../src/util', () => ({
  setupEnv: jest.fn(),
  isRunningUnderNpx: jest.fn().mockReturnValue(false),
  printBorder: jest.fn(),
}));
jest.mock('../../../src/util/config/load', () => ({
  combineConfigs: jest.fn(),
  resolveConfigs: jest.fn(),
  readConfig: jest.fn(),
}));

jest.mock('../../../src/redteam/extraction/mcpTools', () => ({
  extractMcpToolsInfo: jest.fn(),
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

jest.mock('../../../src/util/cloud', () => ({
  ...jest.requireActual('../../../src/util/cloud'),
  getConfigFromCloud: jest.fn(),
  getCloudDatabaseId: jest.fn(),
  getPluginSeverityOverridesFromCloud: jest.fn(),
  isCloudProvider: jest.fn(),
  getDefaultTeam: jest.fn().mockResolvedValue({ id: 'test-team-id', name: 'Test Team' }),
  checkCloudPermissions: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/cliState', () => ({
  remote: false,
}));

jest.mock('../../../src/globalConfig/cloud', () => ({
  CloudConfig: jest.fn().mockImplementation(() => ({
    isEnabled: jest.fn().mockReturnValue(false),
    getApiHost: jest.fn().mockReturnValue('https://api.promptfoo.app'),
  })),
  cloudConfig: {
    isEnabled: jest.fn().mockReturnValue(false),
    getApiHost: jest.fn().mockReturnValue('https://api.promptfoo.app'),
  },
}));

jest.mock('../../../src/redteam/commands/discover', () => ({
  doTargetPurposeDiscovery: jest.fn(),
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
  getUserId: jest.fn().mockReturnValue('test-id'),
}));
jest.mock('../../../src/providers', () => ({
  loadApiProviders: jest.fn().mockResolvedValue([
    {
      id: () => 'test-provider',
      callApi: jest.fn(),
      cleanup: jest.fn(),
    },
  ]),
  getProviderIds: jest.fn().mockReturnValue(['test-provider']),
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
        defaultTest: {
          metadata: {
            purpose: 'Test purpose',
            entities: ['Test entity'],
          },
        },
        redteam: expect.objectContaining({
          purpose: 'Test purpose',
          entities: ['Test entity'],
        }),
        tests: [
          {
            vars: { input: 'Test input' },
            assert: [{ type: 'equals', value: 'Test output' }],
            metadata: { pluginId: 'redteam' },
          },
        ],
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
    // Mock extractMcpToolsInfo to return empty string for this test
    jest.mocked(extractMcpToolsInfo).mockResolvedValue('');

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

    await doGenerateRedteam(options);

    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        language: undefined,
        numTests: undefined,
        purpose: 'Test purpose',
        plugins: expect.any(Array),
        prompts: expect.any(Array),
        strategies: expect.any(Array),
        targetLabels: [],
        showProgressBar: true,
        testGenerationInstructions: '',
      }),
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

  it('should properly handle severity property in plugin objects', async () => {
    jest.mocked(configModule.resolveConfigs).mockResolvedValue({
      basePath: '/mock/path',
      testSuite: {
        prompts: [{ raw: 'Test prompt', label: 'Test label' }],
        providers: [],
      },
      config: {
        redteam: {
          numTests: 5,
          plugins: [
            'contracts' as unknown as RedteamPluginObject,
            { id: 'competitors', severity: Severity.Low },
            { id: 'overreliance', numTests: 3, severity: Severity.High },
            { id: 'harmful:hate', config: { customOption: true }, severity: Severity.Medium },
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

    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        language: undefined,
        numTests: 5,
        plugins: expect.arrayContaining([
          expect.objectContaining({ id: 'contracts', numTests: 5 }),
          expect.objectContaining({ id: 'competitors', numTests: 5, severity: Severity.Low }),
          expect.objectContaining({ id: 'overreliance', numTests: 3, severity: Severity.High }),
          expect.objectContaining({
            id: 'harmful:hate',
            numTests: 5,
            severity: Severity.Medium,
            config: { customOption: true },
          }),
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

  it('should enhance purpose with MCP tools information when available', async () => {
    const mcpToolsInfo = 'MCP Tools: tool1, tool2';
    jest.mocked(extractMcpToolsInfo).mockResolvedValue(mcpToolsInfo);

    jest.mocked(configModule.resolveConfigs).mockResolvedValue({
      basePath: '/mock/path',
      testSuite: {
        providers: [mockProvider],
        prompts: [{ raw: 'Test prompt', label: 'Test prompt' }],
        tests: [],
      },
      config: {
        redteam: {
          purpose: 'Original purpose',
        },
      },
    });

    jest.mocked(synthesize).mockResolvedValue({
      testCases: [],
      purpose: 'Test purpose',
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
        purpose: expect.stringContaining(mcpToolsInfo),
        testGenerationInstructions: expect.stringContaining(
          'Generate every test case prompt as a json string',
        ),
      }),
    );
  });

  it('should handle MCP tools extraction errors gracefully', async () => {
    jest.mocked(extractMcpToolsInfo).mockRejectedValue(new Error('MCP tools extraction failed'));

    jest.mocked(configModule.resolveConfigs).mockResolvedValue({
      basePath: '/mock/path',
      testSuite: {
        providers: [mockProvider],
        prompts: [{ raw: 'Test prompt', label: 'Test prompt' }],
        tests: [],
      },
      config: {
        redteam: {
          purpose: 'Original purpose',
        },
      },
    });

    jest.mocked(synthesize).mockResolvedValue({
      testCases: [],
      purpose: 'Test purpose',
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

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to extract MCP tools information'),
    );
    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'Original purpose',
      }),
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

  describe('checkCloudPermissions', () => {
    it('should fail when checkCloudPermissions throws an error', async () => {
      // Mock cloudConfig to be enabled
      const mockCloudConfig = {
        isEnabled: jest.fn().mockReturnValue(true),
        getApiHost: jest.fn().mockReturnValue('https://api.promptfoo.app'),
      };
      jest.mocked(cloudConfig).isEnabled = mockCloudConfig.isEnabled;

      // Mock checkCloudPermissions to throw an error
      const permissionError = new ConfigPermissionError('Permission denied: insufficient access');
      jest.mocked(checkCloudPermissions).mockRejectedValueOnce(permissionError);

      // Setup the test configuration
      jest.mocked(configModule.resolveConfigs).mockResolvedValue({
        basePath: '/mock/path',
        testSuite: {
          providers: [{ id: () => 'openai:gpt-4', callApi: async () => ({}) }],
          prompts: [{ raw: 'Test prompt', label: 'Test label' }],
          tests: [],
        },
        config: {
          providers: ['openai:gpt-4'],
          redteam: {},
        },
      });

      const options: RedteamCliGenerateOptions = {
        output: 'output.yaml',
        config: 'config.yaml',
        cache: true,
        defaultConfig: {},
        write: true,
      };

      await expect(doGenerateRedteam(options)).rejects.toThrow(
        'Permission denied: insufficient access',
      );

      // Verify checkCloudPermissions was called with the correct arguments
      expect(checkCloudPermissions).toHaveBeenCalledWith({
        providers: ['openai:gpt-4'],
        redteam: {},
      });

      // Verify that synthesize was not called
      expect(synthesize).not.toHaveBeenCalled();
    });

    it('should call checkCloudPermissions and proceed when it succeeds', async () => {
      // Mock cloudConfig to be enabled
      const mockCloudConfig = {
        isEnabled: jest.fn().mockReturnValue(true),
        getApiHost: jest.fn().mockReturnValue('https://api.promptfoo.app'),
      };
      jest.mocked(cloudConfig).isEnabled = mockCloudConfig.isEnabled;

      // Mock checkCloudPermissions to succeed (resolve without throwing)
      jest.mocked(checkCloudPermissions).mockResolvedValueOnce(undefined);

      // Setup the test configuration
      jest.mocked(configModule.resolveConfigs).mockResolvedValue({
        basePath: '/mock/path',
        testSuite: {
          providers: [{ id: () => 'openai:gpt-4', callApi: async () => ({}) }],
          prompts: [{ raw: 'Test prompt', label: 'Test label' }],
          tests: [],
        },
        config: {
          providers: ['openai:gpt-4'],
          redteam: {},
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
        entities: ['Test entity'],
        injectVar: 'input',
      });

      const options: RedteamCliGenerateOptions = {
        output: 'output.yaml',
        config: 'config.yaml',
        cache: true,
        defaultConfig: {},
        write: true,
        force: true,
      };

      const result = await doGenerateRedteam(options);

      // Verify checkCloudPermissions was called
      expect(checkCloudPermissions).toHaveBeenCalledWith({
        providers: ['openai:gpt-4'],
        redteam: {},
      });

      // Verify that the function proceeded normally
      expect(result).not.toBeNull();

      // Verify that synthesize was called
      expect(synthesize).toHaveBeenCalled();
    });
  });
});

describe('doGenerateRedteam with external defaultTest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(fs.existsSync).mockReturnValue(false);
    jest.mocked(fs.readFileSync).mockReturnValue('');
  });

  it('should handle string defaultTest when updating config', async () => {
    const options = {
      write: true,
      config: 'test-config.yaml',
      purpose: 'Test purpose',
      entities: ['entity1', 'entity2'],
      cache: false,
      defaultConfig: {},
    };

    const existingConfig = {
      prompts: ['Test prompt'],
      providers: ['openai:gpt-4'],
      defaultTest: 'file://external/defaultTest.yaml', // String defaultTest
    };

    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockReturnValue(yaml.dump(existingConfig));
    jest.mocked(readConfig).mockResolvedValue(existingConfig);

    // Mock synthesize to return test cases
    jest.mocked(synthesize).mockResolvedValue({
      testCases: [
        {
          vars: { input: 'Test input' },
          assert: [{ type: 'equals', value: 'Test output' }],
          metadata: { pluginId: 'redteam' },
        },
      ],
      purpose: 'Test purpose',
      entities: ['entity1', 'entity2'],
      injectVar: 'input',
    });

    await doGenerateRedteam(options);

    // Check that writePromptfooConfig was called with the correct defaultTest
    expect(writePromptfooConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultTest: expect.objectContaining({
          metadata: expect.objectContaining({
            purpose: 'Test purpose',
            entities: ['entity1', 'entity2'],
          }),
        }),
      }),
      'test-config.yaml',
      expect.any(Array),
    );
  });

  it('should merge with existing object defaultTest', async () => {
    const options = {
      write: true,
      config: 'test-config.yaml',
      purpose: 'Test purpose',
      entities: ['entity1', 'entity2'],
      cache: false,
      defaultConfig: {},
    };

    const existingConfig = {
      prompts: ['Test prompt'],
      providers: ['openai:gpt-4'],
      defaultTest: {
        assert: [{ type: 'equals' as const, value: 'test' }],
        vars: { foo: 'bar' },
      },
    };

    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockReturnValue(yaml.dump(existingConfig));
    jest.mocked(readConfig).mockResolvedValue(existingConfig);

    // Mock synthesize to return test cases
    jest.mocked(synthesize).mockResolvedValue({
      testCases: [
        {
          vars: { input: 'Test input' },
          assert: [{ type: 'equals', value: 'Test output' }],
          metadata: { pluginId: 'redteam' },
        },
      ],
      purpose: 'Test purpose',
      entities: ['entity1', 'entity2'],
      injectVar: 'input',
    });

    await doGenerateRedteam(options);

    expect(writePromptfooConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultTest: expect.objectContaining({
          assert: [{ type: 'equals', value: 'test' }],
          vars: { foo: 'bar' },
          metadata: expect.objectContaining({
            purpose: 'Test purpose',
            entities: ['entity1', 'entity2'],
          }),
        }),
      }),
      'test-config.yaml',
      expect.any(Array),
    );
  });

  it('should handle undefined defaultTest', async () => {
    const options = {
      write: true,
      config: 'test-config.yaml',
      purpose: 'Test purpose',
      entities: ['entity1', 'entity2'],
      cache: false,
      defaultConfig: {},
    };

    const existingConfig = {
      prompts: ['Test prompt'],
      providers: ['openai:gpt-4'],
      // No defaultTest
    };

    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockReturnValue(yaml.dump(existingConfig));
    jest.mocked(readConfig).mockResolvedValue(existingConfig);

    // Mock synthesize to return test cases
    jest.mocked(synthesize).mockResolvedValue({
      testCases: [
        {
          vars: { input: 'Test input' },
          assert: [{ type: 'equals', value: 'Test output' }],
          metadata: { pluginId: 'redteam' },
        },
      ],
      purpose: 'Test purpose',
      entities: ['entity1', 'entity2'],
      injectVar: 'input',
    });

    await doGenerateRedteam(options);

    expect(writePromptfooConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultTest: expect.objectContaining({
          metadata: expect.objectContaining({
            purpose: 'Test purpose',
            entities: ['entity1', 'entity2'],
          }),
        }),
      }),
      'test-config.yaml',
      expect.any(Array),
    );
  });
});

describe('redteam generate command with target option', () => {
  let program: Command;
  let originalExitCode: number | undefined;
  let mockProvider: ApiProvider;

  beforeEach(() => {
    jest.clearAllMocks();

    program = new Command();
    // Add both generate and init commands to test both
    redteamGenerateCommand(program, 'generate', {}, undefined);
    redteamGenerateCommand(program, 'init' as 'generate', {}, undefined);
    originalExitCode = process.exitCode as number | undefined;
    process.exitCode = 0;

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

  afterEach(() => {
    process.exitCode = originalExitCode;
    jest.restoreAllMocks();
  });

  it('should use target option to fetch cloud config when both config and target are UUIDs', async () => {
    const mockConfig = {
      prompts: ['Test prompt'],
      vars: {},
      providers: [{ id: 'test-provider' }],
      targets: [
        {
          id: 'test-provider',
        },
      ],
      redteam: {
        plugins: ['harmful:hate'] as any,
        strategies: [],
      },
    };
    jest.mocked(getConfigFromCloud).mockResolvedValue(mockConfig);

    // Mock fs to handle the temp file write
    jest.mocked(fs.existsSync).mockReturnValue(false);
    jest.mocked(fs.writeFileSync).mockImplementation(() => {});

    jest.mocked(synthesize).mockResolvedValue({
      testCases: [],
      purpose: 'Test purpose',
      entities: [],
      injectVar: 'input',
    });

    const configUUID = '12345678-1234-1234-1234-123456789012';
    const targetUUID = '87654321-4321-4321-4321-210987654321';

    // Find the generate command
    const generateCommand = program.commands.find((cmd) => cmd.name() === 'generate');
    expect(generateCommand).toBeDefined();

    // Execute the command with the target option
    await generateCommand!.parseAsync([
      'node',
      'test',
      '--config',
      configUUID,
      '--target',
      targetUUID,
      '--output',
      'test-output.yaml',
    ]);

    // Allow async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Verify getConfigFromCloud was called with both config and target
    expect(getConfigFromCloud).toHaveBeenCalledWith(configUUID, targetUUID);
  });

  it('should handle backwards compatibility with empty targets', async () => {
    const mockConfig = {
      prompts: ['Test prompt'],
      vars: {},
      providers: [{ id: 'test-provider' }],
      targets: [], // Empty targets array
      redteam: {
        plugins: ['harmful:hate'] as any,
        strategies: [],
      },
    };
    jest.mocked(getConfigFromCloud).mockResolvedValue(mockConfig);

    // Mock fs to handle the temp file write
    jest.mocked(fs.existsSync).mockReturnValue(false);
    jest.mocked(fs.writeFileSync).mockImplementation(() => {});

    jest.mocked(synthesize).mockResolvedValue({
      testCases: [],
      purpose: 'Test purpose',
      entities: [],
      injectVar: 'input',
    });

    const configUUID = '12345678-1234-1234-1234-123456789012';
    const targetUUID = '87654321-4321-4321-4321-210987654321';

    // Find the generate command
    const generateCommand = program.commands.find((cmd) => cmd.name() === 'generate');

    await generateCommand!.parseAsync([
      'node',
      'test',
      '--config',
      configUUID,
      '--target',
      targetUUID,
      '--output',
      'test-output.yaml',
    ]);

    // Verify that the target was added to the config for backwards compatibility
    expect(mockConfig.targets).toEqual([
      {
        id: `promptfoo://provider/${targetUUID}`,
        config: {},
      },
    ]);
  });

  it('should throw error when target is not a UUID but config is', async () => {
    const configUUID = '12345678-1234-1234-1234-123456789012';
    const invalidTarget = 'not-a-uuid';

    // Find the generate command
    const generateCommand = program.commands.find((cmd) => cmd.name() === 'generate');

    // Execute the command and expect it to throw
    await expect(
      generateCommand!.parseAsync([
        'node',
        'test',
        '--config',
        configUUID,
        '--target',
        invalidTarget,
        '--output',
        'test-output.yaml',
      ]),
    ).rejects.toThrow('Invalid target ID, it must be a valid UUID');

    // Verify getConfigFromCloud was not called
    expect(getConfigFromCloud).not.toHaveBeenCalled();
  });

  it('should log error when target is provided with local config file', async () => {
    const configPath = 'path/to/config.yaml';
    const targetUUID = '87654321-4321-4321-4321-210987654321';

    // Mock fs.existsSync to return true for the config file
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockReturnValue(
      yaml.dump({
        prompts: ['Test prompt'],
        providers: [],
        tests: [],
      }),
    );

    // Find the generate command
    const generateCommand = program.commands.find((cmd) => cmd.name() === 'generate');

    await generateCommand!.parseAsync([
      'node',
      'test',
      '--config',
      configPath,
      '--target',
      targetUUID,
      '--output',
      'test-output.yaml',
    ]);

    // Should log error message
    expect(logger.error).toHaveBeenCalledWith(
      `Target ID (-t) can only be used when -c is used with a cloud config UUID. To use a cloud target inside of a config set the id of the target to promptfoo://provider/${targetUUID}.`,
    );

    // Should set exit code to 1
    expect(process.exitCode).toBe(1);

    // getConfigFromCloud should not be called
    expect(getConfigFromCloud).not.toHaveBeenCalled();
  });

  it('should log error when target is provided without any config', async () => {
    const targetUUID = '87654321-4321-4321-4321-210987654321';

    // Find the generate command
    const generateCommand = program.commands.find((cmd) => cmd.name() === 'generate');

    await generateCommand!.parseAsync([
      'node',
      'test',
      '--target',
      targetUUID,
      '--output',
      'test-output.yaml',
    ]);

    // Should log error message
    expect(logger.error).toHaveBeenCalledWith(
      `Target ID (-t) can only be used when -c is used with a cloud config UUID. To use a cloud target inside of a config set the id of the target to promptfoo://provider/${targetUUID}.`,
    );

    // Should set exit code to 1
    expect(process.exitCode).toBe(1);

    // getConfigFromCloud should not be called
    expect(getConfigFromCloud).not.toHaveBeenCalled();
  });

  it('should accept -t/--target option in generate command', async () => {
    // Find the generate command
    const generateCommand = program.commands.find((cmd) => cmd.name() === 'generate');
    expect(generateCommand).toBeDefined();

    // Check that the -t/--target option is defined
    const targetOption = generateCommand!.options.find(
      (opt) => opt.short === '-t' || opt.long === '--target',
    );
    expect(targetOption).toBeDefined();
    expect(targetOption?.description).toContain('Cloud provider target ID');
  });

  it('should also work with the init alias command', async () => {
    const mockConfig = {
      prompts: ['Test prompt'],
      vars: {},
      providers: [{ id: 'test-provider' }],
      targets: [
        {
          id: 'test-provider',
        },
      ],
      redteam: {
        plugins: ['harmful:hate'] as any,
        strategies: [],
      },
    };
    jest.mocked(getConfigFromCloud).mockResolvedValue(mockConfig);

    // Mock fs to handle the temp file write
    jest.mocked(fs.existsSync).mockReturnValue(false);
    jest.mocked(fs.writeFileSync).mockImplementation(() => {});

    jest.mocked(synthesize).mockResolvedValue({
      testCases: [],
      purpose: 'Test purpose',
      entities: [],
      injectVar: 'input',
    });

    const configUUID = '12345678-1234-1234-1234-123456789012';
    const targetUUID = '87654321-4321-4321-4321-210987654321';

    // Find the init command (alias for generate)
    const initCommand = program.commands.find((cmd) => cmd.name() === 'init');
    expect(initCommand).toBeDefined();

    // Check that the -t/--target option is defined
    const targetOption = initCommand!.options.find(
      (opt) => opt.short === '-t' || opt.long === '--target',
    );
    expect(targetOption).toBeDefined();

    // Execute the command with the target option
    await initCommand!.parseAsync([
      'node',
      'test',
      '--config',
      configUUID,
      '--target',
      targetUUID,
      '--output',
      'test-output.yaml',
    ]);

    // Verify getConfigFromCloud was called with both config and target
    expect(getConfigFromCloud).toHaveBeenCalledWith(configUUID, targetUUID);
  });
});
