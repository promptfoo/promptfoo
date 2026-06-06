import fs from 'fs';

import yaml from 'js-yaml';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { disableCache } from '../../../src/cache';
import { doGenerateDataset } from '../../../src/commands/generate/dataset';
import { generateDataset } from '../../../src/generation/dataset';
import { generateTestSuite } from '../../../src/generation/index';
import telemetry from '../../../src/telemetry';
import { synthesizeFromTestSuite } from '../../../src/testCase/synthesis';
import { resolveConfigs } from '../../../src/util/config/load';

import type { TestSuite, VarMapping } from '../../../src/types/index';

const fsMocks = vi.hoisted(() => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      ...fsMocks,
    },
    ...fsMocks,
  };
});

vi.mock('fs/promises', () => ({
  default: {
    readFile: fsMocks.readFileSync,
    writeFile: fsMocks.writeFileSync,
  },
  readFile: fsMocks.readFileSync,
  writeFile: fsMocks.writeFileSync,
}));
vi.mock('js-yaml');
vi.mock('../../../src/generation/dataset', () => ({
  generateDataset: vi.fn(),
}));
vi.mock('../../../src/generation/index', () => ({
  generateTestSuite: vi.fn(),
}));
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

    it('should preserve edge cases when enhanced generation also creates assertions', async () => {
      const configPath = 'config.yaml';
      vi.mocked(generateTestSuite).mockResolvedValue({
        dataset: {
          testCases: [{ var1: 'value1' }],
          edgeCases: [
            {
              vars: { var1: 'edge-value' },
              type: 'boundary',
              description: 'Boundary probe',
            },
          ],
          metadata: { totalGenerated: 1, durationMs: 1, provider: 'test-provider' },
        },
        assertions: {
          assertions: [{ type: 'llm-rubric', value: 'Stay accurate' }],
          metadata: {
            totalGenerated: 1,
            durationMs: 1,
            pythonConverted: 0,
            provider: 'test-provider',
          },
        },
        metadata: { totalDurationMs: 1, provider: 'test-provider' },
      } as never);

      await doGenerateDataset({
        cache: true,
        config: configPath,
        enhanced: true,
        edgeCases: true,
        numPersonas: '1',
        numTestCasesPerPersona: '1',
        output: 'output.yaml',
        write: false,
        defaultConfig: {},
        defaultConfigPath: configPath,
      });

      expect(yaml.dump).toHaveBeenCalledWith(
        expect.objectContaining({
          tests: expect.arrayContaining([
            expect.objectContaining({
              vars: { var1: 'edge-value' },
              metadata: {
                edgeCase: true,
                type: 'boundary',
                description: 'Boundary probe',
              },
            }),
          ]),
        }),
      );
    });

    it('enables concepts for iterative generation and forwards assertion provider settings', async () => {
      const configPath = 'config.yaml';
      vi.mocked(generateTestSuite).mockResolvedValue({
        dataset: {
          testCases: [],
          metadata: { totalGenerated: 0, durationMs: 1, provider: 'custom-provider' },
        },
        assertions: {
          assertions: [],
          metadata: {
            totalGenerated: 0,
            durationMs: 1,
            pythonConverted: 0,
            provider: 'custom-provider',
          },
        },
        metadata: { totalDurationMs: 1, provider: 'custom-provider' },
      } as never);

      await doGenerateDataset({
        cache: true,
        config: configPath,
        enhanced: true,
        iterative: true,
        instructions: 'Focus on finance workflows',
        provider: 'custom-provider',
        assertionType: 'g-eval',
        numAssertions: '4',
        numPersonas: '1',
        numTestCasesPerPersona: '1',
        write: false,
        defaultConfig: {},
        defaultConfigPath: configPath,
      });

      expect(generateTestSuite).toHaveBeenCalledWith(
        mockTestSuite.prompts,
        mockTestSuite.tests,
        expect.objectContaining({
          dataset: expect.objectContaining({
            concepts: {
              maxTopics: 5,
              maxEntities: 10,
              extractRelationships: true,
            },
            iterative: expect.objectContaining({ enabled: true }),
          }),
          assertions: expect.objectContaining({
            instructions: 'Focus on finance workflows',
            provider: 'custom-provider',
            type: 'g-eval',
            numAssertions: 4,
          }),
        }),
      );
    });

    it('should preserve edge cases when enhanced generation skips assertions', async () => {
      const configPath = 'config.yaml';
      vi.mocked(generateDataset).mockResolvedValue({
        testCases: [{ var1: 'value1' }],
        edgeCases: [
          {
            vars: { var1: 'empty-edge' },
            type: 'empty',
            description: 'Empty probe',
          },
        ],
        metadata: { totalGenerated: 1, durationMs: 1, provider: 'test-provider' },
      } as never);

      await doGenerateDataset({
        assertions: false,
        cache: true,
        config: configPath,
        enhanced: true,
        edgeCases: true,
        numPersonas: '1',
        numTestCasesPerPersona: '1',
        output: 'output.yaml',
        write: false,
        defaultConfig: {},
        defaultConfigPath: configPath,
      });

      expect(yaml.dump).toHaveBeenCalledWith(
        expect.objectContaining({
          tests: expect.arrayContaining([
            expect.objectContaining({
              vars: { var1: 'empty-edge' },
              metadata: {
                edgeCase: true,
                type: 'empty',
                description: 'Empty probe',
              },
            }),
          ]),
        }),
      );
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

    it('rejects invalid enhanced generation numeric options before generating', async () => {
      await expect(
        doGenerateDataset({
          cache: true,
          config: 'config.yaml',
          enhanced: true,
          numPersonas: 'zero',
          numTestCasesPerPersona: '3',
          write: false,
          defaultConfig: {},
          defaultConfigPath: 'config.yaml',
        }),
      ).rejects.toThrow('Option --numPersonas must be a positive integer.');
      expect(generateDataset).not.toHaveBeenCalled();
      expect(generateTestSuite).not.toHaveBeenCalled();
    });

    it('rejects unsupported assertion types before generating', async () => {
      await expect(
        doGenerateDataset({
          cache: true,
          config: 'config.yaml',
          enhanced: true,
          assertionType: 'unsupported' as never,
          numPersonas: '1',
          numTestCasesPerPersona: '1',
          write: false,
          defaultConfig: {},
          defaultConfigPath: 'config.yaml',
        }),
      ).rejects.toThrow('Option --assertion-type must be one of: pi, g-eval, llm-rubric.');
      expect(generateTestSuite).not.toHaveBeenCalled();
    });
  });
});
