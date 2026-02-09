import fs from 'node:fs';

import { Command } from 'commander';
import * as yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MAX_CONCURRENCY } from '../../../src/constants';
import { getAuthor, getUserEmail } from '../../../src/globalConfig/accounts';
import { cloudConfig } from '../../../src/globalConfig/cloud';
import logger from '../../../src/logger';
import { doTargetPurposeDiscovery } from '../../../src/redteam/commands/discover';
import { doGenerateRedteam, redteamGenerateCommand } from '../../../src/redteam/commands/generate';
import { Severity } from '../../../src/redteam/constants';
import { extractMcpToolsInfo } from '../../../src/redteam/extraction/mcpTools';
import { synthesize } from '../../../src/redteam/index';
import { PartialGenerationError } from '../../../src/redteam/types';
import {
  ConfigPermissionError,
  checkCloudPermissions,
  getConfigFromCloud,
  resolveTeamId,
} from '../../../src/util/cloud';
import * as configModule from '../../../src/util/config/load';
import { readConfig } from '../../../src/util/config/load';
import { writePromptfooConfig } from '../../../src/util/config/writer';
import { getCustomPolicies } from '../../../src/util/generation';

import type {
  FailedPluginInfo,
  RedteamCliGenerateOptions,
  RedteamPluginObject,
} from '../../../src/redteam/types';
import type { ApiProvider, TestCaseWithPlugin } from '../../../src/types/index';

// Type for synthesize mock return value to avoid type inference issues in CI
type SynthesizeMockResult = {
  testCases: TestCaseWithPlugin[];
  purpose: string;
  entities: string[];
  injectVar: string;
  failedPlugins: FailedPluginInfo[];
};

vi.mock('node:fs');
vi.mock('../../../src/redteam', () => ({
  synthesize: vi.fn().mockResolvedValue({
    testCases: [],
    purpose: '',
    entities: [],
    injectVar: 'input',
    failedPlugins: [],
  } satisfies SynthesizeMockResult),
}));
vi.mock('../../../src/telemetry');
vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  getLogLevel: vi.fn().mockReturnValue('info'),
}));
vi.mock('../../../src/util/uuid', () => ({
  isUuid: vi.fn((str: string) => {
    // Simple UUID validation for testing
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }),
}));
vi.mock('../../../src/util', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    setupEnv: vi.fn(),
    printBorder: vi.fn(),
  };
});

vi.mock('../../../src/util/promptfooCommand', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    promptfooCommand: vi.fn().mockReturnValue('promptfoo redteam init'),
    detectInstaller: vi.fn().mockReturnValue('unknown'),
    isRunningUnderNpx: vi.fn().mockReturnValue(false),
  };
});
vi.mock('../../../src/util/config/load', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    combineConfigs: vi.fn(),
    resolveConfigs: vi.fn(),
    readConfig: vi.fn(),
  };
});

vi.mock('../../../src/redteam/extraction/mcpTools', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    extractMcpToolsInfo: vi.fn(),
  };
});

vi.mock('../../../src/envars', async () => ({
  ...(await vi.importActual('../../../src/envars')),

  getEnvBool: vi.fn().mockImplementation(function (key) {
    if (key === 'PROMPTFOO_REDTEAM_ENABLE_PURPOSE_DISCOVERY_AGENT') {
      return true;
    }
    return false;
  }),
}));

vi.mock('../../../src/util/cloud', async () => ({
  ...(await vi.importActual('../../../src/util/cloud')),
  getConfigFromCloud: vi.fn(),
  getCloudDatabaseId: vi.fn(),
  getPluginSeverityOverridesFromCloud: vi.fn(),
  isCloudProvider: vi.fn(),
  getDefaultTeam: vi.fn().mockResolvedValue({ id: 'test-team-id', name: 'Test Team' }),
  checkCloudPermissions: vi.fn().mockResolvedValue(undefined),
  resolveTeamId: vi.fn().mockResolvedValue({ id: 'resolved-team-id', name: 'Resolved Team' }),
}));

vi.mock('../../../src/util/generation', async () => ({
  ...(await vi.importActual('../../../src/util/generation')),
  getCustomPolicies: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('../../../src/util/config/writer', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    writePromptfooConfig: vi.fn(),
  };
});

vi.mock('../../../src/cliState', () => ({
  default: {
    remote: false,
  },
}));

vi.mock('../../../src/globalConfig/cloud', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    CloudConfig: vi.fn().mockImplementation(function () {
      return {
        isEnabled: vi.fn().mockReturnValue(false),
        getApiHost: vi.fn().mockReturnValue('https://api.promptfoo.app'),
      };
    }),

    cloudConfig: {
      isEnabled: vi.fn().mockReturnValue(false),
      getApiHost: vi.fn().mockReturnValue('https://api.promptfoo.app'),
    },
  };
});

vi.mock('../../../src/redteam/commands/discover', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    doTargetPurposeDiscovery: vi.fn(),
  };
});

vi.mock('../../../src/redteam/remoteGeneration', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    shouldGenerateRemote: vi.fn().mockReturnValue(false),
    neverGenerateRemote: vi.fn().mockReturnValue(false),
    getRemoteGenerationUrl: vi.fn().mockReturnValue('http://test-url'),
  };
});

vi.mock('../../../src/util/config/manage', () => ({
  getConfigDirectoryPath: vi.fn().mockReturnValue('/tmp/test-config'),
  setConfigDirectoryPath: vi.fn(),
  maybeReadConfig: vi.fn(),
  readConfigs: vi.fn(),
  writeMultipleOutputs: vi.fn(),
}));
vi.mock('../../../src/globalConfig/accounts', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getAuthor: vi.fn(),
    getUserEmail: vi.fn(),
    getUserId: vi.fn().mockReturnValue('test-id'),
  };
});
vi.mock('../../../src/providers', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    loadApiProviders: vi.fn().mockResolvedValue([
      {
        id: () => 'test-provider',
        callApi: vi.fn(),
        cleanup: vi.fn(),
      },
    ]),

    getProviderIds: vi.fn().mockReturnValue(['test-provider']),
  };
});

