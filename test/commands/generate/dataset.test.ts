import fs from 'fs';
import yaml from 'js-yaml';
import { disableCache } from '../../../src/cache';
import { doGenerateDataset } from '../../../src/commands/generate/dataset';
import telemetry from '../../../src/telemetry';
import { synthesizeFromTestSuite } from '../../../src/testCase/synthesis';
import type { TestSuite, VarMapping } from '../../../src/types';
import { resolveConfigs } from '../../../src/util/config/load';

jest.mock('fs');
jest.mock('js-yaml');
jest.mock('../../../src/testCase/synthesis');
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

describe('dataset generation', () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  describe('doGenerateDataset', () => {
    const mockTestSuite: TestSuite = {
      prompts: [{ raw: 'test prompt', label: 'test' }],
      tests: [],
      providers: [
        {
          id: () => 'test-provider',
          callApi: jest.fn(),
        },
      ],
    };

    const mockResults: VarMapping[] = [{ var1: 'value1' }, { var1: 'value2' }];

    beforeEach(() => {
      jest.mocked(synthesizeFromTestSuite).mockResolvedValue(mockResults);
      jest.mocked(yaml.dump).mockReturnValue('yaml content');
      jest.mocked(yaml.load).mockReturnValue(mockTestSuite);
      jest.mocked(fs.readFileSync).mockReturnValue('mock config content');
      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest.mocked(fs.writeFileSync).mockImplementation(() => undefined);
      jest.mocked(disableCache).mockImplementation(() => undefined);
      jest.mocked(telemetry.send).mockResolvedValue(undefined);

      jest.mocked(resolveConfigs).mockResolvedValue({
        testSuite: mockTestSuite,
        config: {},
        basePath: '',
      });
    });

    it('should write YAML output', async () => {
      const configPath = 'config.yaml';

      await doGenerateDataset({
        cache: true,
        config: configPath,
        numPersonas: '5',
        numTestCasesPerPersona: '3',
        output: 'output.yaml',
        write: false,
        defaultConfig: {},
        defaultConfigPath: configPath,
      });

      expect(fs.writeFileSync).toHaveBeenCalledWith('output.yaml', 'yaml content');
    });

    it('should write CSV output', async () => {
      const configPath = 'config.yaml';

      await doGenerateDataset({
        cache: true,
        config: configPath,
        numPersonas: '5',
        numTestCasesPerPersona: '3',
        output: 'output.csv',
        write: false,
        defaultConfig: {},
        defaultConfigPath: configPath,
      });

      const expectedCsv = 'var1\n"value1"\n"value2"\n';
      expect(fs.writeFileSync).toHaveBeenCalledWith('output.csv', expectedCsv);
    });

    it('should throw error for unsupported file type', async () => {
      const configPath = 'config.yaml';

      await expect(
        doGenerateDataset({
          cache: true,
          config: configPath,
          numPersonas: '5',
          numTestCasesPerPersona: '3',
          output: 'output.txt',
          write: false,
          defaultConfig: {},
          defaultConfigPath: configPath,
        }),
      ).rejects.toThrow('Unsupported output file type: output.txt');
    });

    it('should write to config file when write option is true', async () => {
      const configPath = 'config.yaml';

      await doGenerateDataset({
        cache: true,
        config: configPath,
        numPersonas: '5',
        numTestCasesPerPersona: '3',
        write: true,
        defaultConfig: {},
        defaultConfigPath: configPath,
      });

      expect(fs.writeFileSync).toHaveBeenCalledWith(configPath, expect.any(String));
    });

    it('should throw error when no config file found', async () => {
      await expect(
        doGenerateDataset({
          cache: true,
          numPersonas: '5',
          numTestCasesPerPersona: '3',
          write: false,
          defaultConfig: {},
          defaultConfigPath: undefined,
        }),
      ).rejects.toThrow('Could not find config file');
    });

    it('should handle output without file extension', async () => {
      const configPath = 'config.yaml';

      await expect(
        doGenerateDataset({
          cache: true,
          config: configPath,
          numPersonas: '5',
          numTestCasesPerPersona: '3',
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
        doGenerateDataset({
          cache: true,
          config: configPath,
          numPersonas: '5',
          numTestCasesPerPersona: '3',
          output: 'output.yaml',
          write: false,
          defaultConfig: {},
          defaultConfigPath: configPath,
        }),
      ).rejects.toThrow('Synthesis failed');
    });
  });
});
