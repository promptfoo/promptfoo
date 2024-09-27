import fs from 'fs';
import logger from '../../../src/logger';
import { synthesize } from '../../../src/redteam';
import { doGenerateRedteam } from '../../../src/redteam/commands/generate';
import type { RedteamCliGenerateOptions } from '../../../src/redteam/types';
import * as configModule from '../../../src/util/config/load';
import { writePromptfooConfig } from '../../../src/util/config/manage';

jest.mock('fs');
jest.mock('yaml');
jest.mock('../../../src/redteam');
jest.mock('../../../src/util/config/manage');
jest.mock('../../../src/logger');
jest.mock('../../../src/telemetry');

jest.mock('../../../src/util/config/load', () => ({
  combineConfigs: jest.fn(),
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
        defaultTest: {
          metadata: {
            entities: ['Test entity'],
            purpose: 'Test purpose',
          },
        },
        prompts: [{ raw: 'Test prompt' }],
        providers: [],
        redteam: expect.objectContaining({
          entities: ['Test entity'],
          plugins: expect.any(Array),
          purpose: 'Test purpose',
          strategies: expect.any(Array),
        }),
        tests: ['file://output.yaml'],
      }),
      'config.yaml',
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
        defaultTest: {
          metadata: {
            purpose: 'Test purpose',
            entities: [],
          },
        },
        redteam: expect.objectContaining({
          purpose: 'Test purpose',
          entities: [],
          plugins: expect.arrayContaining([
            { id: 'harmful', numTests: undefined },
            { id: 'pii', numTests: undefined },
            { id: 'default', numTests: undefined },
            { id: 'contracts', numTests: undefined },
            { id: 'cross-session-leak', numTests: undefined },
            { id: 'excessive-agency', numTests: undefined },
            { id: 'hallucination', numTests: undefined },
            { id: 'hijacking', numTests: undefined },
            { id: 'overreliance', numTests: undefined },
            { id: 'politics', numTests: undefined },
          ]),
          strategies: [],
        }),
        tests: ['file://redteam.yaml'],
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
});
