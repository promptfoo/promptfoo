import { getDb } from '../../src/database';
import { getUserEmail } from '../../src/globalConfig/accounts';
import { runDbMigrations } from '../../src/migrate';
import Eval, { getEvalSummaries } from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import type { Prompt } from '../../src/types';
import EvalFactory from '../factories/evalFactory';

jest.mock('../../src/globalConfig/accounts', () => ({
  ...jest.requireActual('../../src/globalConfig/accounts'),
  getUserEmail: jest.fn(),
}));

describe('evaluator', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(async () => {
    const db = getDb();
    await db.run('DELETE FROM eval_results');
    await db.run('DELETE FROM evals_to_datasets');
    await db.run('DELETE FROM evals_to_prompts');
    await db.run('DELETE FROM evals_to_tags');
    await db.run('DELETE FROM evals');
  });

  describe('summaryResults', () => {
    it('should return all evaluations', async () => {
      const eval1 = await EvalFactory.create();
      const eval2 = await EvalFactory.create();
      const eval3 = await EvalFactory.createOldResult();

      const evaluations = await getEvalSummaries();

      expect(evaluations).toHaveLength(3);

      expect(evaluations).toContainEqual(
        expect.objectContaining({
          evalId: eval1.id,
          createdAt: eval1.createdAt,
          description: null,
          numTests: 2,
          isRedteam: 0,
          passRate: 50,
          label: eval1.id,
        }),
      );

      expect(evaluations).toContainEqual(
        expect.objectContaining({
          evalId: eval2.id,
          createdAt: eval2.createdAt,
          description: null,
          numTests: 2,
          isRedteam: 0,
          passRate: 50,
          label: eval2.id,
        }),
      );

      expect(evaluations).toContainEqual(expect.objectContaining({ evalId: eval3.id }));
    });

    it('should return evaluations in descending order by createdAt', async () => {
      const eval1 = await EvalFactory.create();
      const eval2 = await EvalFactory.create();
      const eval3 = await EvalFactory.create();

      const evaluations = await getEvalSummaries();

      expect(evaluations).toHaveLength(3);
      expect(evaluations[0].evalId).toBe(eval3.id);
      expect(evaluations[1].evalId).toBe(eval2.id);
      expect(evaluations[2].evalId).toBe(eval1.id);
    });
  });

  describe('delete', () => {
    it('should delete an evaluation', async () => {
      const eval1 = await EvalFactory.create();

      const eval_ = await Eval.findById(eval1.id);
      expect(eval_).toBeDefined();

      await eval1.delete();

      const eval_2 = await Eval.findById(eval1.id);
      expect(eval_2).toBeUndefined();
    });
  });

  describe('create', () => {
    it('should use provided author when available', async () => {
      const providedAuthor = 'provided@example.com';
      const config = { description: 'Test eval' };
      const renderedPrompts: Prompt[] = [
        { raw: 'Test prompt', display: 'Test prompt', label: 'Test label' } as Prompt,
      ];
      const evaluation = await Eval.create(config, renderedPrompts, { author: providedAuthor });
      expect(evaluation.author).toBe(providedAuthor);
      const persistedEval = await Eval.findById(evaluation.id);
      expect(persistedEval?.author).toBe(providedAuthor);
    });

    it('should use default author from getUserEmail when not provided', async () => {
      const mockEmail = 'default@example.com';
      jest.mocked(getUserEmail).mockReturnValue(mockEmail);
      const config = { description: 'Test eval' };
      const renderedPrompts: Prompt[] = [
        { raw: 'Test prompt', display: 'Test prompt', label: 'Test label' } as Prompt,
      ];
      const evaluation = await Eval.create(config, renderedPrompts);
      const persistedEval = await Eval.findById(evaluation.id);
      expect(persistedEval?.author).toBe(mockEmail);
    });
  });

  describe('getStats', () => {
    it('should accumulate assertion token usage correctly', () => {
      const eval1 = new Eval({});
      eval1.prompts = [
        {
          raw: 'test',
          metrics: {
            tokenUsage: {
              prompt: 10,
              completion: 20,
              cached: 5,
              total: 35,
              numRequests: 1,
              assertions: {
                total: 100,
                prompt: 40,
                completion: 50,
                cached: 10,
              },
            },
          },
        } as any,
        {
          raw: 'test2',
          metrics: {
            tokenUsage: {
              prompt: 15,
              completion: 25,
              cached: 10,
              total: 50,
              numRequests: 1,
              assertions: {
                total: 200,
                prompt: 80,
                completion: 100,
                cached: 20,
              },
            },
          },
        } as any,
      ];

      const stats = eval1.getStats();
      expect(stats.tokenUsage.assertions).toEqual({
        total: 300,
        prompt: 120,
        completion: 150,
        cached: 30,
      });
    });

    it('should handle missing assertion token usage', () => {
      const eval1 = new Eval({});
      eval1.prompts = [
        {
          raw: 'test',
          metrics: {
            tokenUsage: {
              prompt: 10,
              completion: 20,
              cached: 5,
              total: 35,
              numRequests: 1,
            },
          },
        } as any,
      ];

      const stats = eval1.getStats();
      expect(stats.tokenUsage.assertions).toEqual({
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
      });
    });

    it('should handle mix of prompts with and without assertion usage', () => {
      const eval1 = new Eval({});
      eval1.prompts = [
        {
          raw: 'test1',
          metrics: {
            tokenUsage: {
              prompt: 10,
              completion: 20,
              cached: 5,
              total: 35,
              numRequests: 1,
              assertions: {
                total: 100,
                prompt: 40,
                completion: 50,
                cached: 10,
              },
            },
          },
        } as any,
        {
          raw: 'test2',
          metrics: {
            tokenUsage: {
              prompt: 15,
              completion: 25,
              cached: 10,
              total: 50,
              numRequests: 1,
            },
          },
        } as any,
      ];

      const stats = eval1.getStats();
      expect(stats.tokenUsage.assertions).toEqual({
        total: 100,
        prompt: 40,
        completion: 50,
        cached: 10,
      });
    });
  });

  describe('toResultsFile', () => {
    it('should return results file with correct version', async () => {
      const eval1 = await EvalFactory.create();
      const results = await eval1.toResultsFile();
      expect(results.version).toBe(eval1.version());
    });

    it('should return results file with all required fields', async () => {
      const eval1 = await EvalFactory.create();
      const results = await eval1.toResultsFile();

      expect(results).toEqual({
        version: eval1.version(),
        createdAt: new Date(eval1.createdAt).toISOString(),
        config: eval1.config,
        author: null,
        prompts: eval1.getPrompts(),
        datasetId: null,
        results: await eval1.toEvaluateSummary(),
      });
    });

    it('should handle null author and datasetId', async () => {
      const eval1 = new Eval({});
      const results = await eval1.toResultsFile();

      expect(results.author).toBeNull();
      expect(results.datasetId).toBeNull();
    });

    it('should include correct results summary', async () => {
      const eval1 = await EvalFactory.create();
      const results = await eval1.toResultsFile();

      expect(results.results).toEqual(await eval1.toEvaluateSummary());
    });
  });

  describe('fetchSampleResults', () => {
    it('should return empty array when no results exist', async () => {
      const eval1 = new Eval({});
      const results = await eval1.fetchSampleResults(10);
      expect(results).toEqual([]);
    });

    it('should return all results when sample size is larger', async () => {
      const eval1 = await EvalFactory.create();
      // Insert 1 result for this eval
      const dbResults = await EvalResult.findManyByEvalId(eval1.id);
      eval1.resultsCount = dbResults.length;
      const results = await eval1.fetchSampleResults(5);
      expect(results).toHaveLength(dbResults.length);
      expect(results[0].evalId).toBe(eval1.id);
    });
  });

  describe('getResultsCount', () => {
    it('should return cached count when available', async () => {
      const eval1 = new Eval({});
      eval1.resultsCount = 5;
      const count = await eval1.getResultsCount();
      expect(count).toBe(5);
    });

    it('should handle empty results', async () => {
      const eval1 = new Eval({});
      eval1.resultsCount = 0;
      const count = await eval1.getResultsCount();
      expect(count).toBe(0);
    });

    it('should return 0 if there are no rows for evalId', async () => {
      const eval1 = new Eval({});
      eval1.resultsCount = 0;
      const count = await eval1.getResultsCount();
      expect(count).toBe(0);
    });
  });
});
