import confirm from '@inquirer/confirm';
import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteCommand, handleEvalDelete, handleEvalDeleteAll } from '../../src/commands/delete';
import logger from '../../src/logger';
import Eval from '../../src/models/eval';
import * as database from '../../src/util/database';

vi.mock('@inquirer/confirm');
vi.mock('../../src/util/database');
vi.mock('../../src/logger');
vi.mock('../../src/models/eval');

describe('delete command', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    vi.resetAllMocks();
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
      const error = new Error('Delete failed');
      vi.mocked(database.deleteEval).mockRejectedValueOnce(error);

      await handleEvalDelete('test-id');

      expect(logger.error).toHaveBeenCalledWith(
        'Could not delete evaluation with ID test-id:\nError: Delete failed',
      );
      expect(process.exitCode).toBe(1);
    });
  });

  describe('handleEvalDeleteAll', () => {
    it('should delete all evaluations when confirmed', async () => {
      vi.mocked(confirm).mockResolvedValueOnce(true);

      await handleEvalDeleteAll();

      expect(database.deleteAllEvals).toHaveBeenCalledWith();
      expect(logger.info).toHaveBeenCalledWith('All evaluations have been deleted.');
    });

    it('should not delete evaluations when not confirmed', async () => {
      vi.mocked(confirm).mockResolvedValueOnce(false);

      await handleEvalDeleteAll();

      expect(database.deleteAllEvals).not.toHaveBeenCalled();
    });
  });

  describe('delete command', () => {
    it('should handle eval deletion when resource exists', async () => {
      vi.mocked(database.hasRecentEvalWithIdPrefix).mockResolvedValueOnce(true);

      deleteCommand(program);
      await program.parseAsync(['node', 'test', 'delete', 'test-id']);

      expect(database.hasRecentEvalWithIdPrefix).toHaveBeenCalledWith('test-id');
      expect(database.deleteEval).toHaveBeenCalledWith('test-id');
    });

    it('should handle when resource does not exist', async () => {
      vi.mocked(database.hasRecentEvalWithIdPrefix).mockResolvedValueOnce(false);

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

        vi.mocked(Eval.latest).mockResolvedValueOnce(mockLatestEval);

        deleteCommand(program);
        await program.parseAsync(['node', 'test', 'delete', 'eval', 'latest']);

        expect(database.deleteEval).toHaveBeenCalledWith('latest-id');
      });

      it('should handle when no latest eval exists', async () => {
        vi.mocked(Eval.latest).mockResolvedValueOnce(undefined);

        deleteCommand(program);
        await program.parseAsync(['node', 'test', 'delete', 'eval', 'latest']);

        expect(logger.error).toHaveBeenCalledWith('No eval found.');
        expect(process.exitCode).toBe(1);
      });

      it('should handle all evals deletion', async () => {
        vi.mocked(confirm).mockResolvedValueOnce(true);

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
