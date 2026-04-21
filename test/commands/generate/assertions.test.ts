import fs from 'fs';

import yaml from 'js-yaml';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { synthesizeFromTestSuite } from '../../../src/assertions/synthesis';
import { disableCache } from '../../../src/cache';
import { doGenerateAssertions } from '../../../src/commands/generate/assertions';
import telemetry from '../../../src/telemetry';
import { resolveConfigs } from '../../../src/util/config/load';

import type { Assertion, TestSuite } from '../../../src/types/index';

vi.mock('fs');
vi.mock('js-yaml');
vi.mock('../../../src/assertions/synthesis');
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

describe('assertion generation', () => {
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
          callApi: vi.fn() as any,
        },
      ],
    };

    const mockResults: Assertion[] = [
      { type: 'pi', value: 'additional assertion' },
      { type: 'pi', value: 'additional assertion 2' },
    ];

    beforeEach(() => {
      vi.mocked(synthesizeFromTestSuite).mockResolvedValue(mockResults);
      vi.mocked(yaml.dump).mockReturnValue('yaml content');
      vi.mocked(yaml.load).mockReturnValue(mockTestSuite);
      vi.mocked(fs.readFileSync).mockReturnValue('mock config content');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
      vi.mocked(disableCache).mockImplementation(() => undefined);
      vi.mocked(telemetry.record).mockImplementation(() => undefined);

      vi.mocked(resolveConfigs).mockResolvedValue({
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
      ).rejects.toThrow('Could not find a config file');
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
      vi.mocked(synthesizeFromTestSuite).mockRejectedValue(new Error('Synthesis failed'));
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
