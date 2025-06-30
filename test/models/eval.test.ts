import { getDb } from '../../src/database';
import { getUserEmail } from '../../src/globalConfig/accounts';
import { runDbMigrations } from '../../src/migrate';
import Eval, { getEvalSummaries } from '../../src/models/eval';
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
    // Clear all tables before each test
    const db = getDb();
    // Delete related tables first
    await db.run('DELETE FROM eval_results');
    await db.run('DELETE FROM evals_to_datasets');
    await db.run('DELETE FROM evals_to_prompts');
    await db.run('DELETE FROM evals_to_tags');
    // Then delete from main table
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

  describe('findById', () => {
    it('should handle empty vars array', async () => {
      const eval1 = await EvalFactory.create({ numResults: 0 });
      const persistedEval = await Eval.findById(eval1.id);
      expect(persistedEval?.vars).toEqual([]);
    });

    it('should backfill vars from eval results when vars array is empty', async () => {
      // This will create eval results with vars in test_case
      const eval1 = await EvalFactory.create({
        numResults: 2,
        // @ts-expect-error: injectVarsInResults is for test factory only
        injectVarsInResults: true,
      });

      // Remove vars from the evals table to trigger backfill
      const db = getDb();
      // Drizzle's .run() does not support ? params for this case, so interpolate directly
      await db.run(`UPDATE evals SET vars = json('[]') WHERE id = '${eval1.id}'`);

      const persistedEval = await Eval.findById(eval1.id);
      expect(persistedEval?.vars.length).toBeGreaterThan(0);
    });

    it('should store backfilled vars in database', async () => {
      const eval1 = await EvalFactory.create({
        numResults: 2,
        // @ts-expect-error: injectVarsInResults is for test factory only
        injectVarsInResults: true,
      });

      // Remove vars from the evals table to trigger backfill
      const db = getDb();
      await db.run(`UPDATE evals SET vars = json('[]') WHERE id = '${eval1.id}'`);

      const persistedEval1 = await Eval.findById(eval1.id);
      const vars = persistedEval1?.vars || [];
      expect(vars.length).toBeGreaterThan(0);

      // Now, after backfilling, the next load should get the same vars from db
      const persistedEval2 = await Eval.findById(eval1.id);
      expect(persistedEval2?.vars).toEqual(vars);
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

  describe('getTablePage', () => {
    let evalWithResults: Eval;

    beforeEach(async () => {
      // Create an evaluation with varied results for testing pagination and filtering
      evalWithResults = await EvalFactory.create({
        numResults: 20,
        resultTypes: ['success', 'error', 'failure'],
        withHighlights: true,
        withNamedScores: true,
        searchableContent: 'searchable_content',
      });
    });

    it('should return paginated results with default parameters', async () => {
      const result = await evalWithResults.getTablePage({});

      expect(result).toHaveProperty('head');
      expect(result).toHaveProperty('body');
      expect(result).toHaveProperty('totalCount');
      expect(result).toHaveProperty('filteredCount');
      expect(result).toHaveProperty('id', evalWithResults.id);

      // Default limit is 50
      expect(result.body.length).toBeLessThanOrEqual(50);
    });

    it('should respect offset and limit parameters', async () => {
      // Create an eval with enough results to ensure we have content for two pages
      const largeEval = await EvalFactory.create({
        numResults: 12,
        resultTypes: ['success', 'failure'],
      });

      const firstPage = await largeEval.getTablePage({ offset: 0, limit: 5 });
      const secondPage = await largeEval.getTablePage({ offset: 5, limit: 5 });

      expect(firstPage.body.length).toBeLessThanOrEqual(5);
      expect(secondPage.body.length).toBeLessThanOrEqual(5);

      // Ensure we have content in both pages for a valid test
      expect(firstPage.body.length).toBeGreaterThan(0);
      expect(secondPage.body.length).toBeGreaterThan(0);

      // Compare test indices between pages to ensure they're different
      const firstPageIndices = firstPage.body.map((row) => row.testIdx);
      const secondPageIndices = secondPage.body.map((row) => row.testIdx);

      // Verify no overlap between page indices
      const intersection = firstPageIndices.filter((idx) => secondPageIndices.includes(idx));
      expect(intersection).toHaveLength(0);
    });

    it('should filter by errors', async () => {
      const result = await evalWithResults.getTablePage({ filterMode: 'errors' });

      // Ensure there are results for the test to be meaningful
      const hasResults = result.body.length > 0;
      expect(hasResults).toBe(true);

      // Check all outputs for errors
      for (const row of result.body) {
        const hasError = row.outputs.some(
          (output) =>
            output.text.includes('error') || (output.gradingResult?.reason || '').includes('error'),
        );
        expect(hasError).toBe(true);
      }
    });

    it('should filter by failures', async () => {
      const result = await evalWithResults.getTablePage({ filterMode: 'failures' });

      // Ensure there are results for the test to be meaningful
      const hasResults = result.body.length > 0;
      expect(hasResults).toBe(true);

      // All results should contain at least one failed output that's not an error
      for (const row of result.body) {
        const hasFailure = row.outputs.some(
          (output) => !output.pass && !output.text.includes('error'),
        );
        expect(hasFailure).toBe(true);
      }
    });

    it('should filter by passes', async () => {
      const result = await evalWithResults.getTablePage({ filterMode: 'passes' });

      // Ensure there are results for the test to be meaningful
      const hasResults = result.body.length > 0;
      expect(hasResults).toBe(true);

      // All results should contain at least one successful output
      for (const row of result.body) {
        const hasSuccess = row.outputs.some((output) => output.pass === true);
        expect(hasSuccess).toBe(true);
      }
    });

    it('should filter by specific test indices', async () => {
      const testIndices = [1, 3, 5];
      const result = await evalWithResults.getTablePage({ testIndices });

      // Should only return results for the specified test indices
      const returnedIndices = result.body.map((row) => row.testIdx);
      for (const idx of returnedIndices) {
        expect(testIndices).toContain(idx);
      }

      // Should return at most the number of requested indices
      expect(result.body.length).toBeLessThanOrEqual(testIndices.length);
    });

    it('should handle search queries across fields', async () => {
      // This test requires setting up specific search terms in the eval factory
      const searchTerm = 'searchable_content';
      const result = await evalWithResults.getTablePage({ searchQuery: searchTerm });

      // Results should contain the search term in at least one field
      expect(result.body.length).toBeGreaterThan(0);
      expect(result.filteredCount).toBeLessThan(result.totalCount);
    });

    it('should filter by specific metrics', async () => {
      // This test requires setting up results with named scores in the eval factory
      const metricName = 'accuracy';
      const result = await evalWithResults.getTablePage({ metricFilter: metricName });

      // All results should have the specified metric
      for (const row of result.body) {
        const hasMetric = row.outputs.some(
          (output) => output.namedScores && output.namedScores[metricName] !== undefined,
        );
        expect(hasMetric).toBe(true);
      }
    });

    it('should combine multiple filter types', async () => {
      const result = await evalWithResults.getTablePage({
        filterMode: 'passes',
        searchQuery: 'searchable_content',
        metricFilter: 'relevance',
        limit: 10,
      });

      // Results should satisfy all conditions and respect limit
      expect(result.body.length).toBeLessThanOrEqual(10);
      expect(result.filteredCount).toBeLessThan(result.totalCount);
    });

    it('should return correct counts for filtered results', async () => {
      const allResults = await evalWithResults.getTablePage({});
      const filteredResults = await evalWithResults.getTablePage({ filterMode: 'passes' });

      // Total count should be the same for both queries
      expect(filteredResults.totalCount).toBe(allResults.totalCount);

      // Filtered count should be less than or equal to total count
      expect(filteredResults.filteredCount).toBeLessThanOrEqual(filteredResults.totalCount);
    });

    it('should sanitize SQL inputs properly', async () => {
      // Test with input containing SQL injection attempt
      const result = await evalWithResults.getTablePage({
        searchQuery: "'; DROP TABLE eval_results; --",
      });

      // Should still return results without error
      expect(result).toBeDefined();
      expect(result).toHaveProperty('body');
    });

    it('should handle empty result sets', async () => {
      // Create an eval with no results
      const emptyEval = await EvalFactory.create({ numResults: 0 });

      const result = await emptyEval.getTablePage({});

      expect(result.body).toEqual([]);
      expect(result.totalCount).toBe(0);
      expect(result.filteredCount).toBe(0);
    });
  });
});
