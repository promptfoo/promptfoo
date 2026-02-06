import fs from 'fs';

import yaml from 'js-yaml';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { disableCache } from '../../../src/cache';
import { doGenerateTests } from '../../../src/commands/generate/tests';
import { generateTestSuite } from '../../../src/generation/index';
import telemetry from '../../../src/telemetry';
import { resolveConfigs } from '../../../src/util/config/load';

import type { TestSuite } from '../../../src/types/index';

vi.mock('fs');
vi.mock('js-yaml');
vi.mock('../../../src/generation/index', () => ({
  generateTestSuite: vi.fn(),
}));
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
    level: 'info',
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

describe('generate tests command', () => {
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

  describe('doGenerateTests', () => {
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

    const mockCombinedResult = {
      dataset: {
        testCases: [{ var1: 'value1' }, { var1: 'value2' }],
        metadata: {
          totalGenerated: 2,
          durationMs: 1000,
          provider: 'test-provider',
        },
      },
      assertions: {
        assertions: [
          { type: 'pi' as const, value: 'test assertion 1' },
          { type: 'pi' as const, value: 'test assertion 2' },
        ],
        metadata: {
          totalGenerated: 2,
          pythonConverted: 0,
          durationMs: 500,
          provider: 'test-provider',
        },
      },
      metadata: {
        totalDurationMs: 1500,
        provider: 'test-provider',
      },
    };

    beforeEach(() => {
      vi.mocked(generateTestSuite).mockResolvedValue(mockCombinedResult);
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

    it('should generate combined test suite and output YAML', async () => {
      const configPath = 'config.yaml';

      await doGenerateTests({
        cache: true,
        config: configPath,
        numPersonas: '5',
        numTestCasesPerPersona: '3',
        output: 'output.yaml',
        write: false,
        type: 'pi',
        defaultConfig: {},
        defaultConfigPath: configPath,
      });

      expect(generateTestSuite).toHaveBeenCalledWith(
        mockTestSuite.prompts,
        mockTestSuite.tests || [],
        expect.objectContaining({
          parallel: false,
          skipDataset: false,
          skipAssertions: false,
        }),
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith('output.yaml', 'yaml content');
    });

    it('should throw error for unsupported file type', async () => {
      const configPath = 'config.yaml';

      await expect(
        doGenerateTests({
          cache: true,
          config: configPath,
          numPersonas: '5',
          numTestCasesPerPersona: '3',
          output: 'output.txt',
          write: false,
          type: 'pi',
          defaultConfig: {},
          defaultConfigPath: configPath,
        }),
      ).rejects.toThrow('Unsupported output file type');
    });

    it('should write to config file when write option is true', async () => {
      const configPath = 'config.yaml';

      await doGenerateTests({
        cache: true,
        config: configPath,
        numPersonas: '5',
        numTestCasesPerPersona: '3',
        write: true,
        type: 'pi',
        defaultConfig: {},
        defaultConfigPath: configPath,
      });

      expect(fs.writeFileSync).toHaveBeenCalledWith(configPath, expect.any(String));
    });

    it('should throw error when no config file found', async () => {
      await expect(
        doGenerateTests({
          cache: true,
          numPersonas: '5',
          numTestCasesPerPersona: '3',
          write: false,
          type: 'pi',
          defaultConfig: {},
          defaultConfigPath: undefined,
        }),
      ).rejects.toThrow('Could not find config file');
    });

    it('should support datasetOnly option', async () => {
      const configPath = 'config.yaml';

      await doGenerateTests({
        cache: true,
        config: configPath,
        numPersonas: '5',
        numTestCasesPerPersona: '3',
        write: false,
        type: 'pi',
        datasetOnly: true,
        defaultConfig: {},
        defaultConfigPath: configPath,
      });

      expect(generateTestSuite).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          skipAssertions: true,
        }),
      );
    });

    it('should support assertionsOnly option', async () => {
      const configPath = 'config.yaml';

      await doGenerateTests({
        cache: true,
        config: configPath,
        numPersonas: '5',
        numTestCasesPerPersona: '3',
        write: false,
        type: 'pi',
        assertionsOnly: true,
        defaultConfig: {},
        defaultConfigPath: configPath,
      });

      expect(generateTestSuite).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          skipDataset: true,
        }),
      );
    });

    it('should support parallel option', async () => {
      const configPath = 'config.yaml';

      await doGenerateTests({
        cache: true,
        config: configPath,
        numPersonas: '5',
        numTestCasesPerPersona: '3',
        write: false,
        type: 'pi',
        parallel: true,
        defaultConfig: {},
        defaultConfigPath: configPath,
      });

      expect(generateTestSuite).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          parallel: true,
        }),
      );
    });

    it('should disable cache when cache option is false', async () => {
      const configPath = 'config.yaml';

      await doGenerateTests({
        cache: false,
        config: configPath,
        numPersonas: '5',
        numTestCasesPerPersona: '3',
        write: false,
        type: 'pi',
        defaultConfig: {},
        defaultConfigPath: configPath,
      });

      expect(disableCache).toHaveBeenCalled();
    });

    it('should record telemetry', async () => {
      const configPath = 'config.yaml';

      await doGenerateTests({
        cache: true,
        config: configPath,
        numPersonas: '5',
        numTestCasesPerPersona: '3',
        write: false,
        type: 'pi',
        defaultConfig: {},
        defaultConfigPath: configPath,
      });

      expect(telemetry.record).toHaveBeenCalledWith(
        'command_used',
        expect.objectContaining({
          name: 'generate_tests - started',
        }),
      );
      expect(telemetry.record).toHaveBeenCalledWith(
        'command_used',
        expect.objectContaining({
          name: 'generate_tests',
        }),
      );
    });

    it('should handle generation errors', async () => {
      vi.mocked(generateTestSuite).mockRejectedValue(new Error('Generation failed'));
      const configPath = 'config.yaml';

      await expect(
        doGenerateTests({
          cache: true,
          config: configPath,
          numPersonas: '5',
          numTestCasesPerPersona: '3',
          write: false,
          type: 'pi',
          defaultConfig: {},
          defaultConfigPath: configPath,
        }),
      ).rejects.toThrow('Generation failed');
    });
  });
});
