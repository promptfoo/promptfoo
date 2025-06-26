import { isPromptfooSampleTarget } from '../../../src/providers/shared';
import { synthesize } from '../../../src/redteam';
import { doGenerateRedteam } from '../../../src/redteam/commands/generate';
import type { RedteamCliGenerateOptions } from '../../../src/redteam/types';
import telemetry from '../../../src/telemetry';
import type { ApiProvider } from '../../../src/types';
import * as configModule from '../../../src/util/config/load';

jest.mock('fs');
jest.mock('../../../src/redteam');
jest.mock('../../../src/telemetry');
jest.mock('../../../src/util/config/load', () => ({
  combineConfigs: jest.fn(),
  resolveConfigs: jest.fn(),
}));

jest.mock('../../../src/providers/shared', () => ({
  isPromptfooSampleTarget: jest.fn(),
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
  });

  it('should record telemetry with isPromptfooSampleTarget flag', async () => {
    jest.mocked(isPromptfooSampleTarget).mockReturnValue(true);

    const options: RedteamCliGenerateOptions = {
      output: 'output.yaml',
      config: 'config.yaml',
      cache: true,
      defaultConfig: {},
      write: true,
    };

    await doGenerateRedteam(options);

    expect(telemetry.record).toHaveBeenNthCalledWith(
      1,
      'command_used',
      expect.objectContaining({
        name: 'generate redteam - started',
        isPromptfooSampleTarget: true,
      }),
    );

    expect(telemetry.record).toHaveBeenNthCalledWith(
      2,
      'command_used',
      expect.objectContaining({
        name: 'generate redteam',
        isPromptfooSampleTarget: true,
      }),
    );
  });

  it('should handle non-sample target providers in telemetry', async () => {
    jest.mocked(isPromptfooSampleTarget).mockReturnValue(false);

    const options: RedteamCliGenerateOptions = {
      output: 'output.yaml',
      config: 'config.yaml',
      cache: true,
      defaultConfig: {},
      write: true,
    };

    await doGenerateRedteam(options);

    expect(telemetry.record).toHaveBeenNthCalledWith(
      1,
      'command_used',
      expect.objectContaining({
        name: 'generate redteam - started',
        isPromptfooSampleTarget: false,
      }),
    );

    expect(telemetry.record).toHaveBeenNthCalledWith(
      2,
      'command_used',
      expect.objectContaining({
        name: 'generate redteam',
        isPromptfooSampleTarget: false,
      }),
    );
  });

  it('should handle multiple providers in telemetry', async () => {
    const mockProviders = [
      {
        id: () => 'provider1',
        callApi: jest.fn(),
      },
      {
        id: () => 'provider2',
        callApi: jest.fn(),
      },
    ];

    jest.mocked(configModule.resolveConfigs).mockResolvedValue({
      basePath: '/mock/path',
      testSuite: {
        providers: mockProviders,
        prompts: [],
        tests: [],
      },
      config: {
        redteam: {},
      },
    });

    jest
      .mocked(isPromptfooSampleTarget)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);

    const options: RedteamCliGenerateOptions = {
      output: 'output.yaml',
      config: 'config.yaml',
      cache: true,
      defaultConfig: {},
      write: true,
    };

    await doGenerateRedteam(options);

    expect(telemetry.record).toHaveBeenNthCalledWith(
      1,
      'command_used',
      expect.objectContaining({
        name: 'generate redteam - started',
        isPromptfooSampleTarget: true,
      }),
    );

    expect(telemetry.record).toHaveBeenNthCalledWith(
      2,
      'command_used',
      expect.objectContaining({
        name: 'generate redteam',
        isPromptfooSampleTarget: true,
      }),
    );
  });

  it('should handle empty providers array in telemetry', async () => {
    jest.mocked(configModule.resolveConfigs).mockResolvedValue({
      basePath: '/mock/path',
      testSuite: {
        providers: [],
        prompts: [],
        tests: [],
      },
      config: {
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

    await doGenerateRedteam(options);

    expect(telemetry.record).toHaveBeenNthCalledWith(
      1,
      'command_used',
      expect.objectContaining({
        name: 'generate redteam - started',
        isPromptfooSampleTarget: false,
      }),
    );

    expect(telemetry.record).toHaveBeenNthCalledWith(
      2,
      'command_used',
      expect.objectContaining({
        name: 'generate redteam',
        isPromptfooSampleTarget: false,
      }),
    );
  });
});
