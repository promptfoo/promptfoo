import fs from 'fs';
import cliState from '../../../src/cliState';
import { doGenerateRedteam } from '../../../src/commands/generate/redteam';
import * as configModule from '../../../src/config';
import logger from '../../../src/logger';
import { synthesize } from '../../../src/redteam';
import type { RedteamGenerateOptions } from '../../../src/types/redteam';
import { writePromptfooConfig } from '../../../src/util/config';

jest.mock('fs');
jest.mock('yaml');
jest.mock('../../../src/redteam');
jest.mock('../../../src/util/config');
jest.mock('../../../src/logger');
jest.mock('../../../src/telemetry');

jest.mock('../../../src/config', () => ({
  readConfigs: jest.fn(),
  resolveConfigs: jest.fn(),
}));

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
    jest.mocked(configModule.readConfigs).mockResolvedValue([
      {
        prompts: [{ raw: 'Test prompt', label: 'Test label' }],
        providers: [],
        tests: [],
      },
    ] as any);

    const options: RedteamGenerateOptions = {
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
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Wrote 1 new test cases'));
  });

  it('should write to config file when write option is true', async () => {
    const options: RedteamGenerateOptions = {
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
    const options: RedteamGenerateOptions = {
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

  it('should update cliState with basePath', async () => {
    const options: RedteamGenerateOptions = {
      config: 'config.yaml',
      cache: true,
      defaultConfig: {},
      write: true,
    };

    jest.mocked(configModule.resolveConfigs).mockResolvedValue({
      basePath: '/mock/base/path',
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

    jest.mocked(synthesize).mockResolvedValue({
      testCases: [],
      purpose: 'Test purpose',
      entities: [],
    });

    await doGenerateRedteam(options);

    expect(cliState.basePath).toBe('/mock/base/path');
  });
});
