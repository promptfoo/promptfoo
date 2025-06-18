import { InvalidArgumentError } from 'commander';
import * as fs from 'fs';
import yaml from 'js-yaml';
import { synthesizeFromTestSuite } from '../../../src/assertions/synthesis';
import { disableCache } from '../../../src/cache';
import {
  doGenerateAssertions,
  validateAssertionType,
} from '../../../src/commands/generate/assertions';
import logger from '../../../src/logger';
import telemetry from '../../../src/telemetry';
import { type TestSuite } from '../../../src/types';
import * as configLoader from '../../../src/util/config/load';

jest.mock('fs');
jest.mock('js-yaml');
jest.mock('../../../src/util/config/load');
jest.mock('../../../src/assertions/synthesis');
jest.mock('../../../src/cache');

describe('assertions command', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(logger, 'info').mockReturnValue(logger as any);
    jest.spyOn(telemetry, 'record').mockReturnValue(telemetry as any);
    jest.spyOn(telemetry, 'send').mockResolvedValue();
    jest.mocked(yaml.dump).mockReturnValue('mocked yaml');
  });

  describe('validateAssertionType', () => {
    it('should accept valid assertion types', () => {
      expect(validateAssertionType('pi', '')).toBe('pi');
      expect(validateAssertionType('g-eval', '')).toBe('g-eval');
      expect(validateAssertionType('llm-rubric', '')).toBe('llm-rubric');
    });

    it('should throw error for invalid assertion type', () => {
      expect(() => validateAssertionType('invalid', '')).toThrow(InvalidArgumentError);
    });
  });

  describe('doGenerateAssertions', () => {
    const mockOptions = {
      cache: true,
      config: 'test.yaml',
      write: false,
      defaultConfig: {},
      defaultConfigPath: undefined,
      type: 'pi' as const,
    };

    const mockTestSuite: TestSuite = {
      prompts: [{ raw: 'test prompt', label: 'test' }],
      tests: [],
      providers: [],
    };

    const mockResults = [
      {
        label: 'test',
        question: 'Is this working?',
        code: undefined,
        question_source: 'test',
        question_type: 'test',
      },
    ];

    beforeEach(() => {
      jest
        .mocked(configLoader.resolveConfigs)
        .mockResolvedValue({ testSuite: mockTestSuite, config: {}, basePath: '.' });
      jest.mocked(synthesizeFromTestSuite).mockResolvedValue(mockResults);
    });

    it('should generate assertions and output to console by default', async () => {
      await doGenerateAssertions(mockOptions);

      expect(logger.info).toHaveBeenCalledWith('New test Cases');
      expect(yaml.dump).toHaveBeenCalledWith({
        assert: [
          {
            type: 'pi',
            metric: 'test',
            value: 'Is this working?',
          },
        ],
      });
    });

    it('should write to output file when specified', async () => {
      const options = {
        ...mockOptions,
        output: 'output.yaml',
      };

      await doGenerateAssertions(options);

      expect(fs.writeFileSync).toHaveBeenCalledWith('output.yaml', 'mocked yaml');
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Wrote 1 new assertions'));
    });

    it('should throw error for unsupported output file type', async () => {
      const options = {
        ...mockOptions,
        output: 'output.txt',
      };

      await expect(doGenerateAssertions(options)).rejects.toThrow('Unsupported output file type');
    });

    it('should disable cache when cache option is false', async () => {
      const options = {
        ...mockOptions,
        cache: false,
      };

      await doGenerateAssertions(options);

      expect(disableCache).toHaveBeenCalledWith();
    });

    it('should throw error when no config file is found', async () => {
      const options = {
        ...mockOptions,
        config: undefined,
        defaultConfigPath: undefined,
      };

      await expect(doGenerateAssertions(options)).rejects.toThrow('Could not find config file');
    });

    it('should write to existing config file when write option is true', async () => {
      const mockExistingConfig = {
        tests: [
          {
            assert: [],
          },
        ],
      };

      jest.mocked(yaml.load).mockReturnValue(mockExistingConfig);

      const options = {
        ...mockOptions,
        write: true,
      };

      await doGenerateAssertions(options);

      expect(fs.writeFileSync).toHaveBeenCalledWith('test.yaml', 'mocked yaml');
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Wrote 1 new test cases'));
    });
  });
});
