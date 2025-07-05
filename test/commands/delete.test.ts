import confirm from '@inquirer/confirm';
import { Command } from 'commander';
import { deleteCommand, handleEvalDelete, handleEvalDeleteAll } from '../../src/commands/delete';
import logger from '../../src/logger';
import Eval from '../../src/models/eval';
import type { EvalWithMetadata } from '../../src/types';
import * as database from '../../src/util/database';

jest.mock('@inquirer/confirm');
jest.mock('../../src/util/database');
jest.mock('../../src/logger');
jest.mock('../../src/models/eval');

describe('delete command', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    jest.resetAllMocks();
    process.exitCode = undefined;
  });

  describe('handleEvalDelete', () => {
    it('should successfully delete evaluation', async () => {
      await handleEvalDelete('test-id');

      expect(database.deleteEval).toHaveBeenCalledWith('test-id');
      expect(logger.info).toHaveBeenCalledWith(
        'Evaluation with ID test-id has been successfully deleted.',
      );
    });

    it('should handle error when deleting evaluation', async () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const error = new Error('Delete failed');
      jest.mocked(database.deleteEval).mockRejectedValueOnce(error);

      await handleEvalDelete('test-id');

      expect(logger.error).toHaveBeenCalledWith(
        'Could not delete evaluation with ID test-id:\nError: Delete failed',
      );
      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockRestore();
    });
  });

  describe('handleEvalDeleteAll', () => {
    it('should delete all evaluations when confirmed', async () => {
      jest.mocked(confirm).mockResolvedValueOnce(true);

      await handleEvalDeleteAll();

      expect(database.deleteAllEvals).toHaveBeenCalledWith();
      expect(logger.info).toHaveBeenCalledWith('All evaluations have been deleted.');
    });

    it('should not delete evaluations when not confirmed', async () => {
      jest.mocked(confirm).mockResolvedValueOnce(false);

      await handleEvalDeleteAll();

      expect(database.deleteAllEvals).not.toHaveBeenCalled();
    });
  });

  describe('delete command', () => {
    it('should handle eval deletion when resource exists', async () => {
      const mockEval = {
        id: 'test-id',
        date: new Date(),
        config: {},
        version: 3,
        timestamp: new Date().toISOString(),
        results: {
          version: 3,
          timestamp: new Date().toISOString(),
          results: [],
          prompts: [],
          stats: {
            successes: 0,
            failures: 0,
            errors: 0,
            duration: 0,
            tokenUsage: {
              total: 0,
              prompt: 0,
              completion: 0,
              cached: 0,
              numRequests: 0,
              completionDetails: {
                reasoning: 0,
                acceptedPrediction: 0,
                rejectedPrediction: 0,
              },
              assertions: {} as any,
            },
          },
        },
        prompts: [],
        stats: {
          successes: 0,
          failures: 0,
          errors: 0,
          duration: 0,
          tokenUsage: {
            total: 0,
            prompt: 0,
            completion: 0,
            cached: 0,
            numRequests: 0,
            completionDetails: {
              reasoning: 0,
              acceptedPrediction: 0,
              rejectedPrediction: 0,
            },
            assertions: {} as any,
          },
        },
      } as EvalWithMetadata;

      jest.mocked(database.getEvalFromId).mockResolvedValueOnce(mockEval);

      deleteCommand(program);
      await program.parseAsync(['node', 'test', 'delete', 'test-id']);

      expect(database.getEvalFromId).toHaveBeenCalledWith('test-id');
      expect(database.deleteEval).toHaveBeenCalledWith('test-id');
    });

    it('should handle when resource does not exist', async () => {
      jest.mocked(database.getEvalFromId).mockResolvedValueOnce(undefined);

      deleteCommand(program);
      await program.parseAsync(['node', 'test', 'delete', 'test-id']);

      expect(logger.error).toHaveBeenCalledWith('No resource found with ID test-id');
      expect(process.exitCode).toBe(1);
    });

    describe('eval subcommand', () => {
      it('should handle latest eval deletion', async () => {
        const mockLatestEval = {
          createdAt: new Date(),
          config: {},
          results: [],
          prompts: [],
          assertions: [],
          vars: {},
          providers: [],
          tests: [],
          outputs: [],
          sharing: false,
          description: '',
          nunjucksTemplates: {},
          version: 3,
          grading: {},
          metrics: {},
          stats: {
            successes: 0,
            failures: 0,
            errors: 0,
            duration: 0,
            tokenUsage: {
              total: 0,
              prompt: 0,
              completion: 0,
              cached: 0,
              numRequests: 0,
              completionDetails: {
                reasoning: 0,
                acceptedPrediction: 0,
                rejectedPrediction: 0,
              },
              assertions: {} as any,
            },
          },
          duration: 0,
          summary: '',
          status: 'completed',
          error: null,
          testSuites: [],
          maxConcurrency: 1,
          repeat: 1,
          table: [],
          views: [],
          isUnfinished: false,
          isShared: false,
          latestGrade: null,
          latestScore: null,
          id: 'latest-id',
        } as any;

        jest.mocked(Eval.latest).mockResolvedValueOnce(mockLatestEval);

        deleteCommand(program);
        await program.parseAsync(['node', 'test', 'delete', 'eval', 'latest']);

        expect(database.deleteEval).toHaveBeenCalledWith('latest-id');
      });

      it('should handle when no latest eval exists', async () => {
        jest.mocked(Eval.latest).mockResolvedValueOnce(undefined);

        deleteCommand(program);
        await program.parseAsync(['node', 'test', 'delete', 'eval', 'latest']);

        expect(logger.error).toHaveBeenCalledWith('No eval found.');
        expect(process.exitCode).toBe(1);
      });

      it('should handle all evals deletion', async () => {
        jest.mocked(confirm).mockResolvedValueOnce(true);

        deleteCommand(program);
        await program.parseAsync(['node', 'test', 'delete', 'eval', 'all']);

        expect(database.deleteAllEvals).toHaveBeenCalledWith();
      });

      it('should handle specific eval deletion', async () => {
        deleteCommand(program);
        await program.parseAsync(['node', 'test', 'delete', 'eval', 'specific-id']);

        expect(database.deleteEval).toHaveBeenCalledWith('specific-id');
      });
    });
  });
});