describe('doGenerateRedteam', () => {
  let mockProvider: ApiProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock implementations that persist across tests (clearAllMocks only clears call history)
    vi.mocked(extractMcpToolsInfo).mockReset();
    mockProvider = {
      id: () => 'test-provider',
      callApi: vi.fn().mockResolvedValue({ output: 'test output' }),
      cleanup: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(configModule.resolveConfigs).mockResolvedValue({
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
    vi.mocked(configModule.combineConfigs).mockResolvedValue([
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

    vi.mocked(fs.readFileSync).mockImplementation(function () {
      return JSON.stringify({
        prompts: [{ raw: 'Test prompt' }],
        providers: [],
        tests: [],
      });
    });

    vi.mocked(synthesize).mockResolvedValue({
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
      failedPlugins: [],
    });

    await doGenerateRedteam(options);

    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
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

    vi.mocked(fs.readFileSync).mockImplementation(function () {
      return JSON.stringify({});
    });
    vi.mocked(synthesize).mockResolvedValue({
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
      failedPlugins: [],
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

  it('should write description to output file when description option is provided', async () => {
    const options: RedteamCliGenerateOptions = {
      config: 'config.yaml',
      cache: true,
      defaultConfig: {},
      write: false,
      output: 'output.yaml',
      description: 'My custom scan description',
    };

    vi.mocked(fs.readFileSync).mockImplementation(function () {
      return JSON.stringify({
        prompts: [{ raw: 'Test prompt' }],
        providers: [],
        tests: [],
      });
    });

    vi.mocked(synthesize).mockResolvedValue({
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
      failedPlugins: [],
    });

    await doGenerateRedteam(options);

    expect(writePromptfooConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'My custom scan description',
        tests: expect.any(Array),
      }),
      'output.yaml',
      expect.any(Array),
    );
  });

  it('should write description to config file when write option is true and description is provided', async () => {
    const options: RedteamCliGenerateOptions = {
      config: 'config.yaml',
      cache: true,
      defaultConfig: {},
      write: true,
      description: 'My custom scan description',
    };

    vi.mocked(fs.readFileSync).mockImplementation(function () {
      return JSON.stringify({});
    });
    vi.mocked(synthesize).mockResolvedValue({
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
      failedPlugins: [],
    });

    await doGenerateRedteam(options);

    expect(writePromptfooConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'My custom scan description',
        tests: expect.any(Array),
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
    vi.mocked(extractMcpToolsInfo).mockResolvedValue('');

    const options: RedteamCliGenerateOptions = {
      purpose: 'Test purpose',
      cache: true,
      defaultConfig: {},
      write: true,
      output: 'redteam.yaml',
    };

    vi.mocked(synthesize).mockResolvedValue({
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
      failedPlugins: [],
    });

    await doGenerateRedteam(options);

    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        numTests: undefined,
        purpose: 'Test purpose',
        plugins: expect.any(Array),
        prompts: expect.any(Array),
        strategies: expect.any(Array),
        targetIds: [],
        showProgressBar: true,
        testGenerationInstructions: '',
      }),
    );
  });

  it('should properly handle numTests for both string and object-style plugins', async () => {
    vi.mocked(configModule.resolveConfigs).mockResolvedValue({
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

    vi.mocked(fs.readFileSync).mockImplementation(function () {
      return JSON.stringify({
        prompts: [{ raw: 'Test prompt' }],
        providers: [],
        tests: [],
      });
    });

    vi.mocked(synthesize).mockResolvedValue({
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
      failedPlugins: [],
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
    vi.mocked(configModule.resolveConfigs).mockResolvedValue({
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

    vi.mocked(fs.readFileSync).mockImplementation(function () {
      return JSON.stringify({
        prompts: [{ raw: 'Test prompt' }],
        providers: [],
        tests: [],
      });
    });

    vi.mocked(synthesize).mockResolvedValue({
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
      failedPlugins: [],
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
    vi.mocked(configModule.resolveConfigs).mockResolvedValue({
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

    vi.mocked(fs.readFileSync).mockImplementation(function () {
      return JSON.stringify({
        prompts: [{ raw: 'Test prompt' }],
        providers: [],
        tests: [],
      });
    });

    vi.mocked(synthesize).mockResolvedValue({
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
      failedPlugins: [],
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
    vi.mocked(configModule.resolveConfigs).mockResolvedValue({
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

    vi.mocked(fs.readFileSync).mockImplementation(function () {
      return JSON.stringify({
        prompts: [{ raw: 'Test prompt' }],
        providers: [],
        tests: [],
      });
    });

    vi.mocked(synthesize).mockResolvedValue({
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
      failedPlugins: [],
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
        maxConcurrency: DEFAULT_MAX_CONCURRENCY,
        numTests: undefined,
      }),
    );
  });

  it('should write entities to output config', async () => {
    vi.mocked(configModule.resolveConfigs).mockResolvedValue({
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

    vi.mocked(fs.readFileSync).mockImplementation(function () {
      return JSON.stringify({
        prompts: [{ raw: 'Test prompt' }],
        providers: [],
        tests: [],
      });
    });

    vi.mocked(synthesize).mockResolvedValue({
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
      failedPlugins: [],
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
    vi.mocked(synthesize).mockResolvedValue({
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
      failedPlugins: [],
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
    vi.mocked(synthesize).mockResolvedValue({
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
      failedPlugins: [],
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
      vi.mocked(mockProvider.cleanup).mockRejectedValueOnce(new Error('Cleanup failed'));
    }

    await doGenerateRedteam(options);

    expect(mockProvider.cleanup).toHaveBeenCalledWith();
  });

  it('should cleanup provider even when no test cases are generated', async () => {
    vi.mocked(synthesize).mockResolvedValue({
      testCases: [], // No test cases generated
      purpose: 'Test purpose',
      entities: ['Test entity'],
      injectVar: 'input',
      failedPlugins: [],
    });

    const options: RedteamCliGenerateOptions = {
      output: 'test-output.json',
      inRedteamRun: false,
      cache: false,
      defaultConfig: {},
      write: false,
      config: 'test-config.yaml',
    };

    const result = await doGenerateRedteam(options);

    expect(result).toBeNull();
    expect(mockProvider.cleanup).toHaveBeenCalledWith();
  });

  it('should cleanup provider even when --strict mode throws an exception', async () => {
    vi.mocked(synthesize).mockResolvedValue({
      testCases: [
        {
          vars: { input: 'Test input' },
          assert: [{ type: 'equals', value: 'Test output' }],
          metadata: { pluginId: 'working-plugin' },
        },
      ],
      purpose: 'Test purpose',
      entities: ['Test entity'],
      injectVar: 'input',
      failedPlugins: [{ pluginId: 'pii', requested: 5 }],
    });

    const options: RedteamCliGenerateOptions = {
      output: 'test-output.json',
      inRedteamRun: false,
      cache: false,
      defaultConfig: {},
      write: false,
      config: 'test-config.yaml',
      strict: true, // Enable strict mode - will throw
    };

    await expect(doGenerateRedteam(options)).rejects.toThrow();
    expect(mockProvider.cleanup).toHaveBeenCalledWith();
  });

  it('should warn but not throw when plugins fail to generate tests (default behavior)', async () => {
    vi.mocked(synthesize).mockResolvedValue({
      testCases: [
        {
          vars: { input: 'Test input' },
          assert: [{ type: 'equals', value: 'Test output' }],
          metadata: { pluginId: 'working-plugin' },
        },
      ],
      purpose: 'Test purpose',
      entities: ['Test entity'],
      injectVar: 'input',
      failedPlugins: [
        { pluginId: 'pii', requested: 5 },
        { pluginId: 'harmful:hate', requested: 3 },
      ],
    });

    const options: RedteamCliGenerateOptions = {
      output: 'test-output.json',
      inRedteamRun: false,
      cache: false,
      defaultConfig: {},
      write: false,
      config: 'test-config.yaml',
      // strict is not set (defaults to false)
    };

    // Should not throw - just warn
    await expect(doGenerateRedteam(options)).resolves.not.toThrow();

    // Verify warning was logged
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('pii'));
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('harmful:hate'));
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('--strict'));
  });

  it('should throw PartialGenerationError when plugins fail with --strict flag', async () => {
    vi.mocked(synthesize).mockResolvedValue({
      testCases: [
        {
          vars: { input: 'Test input' },
          assert: [{ type: 'equals', value: 'Test output' }],
          metadata: { pluginId: 'working-plugin' },
        },
      ],
      purpose: 'Test purpose',
      entities: ['Test entity'],
      injectVar: 'input',
      failedPlugins: [
        { pluginId: 'pii', requested: 5 },
        { pluginId: 'harmful:hate', requested: 3 },
      ],
    });

    const options: RedteamCliGenerateOptions = {
      output: 'test-output.json',
      inRedteamRun: false,
      cache: false,
      defaultConfig: {},
      write: false,
      config: 'test-config.yaml',
      strict: true, // Enable strict mode
    };

    await expect(doGenerateRedteam(options)).rejects.toThrow(PartialGenerationError);
  });

  it('should include plugin details in PartialGenerationError message with --strict', async () => {
    vi.mocked(synthesize).mockResolvedValue({
      testCases: [],
      purpose: 'Test purpose',
      entities: [],
      injectVar: 'input',
      failedPlugins: [{ pluginId: 'pii', requested: 5 }],
    });

    const options: RedteamCliGenerateOptions = {
      output: 'test-output.json',
      inRedteamRun: false,
      cache: false,
      defaultConfig: {},
      write: false,
      config: 'test-config.yaml',
      strict: true, // Enable strict mode
    };

    try {
      await doGenerateRedteam(options);
      expect.fail('Expected PartialGenerationError to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PartialGenerationError);
      expect((error as PartialGenerationError).message).toContain('pii');
      expect((error as PartialGenerationError).message).toContain('0/5 tests');
      expect((error as PartialGenerationError).failedPlugins).toHaveLength(1);
    }
  });

  it('should not warn or throw when no plugins fail', async () => {
    vi.mocked(synthesize).mockResolvedValue({
      testCases: [
        {
          vars: { input: 'Test input' },
          assert: [{ type: 'equals', value: 'Test output' }],
          metadata: { pluginId: 'working-plugin' },
        },
      ],
      purpose: 'Test purpose',
      entities: ['Test entity'],
      injectVar: 'input',
      failedPlugins: [], // No failures
    });

    const options: RedteamCliGenerateOptions = {
      output: 'test-output.json',
      inRedteamRun: false,
      cache: false,
      defaultConfig: {},
      write: false,
      config: 'test-config.yaml',
    };

    await expect(doGenerateRedteam(options)).resolves.not.toThrow();

    // Verify no warning about failed plugins was logged
    const warnCalls = vi.mocked(logger.warn).mock.calls;
    const failedPluginWarnings = warnCalls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('generation failed'),
    );
    expect(failedPluginWarnings).toHaveLength(0);
  });

  it('should warn and not fail if no plugins are specified (uses default plugins)', async () => {
    vi.mocked(configModule.resolveConfigs).mockResolvedValue({
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

    vi.mocked(fs.readFileSync).mockImplementation(function () {
      return JSON.stringify({
        prompts: [{ raw: 'Prompt' }],
        providers: [],
        tests: [],
      });
    });

    vi.mocked(doTargetPurposeDiscovery).mockResolvedValue({
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
    vi.mocked(synthesize).mockResolvedValue({
      testCases: [],
      purpose: 'Generated purpose',
      entities: [],
      injectVar: 'input',
      failedPlugins: [],
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
    vi.mocked(extractMcpToolsInfo).mockResolvedValue(mcpToolsInfo);

    vi.mocked(configModule.resolveConfigs).mockResolvedValue({
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

    vi.mocked(synthesize).mockResolvedValue({
      testCases: [],
      purpose: 'Test purpose',
      entities: [],
      injectVar: 'input',
      failedPlugins: [],
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
    vi.mocked(extractMcpToolsInfo).mockRejectedValue(new Error('MCP tools extraction failed'));

    vi.mocked(configModule.resolveConfigs).mockResolvedValue({
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

    vi.mocked(synthesize).mockResolvedValue({
      testCases: [],
      purpose: 'Test purpose',
      entities: [],
      injectVar: 'input',
      failedPlugins: [],
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
      vi.clearAllMocks();
    });

    it('should include header comments with author and cloud host when available', async () => {
      vi.mocked(getAuthor).mockImplementation(function () {
        return 'test@example.com';
      });
      vi.mocked(getUserEmail).mockImplementation(function () {
        return 'test@example.com';
      });
      vi.mocked(cloudConfig.getApiHost).mockImplementation(function () {
        return 'https://api.promptfoo.app';
      });

      vi.mocked(synthesize).mockResolvedValue({
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
        failedPlugins: [],
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
      vi.mocked(getAuthor).mockImplementation(function () {
        return null;
      });
      vi.mocked(getUserEmail).mockImplementation(function () {
        return null;
      });

      vi.mocked(synthesize).mockResolvedValue({
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
        failedPlugins: [],
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
      vi.mocked(getAuthor).mockImplementation(function () {
        return 'test@example.com';
      });
      vi.mocked(getUserEmail).mockImplementation(function () {
        return 'test@example.com';
      });
      vi.mocked(fs.readFileSync).mockImplementation(function () {
        return JSON.stringify({});
      });

      vi.mocked(synthesize).mockResolvedValue({
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
        failedPlugins: [],
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
      vi.mocked(getAuthor).mockImplementation(function () {
        return 'test@example.com';
      });
      vi.mocked(getUserEmail).mockImplementation(function () {
        return 'test@example.com';
      });

      vi.mocked(configModule.resolveConfigs).mockResolvedValue({
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

      vi.mocked(synthesize).mockResolvedValue({
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
        failedPlugins: [],
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
      vi.mocked(getAuthor).mockImplementation(function () {
        return null;
      });
      vi.mocked(getUserEmail).mockImplementation(function () {
        return 'test@example.com';
      });
      vi.mocked(cloudConfig.getApiHost).mockImplementation(function () {
        return 'https://api.promptfoo.app';
      });

      vi.mocked(synthesize).mockResolvedValue({
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
        failedPlugins: [],
      });

      const options: RedteamCliGenerateOptions = {
        output: 'output.yaml',
        cache: true,
        defaultConfig: {},
        purpose: 'Test purpose',
        write: false,
      };

      await doGenerateRedteam(options);

      const headerComments = vi.mocked(writePromptfooConfig).mock.calls[0][2];
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
        isEnabled: vi.fn().mockReturnValue(true),
        getApiHost: vi.fn().mockReturnValue('https://api.promptfoo.app'),
      };
      vi.mocked(cloudConfig).isEnabled = mockCloudConfig.isEnabled;

      // Mock checkCloudPermissions to throw an error
      const permissionError = new ConfigPermissionError('Permission denied: insufficient access');
      vi.mocked(checkCloudPermissions).mockRejectedValueOnce(permissionError);

      // Setup the test configuration
      vi.mocked(configModule.resolveConfigs).mockResolvedValue({
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
        isEnabled: vi.fn().mockReturnValue(true),
        getApiHost: vi.fn().mockReturnValue('https://api.promptfoo.app'),
      };
      vi.mocked(cloudConfig).isEnabled = mockCloudConfig.isEnabled;

      // Mock checkCloudPermissions to succeed (resolve without throwing)
      vi.mocked(checkCloudPermissions).mockResolvedValueOnce(undefined);

      // Setup the test configuration
      vi.mocked(configModule.resolveConfigs).mockResolvedValue({
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

      vi.mocked(synthesize).mockResolvedValue({
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
        failedPlugins: [],
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

  describe('policy plugin team ID resolution', () => {
    let mockProvider: ApiProvider;

    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(extractMcpToolsInfo).mockReset();
      vi.mocked(getCustomPolicies).mockReset();
      vi.mocked(resolveTeamId).mockReset();
      vi.mocked(resolveTeamId).mockResolvedValue({ id: 'resolved-team-id', name: 'Resolved Team' });
      vi.mocked(getCustomPolicies).mockResolvedValue(new Map());

      mockProvider = {
        id: () => 'test-provider',
        callApi: vi.fn().mockResolvedValue({ output: 'test output' }),
        cleanup: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(synthesize).mockResolvedValue({
        testCases: [],
        purpose: 'Test purpose',
        entities: [],
        injectVar: 'input',
        failedPlugins: [],
      } satisfies SynthesizeMockResult);
    });

    it('should always use resolveTeamId for fetching policies regardless of config metadata', async () => {
      // Use a valid UUID for policy ID (PolicyObjectSchema requires UUID or 12-char hex)
      const policyUuid = '11111111-1111-1111-1111-111111111111';

      // Setup a config with policy plugins that have valid policy object references
      vi.mocked(configModule.resolveConfigs).mockResolvedValue({
        basePath: '/mock/path',
        testSuite: {
          providers: [mockProvider],
          prompts: [{ raw: 'Test prompt', label: 'Test label' }],
          tests: [],
        },
        config: {
          // Even if config has metadata with teamId, resolveTeamId should be used
          metadata: {
            teamId: 'config-metadata-team-id',
          },
          redteam: {
            plugins: [
              {
                id: 'policy',
                config: {
                  policy: {
                    id: policyUuid,
                    name: 'Test Policy',
                  },
                },
              },
            ],
            strategies: [],
          },
        },
      });

      const options: RedteamCliGenerateOptions = {
        output: 'output.yaml',
        config: 'config.yaml',
        cache: true,
        defaultConfig: {},
        write: false,
      };

      await doGenerateRedteam(options);

      // Verify resolveTeamId was called (not using config metadata)
      expect(resolveTeamId).toHaveBeenCalled();
      // Verify getCustomPolicies was called with the resolved team ID
      expect(getCustomPolicies).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'policy',
            config: {
              policy: {
                id: policyUuid,
                name: 'Test Policy',
              },
            },
          }),
        ]),
        'resolved-team-id',
      );
    });

    it('should fetch policies using resolved team ID for org-scoped policy access', async () => {
      // Use a valid UUID for policy ID
      const policyUuid = '22222222-2222-2222-2222-222222222222';

      const policyData = {
        name: 'Resolved Policy',
        text: 'Policy text from cloud',
        severity: Severity.High,
      };
      vi.mocked(getCustomPolicies).mockResolvedValue(new Map([[policyUuid, policyData]]));

      vi.mocked(configModule.resolveConfigs).mockResolvedValue({
        basePath: '/mock/path',
        testSuite: {
          providers: [mockProvider],
          prompts: [{ raw: 'Test prompt', label: 'Test label' }],
          tests: [],
        },
        config: {
          redteam: {
            plugins: [
              {
                id: 'policy',
                config: {
                  policy: {
                    id: policyUuid,
                  },
                },
              },
            ],
            strategies: [],
          },
        },
      });

      const options: RedteamCliGenerateOptions = {
        output: 'output.yaml',
        config: 'config.yaml',
        cache: true,
        defaultConfig: {},
        write: false,
      };

      await doGenerateRedteam(options);

      // Verify the policy was resolved using the team ID from resolveTeamId
      expect(resolveTeamId).toHaveBeenCalled();
      expect(getCustomPolicies).toHaveBeenCalledWith(expect.any(Array), 'resolved-team-id');
    });

    it('should not call resolveTeamId or getCustomPolicies when no policy plugins are present', async () => {
      vi.mocked(configModule.resolveConfigs).mockResolvedValue({
        basePath: '/mock/path',
        testSuite: {
          providers: [mockProvider],
          prompts: [{ raw: 'Test prompt', label: 'Test label' }],
          tests: [],
        },
        config: {
          redteam: {
            plugins: [{ id: 'harmful:hate', numTests: 1 }],
            strategies: [],
          },
        },
      });

      const options: RedteamCliGenerateOptions = {
        output: 'output.yaml',
        config: 'config.yaml',
        cache: true,
        defaultConfig: {},
        write: false,
      };

      await doGenerateRedteam(options);

      // resolveTeamId should not be called for non-policy plugins
      expect(resolveTeamId).not.toHaveBeenCalled();
      expect(getCustomPolicies).not.toHaveBeenCalled();
    });

    it('should not call resolveTeamId for policy plugins with inline text (not policy objects)', async () => {
      vi.mocked(configModule.resolveConfigs).mockResolvedValue({
        basePath: '/mock/path',
        testSuite: {
          providers: [mockProvider],
          prompts: [{ raw: 'Test prompt', label: 'Test label' }],
          tests: [],
        },
        config: {
          redteam: {
            plugins: [
              {
                id: 'policy',
                config: {
                  // Inline text policy - not a policy object reference
                  policy: 'Do not reveal secrets',
                },
              },
            ],
            strategies: [],
          },
        },
      });

      const options: RedteamCliGenerateOptions = {
        output: 'output.yaml',
        config: 'config.yaml',
        cache: true,
        defaultConfig: {},
        write: false,
      };

      await doGenerateRedteam(options);

      // resolveTeamId should not be called for inline text policies
      expect(resolveTeamId).not.toHaveBeenCalled();
      expect(getCustomPolicies).not.toHaveBeenCalled();
    });

    it('should apply severity from resolved policy when not set on plugin', async () => {
      // Use a valid UUID for policy ID
      const policyUuid = '33333333-3333-3333-3333-333333333333';

      const policyData = {
        name: 'Critical Policy',
        text: 'Do not allow harmful content',
        severity: Severity.Critical,
      };
      vi.mocked(getCustomPolicies).mockResolvedValue(new Map([[policyUuid, policyData]]));

      vi.mocked(configModule.resolveConfigs).mockResolvedValue({
        basePath: '/mock/path',
        testSuite: {
          providers: [mockProvider],
          prompts: [{ raw: 'Test prompt', label: 'Test label' }],
          tests: [],
        },
        config: {
          redteam: {
            plugins: [
              {
                id: 'policy',
                // No severity set on plugin
                config: {
                  policy: {
                    id: policyUuid,
                  },
                },
              },
            ],
            strategies: [],
          },
        },
      });

      const options: RedteamCliGenerateOptions = {
        output: 'output.yaml',
        config: 'config.yaml',
        cache: true,
        defaultConfig: {},
        write: false,
      };

      await doGenerateRedteam(options);

      // Verify synthesize received the plugin with severity from resolved policy
      expect(synthesize).toHaveBeenCalledWith(
        expect.objectContaining({
          plugins: expect.arrayContaining([
            expect.objectContaining({
              id: 'policy',
              severity: Severity.Critical,
              config: expect.objectContaining({
                policy: expect.objectContaining({
                  id: policyUuid,
                  name: 'Critical Policy',
                  text: 'Do not allow harmful content',
                }),
              }),
            }),
          ]),
        }),
      );
    });
  });

  describe('commandLineOptions precedence', () => {
    let mockProvider: ApiProvider;

    beforeEach(() => {
      vi.clearAllMocks();
      mockProvider = {
        id: () => 'test-provider',
        callApi: vi.fn().mockResolvedValue({ output: 'test output' }),
        cleanup: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(synthesize).mockResolvedValue({
        testCases: [],
        purpose: 'Test purpose',
        entities: [],
        injectVar: 'input',
        failedPlugins: [],
      } satisfies SynthesizeMockResult);

      vi.mocked(fs.existsSync).mockImplementation(function () {
        return false;
      });
    });

    it('should use commandLineOptions.maxConcurrency from config when CLI option not provided', async () => {
      vi.mocked(configModule.resolveConfigs).mockResolvedValue({
        basePath: '/mock/path',
        testSuite: {
          providers: [mockProvider],
          prompts: [{ raw: 'Test prompt', label: 'Test' }],
          tests: [],
        },
        config: {
          redteam: {
            plugins: [{ id: 'harmful', numTests: 1 }],
          },
        },
        commandLineOptions: {
          maxConcurrency: 10,
        },
      });

      const options: RedteamCliGenerateOptions = {
        config: 'config.yaml',
        output: 'output.yaml',
        cache: true,
        defaultConfig: {},
        write: false,
      };

      await doGenerateRedteam(options);

      expect(synthesize).toHaveBeenCalledWith(
        expect.objectContaining({
          maxConcurrency: 10,
        }),
      );
    });

    it('should prioritize CLI maxConcurrency over commandLineOptions.maxConcurrency', async () => {
      vi.mocked(configModule.resolveConfigs).mockResolvedValue({
        basePath: '/mock/path',
        testSuite: {
          providers: [mockProvider],
          prompts: [{ raw: 'Test prompt', label: 'Test' }],
          tests: [],
        },
        config: {
          redteam: {
            plugins: [{ id: 'harmful', numTests: 1 }],
          },
        },
        commandLineOptions: {
          maxConcurrency: 10,
        },
      });

      const options: RedteamCliGenerateOptions = {
        config: 'config.yaml',
        output: 'output.yaml',
        cache: true,
        defaultConfig: {},
        maxConcurrency: 20, // CLI override
        write: false,
      };

      await doGenerateRedteam(options);

      expect(synthesize).toHaveBeenCalledWith(
        expect.objectContaining({
          maxConcurrency: 20,
        }),
      );
    });

    it('should use DEFAULT_MAX_CONCURRENCY when neither CLI nor commandLineOptions provided', async () => {
      vi.mocked(configModule.resolveConfigs).mockResolvedValue({
        basePath: '/mock/path',
        testSuite: {
          providers: [mockProvider],
          prompts: [{ raw: 'Test prompt', label: 'Test' }],
          tests: [],
        },
        config: {
          redteam: {
            plugins: [{ id: 'harmful', numTests: 1 }],
          },
        },
        commandLineOptions: {},
      });

      const options: RedteamCliGenerateOptions = {
        config: 'config.yaml',
        output: 'output.yaml',
        cache: true,
        defaultConfig: {},
        write: false,
      };

      await doGenerateRedteam(options);

      expect(synthesize).toHaveBeenCalledWith(
        expect.objectContaining({
          maxConcurrency: DEFAULT_MAX_CONCURRENCY,
        }),
      );
    });

    it('should use commandLineOptions.delay from config when CLI option not provided', async () => {
      vi.mocked(configModule.resolveConfigs).mockResolvedValue({
        basePath: '/mock/path',
        testSuite: {
          providers: [mockProvider],
          prompts: [{ raw: 'Test prompt', label: 'Test' }],
          tests: [],
        },
        config: {
          redteam: {
            plugins: [{ id: 'harmful', numTests: 1 }],
          },
        },
        commandLineOptions: {
          delay: 500,
        },
      });

      const options: RedteamCliGenerateOptions = {
        config: 'config.yaml',
        output: 'output.yaml',
        cache: true,
        defaultConfig: {},
        write: false,
      };

      await doGenerateRedteam(options);

      expect(synthesize).toHaveBeenCalledWith(
        expect.objectContaining({
          delay: 500,
        }),
      );
    });

    it('should prioritize CLI delay over commandLineOptions.delay', async () => {
      vi.mocked(configModule.resolveConfigs).mockResolvedValue({
        basePath: '/mock/path',
        testSuite: {
          providers: [mockProvider],
          prompts: [{ raw: 'Test prompt', label: 'Test' }],
          tests: [],
        },
        config: {
          redteam: {
            plugins: [{ id: 'harmful', numTests: 1 }],
          },
        },
        commandLineOptions: {
          delay: 500,
        },
      });

      const options: RedteamCliGenerateOptions = {
        config: 'config.yaml',
        output: 'output.yaml',
        cache: true,
        defaultConfig: {},
        delay: 1000, // CLI override
        write: false,
      };

      await doGenerateRedteam(options);

      expect(synthesize).toHaveBeenCalledWith(
        expect.objectContaining({
          delay: 1000,
        }),
      );
    });

    it('should prioritize redteamConfig.delay over commandLineOptions.delay', async () => {
      vi.mocked(configModule.resolveConfigs).mockResolvedValue({
        basePath: '/mock/path',
        testSuite: {
          providers: [mockProvider],
          prompts: [{ raw: 'Test prompt', label: 'Test' }],
          tests: [],
        },
        config: {
          redteam: {
            plugins: [{ id: 'harmful', numTests: 1 }],
            delay: 200, // redteamConfig.delay
          },
        },
        commandLineOptions: {
          delay: 500,
        },
      });

      const options: RedteamCliGenerateOptions = {
        config: 'config.yaml',
        output: 'output.yaml',
        cache: true,
        defaultConfig: {},
        write: false,
      };

      await doGenerateRedteam(options);

      expect(synthesize).toHaveBeenCalledWith(
        expect.objectContaining({
          delay: 200, // redteamConfig wins over commandLineOptions
        }),
      );
    });
  });

  describe('contexts support', () => {
    it('should generate tests for each context when contexts are defined', async () => {
      vi.mocked(configModule.resolveConfigs).mockResolvedValue({
        basePath: '/mock/path',
        testSuite: {
          providers: [
            {
              id: () => 'test-provider',
              callApi: vi.fn().mockResolvedValue({ output: 'test output' }),
            },
          ],
          prompts: [{ raw: 'Test prompt', label: 'Test prompt' }],
          tests: [],
        },
        config: {
          redteam: {
            numTests: 2,
            plugins: ['harmful:hate'] as any,
            strategies: [],
            contexts: [
              { id: 'context1', purpose: 'Context 1 purpose', vars: { role: 'user' } },
              { id: 'context2', purpose: 'Context 2 purpose', vars: { role: 'admin' } },
            ],
          },
        },
      });

      vi.mocked(synthesize).mockResolvedValue({
        testCases: [
          {
            vars: { input: 'Test input' },
            assert: [{ type: 'equals', value: 'Test output' }],
            metadata: { pluginId: 'harmful:hate' },
          },
        ],
        purpose: 'Test purpose',
        entities: ['Test entity'],
        injectVar: 'input',
        failedPlugins: [],
      });

      const options: RedteamCliGenerateOptions = {
        output: 'output.yaml',
        config: 'config.yaml',
        cache: true,
        defaultConfig: {},
        write: true,
      };

      await doGenerateRedteam(options);

      // synthesize should be called once for each context
      expect(synthesize).toHaveBeenCalledTimes(2);

      // First call should use context1's purpose
      expect(synthesize).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          purpose: expect.stringContaining('Context 1 purpose'),
        }),
      );

      // Second call should use context2's purpose
      expect(synthesize).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          purpose: expect.stringContaining('Context 2 purpose'),
        }),
      );
    });

    it('should tag test cases with context metadata', async () => {
      vi.mocked(configModule.resolveConfigs).mockResolvedValue({
        basePath: '/mock/path',
        testSuite: {
          providers: [
            {
              id: () => 'test-provider',
              callApi: vi.fn().mockResolvedValue({ output: 'test output' }),
            },
          ],
          prompts: [{ raw: 'Test prompt', label: 'Test prompt' }],
          tests: [],
        },
        config: {
          redteam: {
            numTests: 1,
            plugins: ['harmful:hate'] as any,
            strategies: [],
            contexts: [
              { id: 'test_context', purpose: 'Test context purpose', vars: { key: 'value' } },
            ],
          },
        },
      });

      vi.mocked(synthesize).mockResolvedValue({
        testCases: [
          {
            vars: { input: 'Test input' },
            assert: [{ type: 'equals', value: 'Test output' }],
            metadata: { pluginId: 'harmful:hate' },
          },
        ],
        purpose: 'Test purpose',
        entities: ['Test entity'],
        injectVar: 'input',
        failedPlugins: [],
      });

      const options: RedteamCliGenerateOptions = {
        output: 'output.yaml',
        config: 'config.yaml',
        cache: true,
        defaultConfig: {},
        write: true,
      };

      await doGenerateRedteam(options);

      // Verify the written config includes context metadata in test cases
      expect(writePromptfooConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          tests: expect.arrayContaining([
            expect.objectContaining({
              metadata: expect.objectContaining({
                contextId: 'test_context',
                purpose: 'Test context purpose',
                contextVars: { key: 'value' },
              }),
            }),
          ]),
        }),
        'output.yaml',
        expect.any(Array),
      );
    });

    it('should merge context vars into test case vars', async () => {
      vi.mocked(configModule.resolveConfigs).mockResolvedValue({
        basePath: '/mock/path',
        testSuite: {
          providers: [
            {
              id: () => 'test-provider',
              callApi: vi.fn().mockResolvedValue({ output: 'test output' }),
            },
          ],
          prompts: [{ raw: 'Test prompt', label: 'Test prompt' }],
          tests: [],
        },
        config: {
          redteam: {
            numTests: 1,
            plugins: ['harmful:hate'] as any,
            strategies: [],
            contexts: [
              {
                id: 'ctx',
                purpose: 'Context purpose',
                vars: { context_file: 'data.json', role: 'admin' },
              },
            ],
          },
        },
      });

      vi.mocked(synthesize).mockResolvedValue({
        testCases: [
          {
            vars: { input: 'Test input', existingVar: 'existing' },
            assert: [{ type: 'equals', value: 'Test output' }],
            metadata: { pluginId: 'harmful:hate' },
          },
        ],
        purpose: 'Test purpose',
        entities: ['Test entity'],
        injectVar: 'input',
        failedPlugins: [],
      });

      const options: RedteamCliGenerateOptions = {
        output: 'output.yaml',
        config: 'config.yaml',
        cache: true,
        defaultConfig: {},
        write: true,
      };

      await doGenerateRedteam(options);

      // Verify context vars are merged into test case vars
      expect(writePromptfooConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          tests: expect.arrayContaining([
            expect.objectContaining({
              vars: expect.objectContaining({
                input: 'Test input',
                existingVar: 'existing',
                context_file: 'data.json',
                role: 'admin',
              }),
            }),
          ]),
        }),
        'output.yaml',
        expect.any(Array),
      );
    });

    it('should use single purpose mode when no contexts are defined', async () => {
      // Reset MCP tools mock to prevent interference from other tests
      vi.mocked(extractMcpToolsInfo).mockResolvedValue('');

      vi.mocked(configModule.resolveConfigs).mockResolvedValue({
        basePath: '/mock/path',
        testSuite: {
          providers: [
            {
              id: () => 'test-provider',
              callApi: vi.fn().mockResolvedValue({ output: 'test output' }),
            },
          ],
          prompts: [{ raw: 'Test prompt', label: 'Test prompt' }],
          tests: [],
        },
        config: {
          redteam: {
            purpose: 'Single purpose',
            numTests: 1,
            plugins: ['harmful:hate'] as any,
            strategies: [],
            // No contexts defined
          },
        },
      });

      vi.mocked(synthesize).mockResolvedValue({
        testCases: [
          {
            vars: { input: 'Test input' },
            assert: [{ type: 'equals', value: 'Test output' }],
            metadata: { pluginId: 'harmful:hate' },
          },
        ],
        purpose: 'Single purpose',
        entities: ['Test entity'],
        injectVar: 'input',
        failedPlugins: [],
      });

      const options: RedteamCliGenerateOptions = {
        output: 'output.yaml',
        config: 'config.yaml',
        cache: true,
        defaultConfig: {},
        write: true,
      };

      await doGenerateRedteam(options);

      // synthesize should be called only once
      expect(synthesize).toHaveBeenCalledTimes(1);
      expect(synthesize).toHaveBeenCalledWith(
        expect.objectContaining({
          purpose: 'Single purpose',
        }),
      );
    });

    it('should handle contexts with empty vars', async () => {
      vi.mocked(configModule.resolveConfigs).mockResolvedValue({
        basePath: '/mock/path',
        testSuite: {
          providers: [
            {
              id: () => 'test-provider',
              callApi: vi.fn().mockResolvedValue({ output: 'test output' }),
            },
          ],
          prompts: [{ raw: 'Test prompt', label: 'Test prompt' }],
          tests: [],
        },
        config: {
          redteam: {
            numTests: 1,
            plugins: ['harmful:hate'] as any,
            strategies: [],
            contexts: [{ id: 'no_vars_context', purpose: 'Context without vars' }],
          },
        },
      });

      vi.mocked(synthesize).mockResolvedValue({
        testCases: [
          {
            vars: { input: 'Test input' },
            assert: [{ type: 'equals', value: 'Test output' }],
            metadata: { pluginId: 'harmful:hate' },
          },
        ],
        purpose: 'Test purpose',
        entities: ['Test entity'],
        injectVar: 'input',
        failedPlugins: [],
      });

      const options: RedteamCliGenerateOptions = {
        output: 'output.yaml',
        config: 'config.yaml',
        cache: true,
        defaultConfig: {},
        write: true,
      };

      await doGenerateRedteam(options);

      expect(synthesize).toHaveBeenCalledTimes(1);

      // Test case should have context metadata without contextVars
      expect(writePromptfooConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          tests: expect.arrayContaining([
            expect.objectContaining({
              metadata: expect.objectContaining({
                contextId: 'no_vars_context',
                purpose: 'Context without vars',
              }),
            }),
          ]),
        }),
        'output.yaml',
        expect.any(Array),
      );
    });

    it('should log context generation progress', async () => {
      vi.mocked(configModule.resolveConfigs).mockResolvedValue({
        basePath: '/mock/path',
        testSuite: {
          providers: [
            {
              id: () => 'test-provider',
              callApi: vi.fn().mockResolvedValue({ output: 'test output' }),
            },
          ],
          prompts: [{ raw: 'Test prompt', label: 'Test prompt' }],
          tests: [],
        },
        config: {
          redteam: {
            numTests: 1,
            plugins: ['harmful:hate'] as any,
            strategies: [],
            contexts: [
              { id: 'ctx1', purpose: 'Purpose 1' },
              { id: 'ctx2', purpose: 'Purpose 2' },
            ],
          },
        },
      });

      vi.mocked(synthesize).mockResolvedValue({
        testCases: [
          {
            vars: { input: 'Test input' },
            assert: [{ type: 'equals', value: 'Test output' }],
            metadata: { pluginId: 'harmful:hate' },
          },
        ],
        purpose: 'Test purpose',
        entities: [],
        injectVar: 'input',
        failedPlugins: [],
      });

      const options: RedteamCliGenerateOptions = {
        output: 'output.yaml',
        config: 'config.yaml',
        cache: true,
        defaultConfig: {},
        write: true,
      };

      await doGenerateRedteam(options);

      // Verify logging calls
      expect(logger.info).toHaveBeenCalledWith('Generating tests for 2 contexts...');
      expect(logger.info).toHaveBeenCalledWith('  Generating tests for context: ctx1');
      expect(logger.info).toHaveBeenCalledWith('  Generating tests for context: ctx2');
      expect(logger.info).toHaveBeenCalledWith('Generated 2 total test cases across 2 contexts');
    });
  });
});

describe('doGenerateRedteam with external defaultTest', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset resolveConfigs with default implementation (tests depend on this being set)
    vi.mocked(configModule.resolveConfigs).mockReset();
    vi.mocked(configModule.resolveConfigs).mockResolvedValue({
      basePath: '/mock/path',
      testSuite: {
        providers: [
          {
            id: () => 'test-provider',
            callApi: vi.fn().mockResolvedValue({ output: 'test output' }),
          },
        ],
        prompts: [],
        tests: [],
      },
      config: {
        redteam: {},
      },
    });

    vi.mocked(fs.existsSync).mockImplementation(function () {
      return false;
    });
    vi.mocked(fs.readFileSync).mockImplementation(function () {
      return '';
    });
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

    vi.mocked(fs.existsSync).mockImplementation(function () {
      return true;
    });
    vi.mocked(fs.readFileSync).mockImplementation(function () {
      return yaml.dump(existingConfig);
    });
    vi.mocked(readConfig).mockResolvedValue(existingConfig);

    // Mock synthesize to return test cases
    vi.mocked(synthesize).mockResolvedValue({
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
      failedPlugins: [],
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

    vi.mocked(fs.existsSync).mockImplementation(function () {
      return true;
    });
    vi.mocked(fs.readFileSync).mockImplementation(function () {
      return yaml.dump(existingConfig);
    });
    vi.mocked(readConfig).mockResolvedValue(existingConfig);

    // Mock synthesize to return test cases
    vi.mocked(synthesize).mockResolvedValue({
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
      failedPlugins: [],
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

    vi.mocked(fs.existsSync).mockImplementation(function () {
      return true;
    });
    vi.mocked(fs.readFileSync).mockImplementation(function () {
      return yaml.dump(existingConfig);
    });
    vi.mocked(readConfig).mockResolvedValue(existingConfig);

    // Mock synthesize to return test cases
    vi.mocked(synthesize).mockResolvedValue({
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
      failedPlugins: [],
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
    vi.clearAllMocks();

    program = new Command();
    // Add both generate and init commands to test both
    redteamGenerateCommand(program, 'generate', {}, undefined);
    redteamGenerateCommand(program, 'init' as 'generate', {}, undefined);
    originalExitCode = process.exitCode as number | undefined;
    process.exitCode = 0;

    mockProvider = {
      id: () => 'test-provider',
      callApi: vi.fn().mockResolvedValue({ output: 'test output' }),
      cleanup: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(configModule.resolveConfigs).mockResolvedValue({
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
    vi.restoreAllMocks();
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
    vi.mocked(getConfigFromCloud).mockResolvedValue(mockConfig);

    // Mock fs to handle the temp file write
    vi.mocked(fs.existsSync).mockImplementation(function () {
      return false;
    });
    vi.mocked(fs.writeFileSync).mockImplementation(function () {});

    vi.mocked(synthesize).mockResolvedValue({
      testCases: [],
      purpose: 'Test purpose',
      entities: [],
      injectVar: 'input',
      failedPlugins: [],
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
    vi.mocked(getConfigFromCloud).mockResolvedValue(mockConfig);

    // Mock fs to handle the temp file write
    vi.mocked(fs.existsSync).mockImplementation(function () {
      return false;
    });
    vi.mocked(fs.writeFileSync).mockImplementation(function () {});

    vi.mocked(synthesize).mockResolvedValue({
      testCases: [],
      purpose: 'Test purpose',
      entities: [],
      injectVar: 'input',
      failedPlugins: [],
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
    vi.mocked(fs.existsSync).mockImplementation(function () {
      return true;
    });
    vi.mocked(fs.readFileSync).mockImplementation(function () {
      return yaml.dump({
        prompts: ['Test prompt'],
        providers: [],
        tests: [],
      });
    });

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

  it('should accept -d/--description option in generate command', async () => {
    // Find the generate command
    const generateCommand = program.commands.find((cmd) => cmd.name() === 'generate');
    expect(generateCommand).toBeDefined();

    // Check that the -d/--description option is defined
    const descriptionOption = generateCommand!.options.find(
      (opt) => opt.short === '-d' || opt.long === '--description',
    );
    expect(descriptionOption).toBeDefined();
    expect(descriptionOption?.description).toContain('Custom description');
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
    vi.mocked(getConfigFromCloud).mockResolvedValue(mockConfig);

    // Mock fs to handle the temp file write
    vi.mocked(fs.existsSync).mockImplementation(function () {
      return false;
    });
    vi.mocked(fs.writeFileSync).mockImplementation(function () {});

    vi.mocked(synthesize).mockResolvedValue({
      testCases: [],
      purpose: 'Test purpose',
      entities: [],
      injectVar: 'input',
      failedPlugins: [],
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

describe('target ID extraction for retry strategy', () => {
  let mockProvider: ApiProvider;

  beforeEach(() => {
    vi.clearAllMocks();

    mockProvider = {
      id: () => 'test-provider',
      callApi: vi.fn().mockResolvedValue({ output: 'test output' }),
      cleanup: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));
    vi.mocked(synthesize).mockResolvedValue({
      testCases: [],
      purpose: 'Test purpose',
      entities: [],
      injectVar: 'input',
      failedPlugins: [],
    });
  });

  it('should extract target IDs from string providers', async () => {
    vi.mocked(configModule.resolveConfigs).mockResolvedValue({
      basePath: '/mock/path',
      testSuite: {
        providers: [mockProvider],
        prompts: [{ raw: 'Test prompt', label: 'Test label' }],
        tests: [],
      },
      config: {
        providers: ['openai:gpt-4o-mini', 'anthropic:claude-3-sonnet'],
        redteam: {
          plugins: ['harmful:hate' as unknown as RedteamPluginObject],
          strategies: [{ id: 'retry' }],
        },
      },
    });

    const options: RedteamCliGenerateOptions = {
      output: 'output.yaml',
      config: 'config.yaml',
      cache: true,
      defaultConfig: {},
      write: false,
    };

    await doGenerateRedteam(options);

    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        targetIds: ['openai:gpt-4o-mini', 'anthropic:claude-3-sonnet'],
      }),
    );
  });

  it('should extract target IDs from object providers with id property', async () => {
    vi.mocked(configModule.resolveConfigs).mockResolvedValue({
      basePath: '/mock/path',
      testSuite: {
        providers: [mockProvider],
        prompts: [{ raw: 'Test prompt', label: 'Test label' }],
        tests: [],
      },
      config: {
        providers: [
          { id: 'openai:gpt-4o-mini', config: { temperature: 0 } },
          { id: 'openai:gpt-4o', config: { temperature: 0.5 } },
        ],
        redteam: {
          plugins: ['harmful:hate' as unknown as RedteamPluginObject],
          strategies: [{ id: 'retry' }],
        },
      },
    });

    const options: RedteamCliGenerateOptions = {
      output: 'output.yaml',
      config: 'config.yaml',
      cache: true,
      defaultConfig: {},
      write: false,
    };

    await doGenerateRedteam(options);

    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        targetIds: ['openai:gpt-4o-mini', 'openai:gpt-4o'],
      }),
    );
  });

  it('should handle mixed string and object providers', async () => {
    vi.mocked(configModule.resolveConfigs).mockResolvedValue({
      basePath: '/mock/path',
      testSuite: {
        providers: [mockProvider],
        prompts: [{ raw: 'Test prompt', label: 'Test label' }],
        tests: [],
      },
      config: {
        providers: [
          'openai:gpt-4o-mini',
          { id: 'anthropic:claude-3-sonnet', config: {} },
          'openai:gpt-4o',
        ],
        redteam: {
          plugins: ['harmful:hate' as unknown as RedteamPluginObject],
          strategies: [],
        },
      },
    });

    const options: RedteamCliGenerateOptions = {
      output: 'output.yaml',
      config: 'config.yaml',
      cache: true,
      defaultConfig: {},
      write: false,
    };

    await doGenerateRedteam(options);

    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        targetIds: ['openai:gpt-4o-mini', 'anthropic:claude-3-sonnet', 'openai:gpt-4o'],
      }),
    );
  });

  it('should return empty array when no providers configured', async () => {
    vi.mocked(configModule.resolveConfigs).mockResolvedValue({
      basePath: '/mock/path',
      testSuite: {
        providers: [mockProvider],
        prompts: [{ raw: 'Test prompt', label: 'Test label' }],
        tests: [],
      },
      config: {
        redteam: {
          plugins: ['harmful:hate' as unknown as RedteamPluginObject],
          strategies: [],
        },
      },
    });

    const options: RedteamCliGenerateOptions = {
      output: 'output.yaml',
      config: 'config.yaml',
      cache: true,
      defaultConfig: {},
      write: false,
    };

    await doGenerateRedteam(options);

    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        targetIds: [],
      }),
    );
  });

  it('should filter out providers without id', async () => {
    vi.mocked(configModule.resolveConfigs).mockResolvedValue({
      basePath: '/mock/path',
      testSuite: {
        providers: [mockProvider],
        prompts: [{ raw: 'Test prompt', label: 'Test label' }],
        tests: [],
      },
      config: {
        providers: [
          'openai:gpt-4o-mini',
          { config: { temperature: 0 } }, // No id
          { id: 'openai:gpt-4o' },
        ],
        redteam: {
          plugins: ['harmful:hate' as unknown as RedteamPluginObject],
          strategies: [],
        },
      },
    });

    const options: RedteamCliGenerateOptions = {
      output: 'output.yaml',
      config: 'config.yaml',
      cache: true,
      defaultConfig: {},
      write: false,
    };

    await doGenerateRedteam(options);

    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        targetIds: ['openai:gpt-4o-mini', 'openai:gpt-4o'],
      }),
    );
  });
});
