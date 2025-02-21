import { Command } from 'commander';
import {
  showRedteamProviderLabelMissingWarning,
  doEval,
  evalCommand,
} from '../../src/commands/eval';
import logger from '../../src/logger';
import Eval from '../../src/models/eval';
import type { TestSuite, UnifiedConfig } from '../../src/types';

jest.mock('../../src/logger');

describe('eval command', () => {
  let program: Command;
  let defaultConfig: Partial<UnifiedConfig>;

  beforeEach(() => {
    program = new Command();
    defaultConfig = {};
    jest.clearAllMocks();
  });

  describe('showRedteamProviderLabelMissingWarning', () => {
    it('should show warning when provider has no label', () => {
      const testSuite: TestSuite = {
        providers: [
          {
            id: () => 'test-provider',
            callApi: async () => ({ output: 'test' }),
          },
        ],
        prompts: [],
        tests: [],
      };

      showRedteamProviderLabelMissingWarning(testSuite);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Warning: Your target (provider) does not have a label specified'),
      );
    });

    it('should not show warning when all providers have labels', () => {
      const testSuite: TestSuite = {
        providers: [
          {
            id: () => 'test-provider',
            label: 'test-label',
            callApi: async () => ({ output: 'test' }),
          },
        ],
        prompts: [],
        tests: [],
      };

      showRedteamProviderLabelMissingWarning(testSuite);

      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('doEval', () => {
    it('should run evaluation with basic config', async () => {
      const cmdObj = {
        config: ['test-config.yaml'],
        output: ['output.json'],
        write: true,
      };

      const evalRecord = new Eval({});
      evalRecord.id = 'test-eval-id';
      evalRecord.prompts = [
        {
          provider: 'test-provider',
          raw: 'test prompt',
          label: 'test',
          metrics: {
            testPassCount: 1,
            testFailCount: 0,
            testErrorCount: 0,
            assertPassCount: 1,
            assertFailCount: 0,
            score: 1,
            cost: 0,
            tokenUsage: {},
            totalLatencyMs: 0,
            namedScores: {},
            namedScoresCount: {},
          },
        },
      ];

      const mockEvalCreate = jest.spyOn(Eval, 'create').mockResolvedValue(evalRecord);

      await doEval(cmdObj, defaultConfig, 'test-config.yaml', {});

      expect(mockEvalCreate).toHaveBeenCalledWith({}, []);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Evaluation complete'));
    });

    it('should handle watch mode', async () => {
      const cmdObj = {
        config: ['test-config.yaml'],
        watch: true,
      };

      const evalRecord = new Eval({});
      evalRecord.id = 'test-eval-id';
      evalRecord.prompts = [
        {
          provider: 'test-provider',
          raw: 'test prompt',
          label: 'test',
          metrics: {
            testPassCount: 1,
            testFailCount: 0,
            testErrorCount: 0,
            assertPassCount: 1,
            assertFailCount: 0,
            score: 1,
            cost: 0,
            tokenUsage: {},
            totalLatencyMs: 0,
            namedScores: {},
            namedScoresCount: {},
          },
        },
      ];

      jest.spyOn(Eval, 'create').mockResolvedValue(evalRecord);

      await doEval(cmdObj, defaultConfig, 'test-config.yaml', {});

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Watching for file changes'),
      );
    });

    it('should handle errors and set exit code', async () => {
      const cmdObj = {
        config: ['test-config.yaml'],
      };

      const evalRecord = new Eval({});
      evalRecord.id = 'test-eval-id';
      evalRecord.prompts = [
        {
          provider: 'test-provider',
          raw: 'test prompt',
          label: 'test',
          metrics: {
            testPassCount: 0,
            testFailCount: 1,
            testErrorCount: 0,
            assertPassCount: 0,
            assertFailCount: 1,
            score: 0,
            cost: 0,
            tokenUsage: {},
            totalLatencyMs: 0,
            namedScores: {},
            namedScoresCount: {},
          },
        },
      ];

      jest.spyOn(Eval, 'create').mockResolvedValue(evalRecord);

      await doEval(cmdObj, defaultConfig, 'test-config.yaml', {});

      expect(process.exitCode).toBe(100);
    });
  });

  describe('evalCommand', () => {
    it('should set up command with correct options', () => {
      const cmd = evalCommand(program, defaultConfig, 'test-config.yaml');

      expect(cmd.name()).toBe('eval');
      expect(cmd.description()).toBe('Evaluate prompts');
      expect(cmd.opts()).toEqual(
        expect.objectContaining({
          config: undefined,
          prompts: undefined,
          providers: undefined,
        }),
      );
    });

    it('should handle help option', async () => {
      const cmd = evalCommand(program, defaultConfig, 'test-config.yaml');
      const helpSpy = jest.spyOn(cmd, 'help').mockImplementation();

      await cmd.parseAsync(['node', 'test', '--help']);

      expect(helpSpy).toHaveBeenCalledWith();
    });

    it('should handle interactive providers option', async () => {
      const cmd = evalCommand(program, defaultConfig, 'test-config.yaml');

      await cmd.parseAsync(['node', 'test', '--interactive-providers']);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('The --interactive-providers option has been removed'),
      );
      expect(process.exitCode).toBe(2);
    });
  });
});
