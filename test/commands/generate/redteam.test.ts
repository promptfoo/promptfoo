import fs from 'fs';
import { doGenerateRedteam } from '../../../src/commands/generate/redteam';
import * as configModule from '../../../src/config';
import logger from '../../../src/logger';
import { synthesize } from '../../../src/redteam';
import type { RedteamGenerateOptions } from '../../../src/types/redteam';
import { writePromptfooConfig } from '../../../src/util/config';

// Mock modules that interact with the file system or external services
jest.mock('fs');
jest.mock('yaml');
jest.mock('../../../src/redteam');
jest.mock('../../../src/util/config');
jest.mock('../../../src/logger');
jest.mock('../../../src/telemetry');

// Update the mock for the config module
jest.mock('../../../src/config', () => ({
  readConfigs: jest.fn(),
  resolveConfigs: jest.fn(),
}));

describe('doGenerateRedteam', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock resolveConfigs to return a more complete object
    jest.mocked(configModule.resolveConfigs).mockResolvedValue({
      basePath: '/mock/path',
      testSuite: {
        prompts: [],
      },
      config: {
        redteam: {
          // Add any necessary redteam config properties here
        },
      },
    });
  });

  it('should generate redteam tests and write to output file', async () => {
    // Set up mock implementation for readConfigs
    jest.mocked(configModule.readConfigs).mockResolvedValue([{}]);

    // Mock input
    const options: RedteamGenerateOptions = {
      output: 'output.yaml',
      config: 'config.yaml',
      cache: true,
      defaultConfig: {},
      write: true,
    };

    // Mock file system
    jest.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        prompts: [{ raw: 'Test prompt' }],
        providers: [],
        tests: [],
      }),
    );

    // Mock synthesize function
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

    // Execute function
    await doGenerateRedteam(options);

    // Updated Assertions
    expect(synthesize).toHaveBeenCalledWith({
      language: undefined,
      numTests: undefined,
      plugins: expect.any(Array),
      prompts: expect.any(Array),
      strategies: expect.any(Array),
    });
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
          plugins: expect.any(Array),
          strategies: expect.any(Array),
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
});
