import fs from 'fs';

import yaml from 'js-yaml';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { disableCache } from '../../../src/cache';
import { doGenerateDataset } from '../../../src/commands/generate/dataset';
import telemetry from '../../../src/telemetry';
import { synthesizeFromTestSuite } from '../../../src/testCase/synthesis';
import { resolveConfigs } from '../../../src/util/config/load';

import type { TestSuite, VarMapping } from '../../../src/types/index';

vi.mock('fs');
vi.mock('js-yaml');
vi.mock('../../../src/testCase/synthesis');
vi.mock('../../../src/util/config/load', () => ({
  resolveConfigs: vi.fn(),
}));
vi.mock('../../../src/cache', () => ({
  disableCache: vi.fn(),
}));
vi.mock('../../../src/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnValue({}),
  },
}));
vi.mock('../../../src/telemetry', () => ({
  default: {
    record: vi.fn(),
    send: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../../../src/util', () => ({
  printBorder: vi.fn(),
  setupEnv: vi.fn(),
}));

vi.mock('../../../src/util/promptfooCommand', () => ({
  promptfooCommand: vi.fn().mockReturnValue('promptfoo eval'),
  detectInstaller: vi.fn().mockReturnValue('unknown'),
  isRunningUnderNpx: vi.fn().mockReturnValue(false),
}));

describe('dataset generation', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  describe('doGenerateDataset', () => {
    const mockTestSuite: TestSuite = {
      prompts: [{ raw: 'test prompt', label: 'test' }],
      tests: [],
      providers: [
        {
          id: () => 'test-provider',
          callApi: vi.fn() as any,
        },
      ],
    };

    const mockResults: VarMapping[] = [{ var1: 'value1' }, { var1: 'value2' }];

    beforeEach(() => {
      vi.mocked(synthesizeFromTestSuite).mockResolvedValue(mockResults);
      vi.mocked(yaml.dump).mockReturnValue('yaml content');
      vi.mocked(yaml.load).mockReturnValue(mockTestSuite);
      vi.mocked(fs.readFileSync).mockReturnValue('mock config content');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
      vi.mocked(disableCache).mockImplementation(() => undefined);
      vi.mocked(telemetry.record).mockResolvedValue(undefined as never);

      vi.mocked(resolveConfigs).mockResolvedValue({
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
      ).rejects.toThrow('Could not find a config file');
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
      vi.mocked(synthesizeFromTestSuite).mockRejectedValue(new Error('Synthesis failed'));
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
