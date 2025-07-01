import fs from 'fs';
import yaml from 'js-yaml';
import { synthesizeFromTestSuite } from '../../../src/assertions/synthesis';
import { disableCache } from '../../../src/cache';
import { doGenerateAssertions } from '../../../src/commands/generate/assertions';
import telemetry from '../../../src/telemetry';
import type { Assertion, TestSuite } from '../../../src/types';
import { resolveConfigs } from '../../../src/util/config/load';

jest.mock('fs');
jest.mock('js-yaml');
jest.mock('../../../src/assertions/synthesis');
jest.mock('../../../src/util/config/load');
jest.mock('../../../src/cache');
jest.mock('../../../src/logger');
jest.mock('../../../src/telemetry', () => ({
  record: jest.fn(),
  send: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../src/util', () => ({
  isRunningUnderNpx: jest.fn().mockReturnValue(false),
  printBorder: jest.fn(),
  setupEnv: jest.fn(),
}));

describe('assertion generation', () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  describe('doGenerateAssertions', () => {
    const mockTestSuite: TestSuite = {
      prompts: [{ raw: 'test prompt', label: 'test' }],
      tests: [
        {
          assert: [
            {
              type: 'llm-rubric',
              value: 'test question',
            },
          ],
        },
      ],
      providers: [
        {
          id: () => 'test-provider',
          callApi: jest.fn(),
        },
      ],
    };

    const mockResults: Assertion[] = [
      { type: 'pi', value: 'additional assertion' },
      { type: 'pi', value: 'additional assertion 2' },
    ];

    beforeEach(() => {
      jest.mocked(synthesizeFromTestSuite).mockResolvedValue(mockResults);
      jest.mocked(yaml.dump).mockReturnValue('yaml content');
      jest.mocked(yaml.load).mockReturnValue(mockTestSuite);
      jest.mocked(fs.readFileSync).mockReturnValue('mock config content');
      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest.mocked(fs.writeFileSync).mockImplementation(() => undefined);
      jest.mocked(disableCache).mockImplementation(() => undefined);
      jest.mocked(telemetry.record).mockImplementation(() => undefined);

      jest.mocked(resolveConfigs).mockResolvedValue({
        testSuite: mockTestSuite,
        config: {},
        basePath: '',
      });
    });

    it('should write YAML output', async () => {
      const configPath = 'config.yaml';

      await doGenerateAssertions({
        cache: true,
        config: configPath,
        numAssertions: '2',
        type: 'pi',
        output: 'output.yaml',
        write: false,
        defaultConfig: {},
        defaultConfigPath: configPath,
      });

      expect(fs.writeFileSync).toHaveBeenCalledWith('output.yaml', 'yaml content');
    });

    it('should throw error for unsupported file type', async () => {
      const configPath = 'config.yaml';

      await expect(
        doGenerateAssertions({
          cache: true,
          config: configPath,
          numAssertions: '2',
          type: 'pi',
          output: 'output.txt',
          write: false,
          defaultConfig: {},
          defaultConfigPath: configPath,
        }),
      ).rejects.toThrow('Unsupported output file type: output.txt');
    });

    it('should write to config file when write option is true', async () => {
      const configPath = 'config.yaml';

      await doGenerateAssertions({
        cache: true,
        config: configPath,
        numAssertions: '2',
        type: 'pi',
        write: true,
        defaultConfig: {},
        defaultConfigPath: configPath,
      });

      expect(fs.writeFileSync).toHaveBeenCalledWith(configPath, expect.any(String));
    });

    it('should throw error when no config file found', async () => {
      await expect(
        doGenerateAssertions({
          cache: true,
          numAssertions: '2',
          type: 'pi',
          write: false,
          defaultConfig: {},
          defaultConfigPath: undefined,
        }),
      ).rejects.toThrow('Could not find config file');
    });

    it('should handle output without file extension', async () => {
      const configPath = 'config.yaml';

      await expect(
        doGenerateAssertions({
          cache: true,
          config: configPath,
          numAssertions: '2',
          type: 'pi',
          output: 'output',
          write: false,
          defaultConfig: {},
          defaultConfigPath: configPath,
        }),
      ).rejects.toThrow('Unsupported output file type: output');
    });

    it('should handle synthesis errors', async () => {
      jest.mocked(synthesizeFromTestSuite).mockRejectedValue(new Error('Synthesis failed'));
      const configPath = 'config.yaml';

      await expect(
        doGenerateAssertions({
          cache: true,
          config: configPath,
          numAssertions: '2',
          type: 'pi',
          output: 'output.yaml',
          write: false,
          defaultConfig: {},
          defaultConfigPath: configPath,
        }),
      ).rejects.toThrow('Synthesis failed');
    });
  });
});
