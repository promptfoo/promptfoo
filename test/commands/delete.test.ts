import confirm from '@inquirer/confirm';
import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteCommand,
  handleEvalDelete,
  handleEvalDeleteAll,
  handleEvalResultDelete,
} from '../../src/commands/delete';
import logger from '../../src/logger';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import * as database from '../../src/util/database';

import type { EvalWithMetadata } from '../../src/types/index';

vi.mock('@inquirer/confirm');
// `EvalResultNotFoundError` is a runtime export from this module — keep the
// real class so `instanceof` checks in the SUT (handleEvalResultDelete) work
// against the same constructor identity the production code throws.
vi.mock('../../src/util/database', async () => {
  const actual =
    await vi.importActual<typeof import('../../src/util/database')>('../../src/util/database');
  return {
    ...actual,
    deleteEval: vi.fn(),
    deleteAllEvals: vi.fn(),
    deleteEvalResult: vi.fn(),
    getEvalIdForResult: vi.fn(),
    getEvalFromId: vi.fn(),
  };
});
vi.mock('../../src/logger');
vi.mock('../../src/models/eval');
vi.mock('../../src/models/evalResult');

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

      vi.mocked(database.getEvalFromId).mockResolvedValueOnce(mockEval);

      deleteCommand(program);
      await program.parseAsync(['node', 'test', 'delete', 'test-id']);

      expect(database.getEvalFromId).toHaveBeenCalledWith('test-id');
      expect(database.deleteEval).toHaveBeenCalledWith('test-id');
    });

    it('should handle when resource does not exist', async () => {
      vi.mocked(database.getEvalFromId).mockResolvedValueOnce(undefined);

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

    describe('eval-result subcommand', () => {
      it('looks up the parent evalId then deletes the result scoped to it', async () => {
        // The CLI takes only the resultId; it must resolve the parent evalId
        // itself so the storage delete is scoped to (evalId, resultId).
        vi.mocked(database.getEvalIdForResult).mockResolvedValueOnce('eval-42');

        deleteCommand(program);
        await program.parseAsync(['node', 'test', 'delete', 'eval-result', 'result-1']);

        expect(EvalResult.findById).not.toHaveBeenCalled();
        expect(database.getEvalIdForResult).toHaveBeenCalledWith('result-1');
        expect(database.deleteEvalResult).toHaveBeenCalledWith('eval-42', 'result-1');
        expect(logger.info).toHaveBeenCalledWith(
          'Eval result with ID result-1 has been successfully deleted.',
        );
      });

      it('exits 1 and skips the storage call when the resultId is unknown', async () => {
        vi.mocked(database.getEvalIdForResult).mockResolvedValueOnce(null);

        await handleEvalResultDelete('missing-id');

        expect(database.deleteEvalResult).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith('No eval result found with ID missing-id.');
        expect(process.exitCode).toBe(1);
      });

      it('exits 1 with the "not found" message when the row vanishes between lookup and delete', async () => {
        // Race window: the row passed the existence check, then a concurrent
        // delete removed it before our DELETE ran. Must surface as "not found"
        // rather than a generic 500-style error.
        vi.mocked(database.getEvalIdForResult).mockResolvedValueOnce('eval-42');
        vi.mocked(database.deleteEvalResult).mockRejectedValueOnce(
          new database.EvalResultNotFoundError('eval-42', 'result-1'),
        );

        await handleEvalResultDelete('result-1');

        expect(logger.error).toHaveBeenCalledWith('No eval result found with ID result-1.');
        expect(process.exitCode).toBe(1);
      });

      it('exits 1 with the underlying error message for unexpected storage failures', async () => {
        vi.mocked(database.getEvalIdForResult).mockResolvedValueOnce('eval-42');
        vi.mocked(database.deleteEvalResult).mockRejectedValueOnce(new Error('disk full'));

        await handleEvalResultDelete('result-1');

        expect(logger.error).toHaveBeenCalledWith(
          'Could not delete eval result with ID result-1:\ndisk full',
        );
        expect(process.exitCode).toBe(1);
      });
    });
  });
});
