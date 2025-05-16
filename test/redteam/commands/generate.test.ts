import fs from 'fs';
import { getEnvBool } from '../../../src/envars';
import { synthesize } from '../../../src/redteam';
import { doTargetPurposeDiscovery, mergePurposes } from '../../../src/redteam/commands/discover';
import { doGenerateRedteam } from '../../../src/redteam/commands/generate';
import type { RedteamCliGenerateOptions } from '../../../src/redteam/types';
import type { ApiProvider, TestCaseWithPlugin } from '../../../src/types';
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
  getEnvBool: jest.fn(),
}));

jest.mock('../../../src/globalConfig/cloud', () => ({
  CloudConfig: jest.fn().mockImplementation(() => ({
    isEnabled: jest.fn().mockReturnValue(false),
    getApiHost: jest.fn().mockReturnValue('https://api.promptfoo.app'),
  })),
}));

jest.mock('../../../src/redteam/commands/discover', () => ({
  doTargetPurposeDiscovery: jest.fn(),
  mergePurposes: jest.fn(),
}));

jest.mock('../../../src/redteam/remoteGeneration', () => ({
  shouldGenerateRemote: jest.fn().mockReturnValue(false),
  neverGenerateRemote: jest.fn().mockReturnValue(false),
  getRemoteGenerationUrl: jest.fn().mockReturnValue('http://test-url'),
}));

jest.mock('../../../src/util/config/manage');
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
  const mockTestCases: TestCaseWithPlugin[] = [
    {
      vars: { input: 'test input' },
      assert: [{ type: 'equals' as const, value: 'test output' }],
      metadata: { pluginId: 'test-plugin' },
    },
  ];

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
        redteam: {
          purpose: 'Original purpose',
        },
        providers: ['test-provider'],
      },
    });

    jest.mocked(synthesize).mockResolvedValue({
      testCases: mockTestCases,
      purpose: 'Test purpose',
      entities: ['Test entity'],
      injectVar: 'input',
    });

    jest.mocked(doTargetPurposeDiscovery).mockResolvedValue('Discovered purpose');
    jest.mocked(mergePurposes).mockReturnValue('Merged purpose');
  });

  it('should skip purpose discovery when PROMPTFOO_DISABLE_REDTEAM_PURPOSE_DISCOVERY_AGENT is true', async () => {
    jest.mocked(getEnvBool).mockReturnValue(true);

    const options: RedteamCliGenerateOptions = {
      output: 'output.yaml',
      config: 'config.yaml',
      cache: true,
      defaultConfig: {},
      write: true,
      purpose: 'Original purpose',
    };

    await doGenerateRedteam(options);

    expect(doTargetPurposeDiscovery).not.toHaveBeenCalled();
    expect(mergePurposes).not.toHaveBeenCalled();
    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'Original purpose',
        plugins: expect.any(Array),
        strategies: expect.any(Array),
      }) as any,
    );
  });

  it('should attempt purpose discovery when PROMPTFOO_DISABLE_REDTEAM_PURPOSE_DISCOVERY_AGENT is false', async () => {
    jest.mocked(getEnvBool).mockReturnValue(false);

    const options: RedteamCliGenerateOptions = {
      output: 'output.yaml',
      config: 'config.yaml',
      cache: true,
      defaultConfig: {},
      write: true,
      purpose: 'Original purpose',
    };

    await doGenerateRedteam(options);

    expect(doTargetPurposeDiscovery).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(Function),
        callApi: expect.any(Function),
        cleanup: expect.any(Function),
      }),
    );
    expect(mergePurposes).toHaveBeenCalledWith('Original purpose', 'Discovered purpose');
    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'Merged purpose',
        plugins: expect.any(Array),
        strategies: expect.any(Array),
      }) as any,
    );
  });

  it('should handle missing providers array when PROMPTFOO_DISABLE_REDTEAM_PURPOSE_DISCOVERY_AGENT is false', async () => {
    jest.mocked(getEnvBool).mockReturnValue(false);

    const options: RedteamCliGenerateOptions = {
      output: 'output.yaml',
      config: 'config.yaml',
      cache: true,
      defaultConfig: {},
      write: true,
      purpose: 'Original purpose',
    };

    jest.mocked(configModule.resolveConfigs).mockResolvedValue({
      basePath: '/mock/path',
      testSuite: {
        providers: [mockProvider],
        prompts: [],
        tests: [],
      },
      config: {
        redteam: {
          purpose: 'Original purpose',
        },
      },
    });

    await doGenerateRedteam(options);

    expect(doTargetPurposeDiscovery).not.toHaveBeenCalled();
    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'Original purpose',
        plugins: expect.any(Array),
        strategies: expect.any(Array),
      }) as any,
    );
  });

  it('should generate redteam tests and write to output file', async () => {
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

    await doGenerateRedteam(options);

    expect(writePromptfooConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        tests: expect.any(Array),
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
    );
  });
});
