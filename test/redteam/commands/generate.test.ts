import fs from 'fs';
import logger from '../../../src/logger';
import { synthesize } from '../../../src/redteam';
import { doGenerateRedteam } from '../../../src/redteam/commands/generate';
import type { RedteamCliGenerateOptions, RedteamPluginObject } from '../../../src/redteam/types';
import * as configModule from '../../../src/util/config/load';
import { writePromptfooConfig } from '../../../src/util/config/manage';

jest.mock('fs');
jest.mock('../../../src/logger');
jest.mock('../../../src/redteam');
jest.mock('../../../src/telemetry');
jest.mock('../../../src/util/config/load', () => ({
  combineConfigs: jest.fn(),
  resolveConfigs: jest.fn(),
}));
jest.mock('../../../src/redteam/remoteGeneration', () => ({
  shouldGenerateRemote: jest.fn().mockReturnValue(false),
  neverGenerateRemote: jest.fn().mockReturnValue(false),
  getRemoteGenerationUrl: jest.fn().mockReturnValue('http://test-url'),
}));
jest.mock('../../../src/util/config/manage');

describe('doGenerateRedteam', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(configModule.resolveConfigs).mockResolvedValue({
      basePath: '/mock/path',
      testSuite: {
        prompts: [],
        providers: [],
      },
      config: {
        redteam: {
          plugins: [],
          strategies: [],
        },
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
      testCases: [],
      purpose: 'Test purpose',
      entities: [],
    });

    await doGenerateRedteam(options);

    expect(writePromptfooConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        tests: [],
        redteam: expect.objectContaining({
          purpose: 'Test purpose',
          entities: [],
        }),
      }),
      'config.yaml',
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
    });

    await doGenerateRedteam(options);

    expect(synthesize).toHaveBeenCalledWith({
      language: undefined,
      numTests: undefined,
      purpose: 'Test purpose',
      plugins: expect.any(Array),
      prompts: expect.any(Array),
      strategies: expect.any(Array),
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
          numTests: 1, // Global setting
          plugins: [
            'contracts' as unknown as RedteamPluginObject, // String-style plugin
            { id: 'competitors' }, // Object-style plugin without override
            { id: 'overreliance', numTests: 3 }, // Object-style plugin with override
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
        plugins: [
          expect.objectContaining({ id: 'competitors', numTests: 1 }), // Should inherit global numTests
          expect.objectContaining({ id: 'contracts', numTests: 1 }), // Should inherit global numTests
          expect.objectContaining({ id: 'overreliance', numTests: 3 }), // Should use its own numTests
        ],
        prompts: ['Test prompt'],
        strategies: [],
      }),
    );
  });
});
