import { getDb } from '../../src/database';
import { getUserEmail } from '../../src/globalConfig/accounts';
import { runDbMigrations } from '../../src/migrate';
import Eval, { EvalQueries, getEvalSummaries } from '../../src/models/eval';
import EvalFactory from '../factories/evalFactory';

import type { Prompt } from '../../src/types/index';

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

    it('should correctly deserialize all provider types', async () => {
      // Test different provider formats
      const testCases = [
        // String provider
        { providers: 'openai:gpt-4', expected: [{ id: 'openai:gpt-4', label: null }] },
        // Array with strings
        {
          providers: ['openai:gpt-4', 'anthropic:claude'],
          expected: [
            { id: 'openai:gpt-4', label: null },
            { id: 'anthropic:claude', label: null },
          ],
        },
        // Array with ProviderOptions (explicit id)
        {
          providers: [{ id: 'custom-provider', label: 'Custom Label' }],
          expected: [{ id: 'custom-provider', label: 'Custom Label' }],
        },
        // Array with declarative providers (record format)
        {
          providers: [
            { 'openai:gpt-4': { config: { temperature: 0.5 }, label: 'GPT-4' } },
            { 'anthropic:claude': { config: { maxTokens: 1000 } } },
          ],
          expected: [
            { id: 'openai:gpt-4', label: 'GPT-4' },
            { id: 'anthropic:claude', label: null },
          ],
        },
        // Mixed array
        {
          providers: [
            'openai:gpt-3.5',
            { id: 'custom', label: 'Custom' },
            { 'anthropic:claude': { label: 'Claude' } },
          ],
          expected: [
            { id: 'openai:gpt-3.5', label: null },
            { id: 'custom', label: 'Custom' },
            { id: 'anthropic:claude', label: 'Claude' },
          ],
        },
      ];

      for (const testCase of testCases) {
        const evaluation = await Eval.create(
          {
            providers: testCase.providers as any,
            prompts: ['Test prompt'],
            tests: [{ vars: { test: 'value' } }],
          },
          [{ raw: 'Test prompt', label: 'Test prompt' }],
        );

        const summaries = await getEvalSummaries(undefined, undefined, true);
        const summary = summaries.find((s) => s.evalId === evaluation.id);

        expect(summary).toBeDefined();
        expect(summary?.providers).toEqual(testCase.expected);

        // Clean up
        await evaluation.delete();
      }
    });

    // Note: Function providers cannot be serialized to the database,
    // so they won't appear in getEvalSummaries() results.
    // The deserialization logic handles them, but they're lost during storage.
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
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
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
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
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
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
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
      const result = await evalWithResults.getTablePage({ filters: [] });

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

      const firstPage = await largeEval.getTablePage({ offset: 0, limit: 5, filters: [] });
      const secondPage = await largeEval.getTablePage({ offset: 5, limit: 5, filters: [] });

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
      const result = await evalWithResults.getTablePage({ filterMode: 'errors', filters: [] });

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
      const result = await evalWithResults.getTablePage({ filterMode: 'failures', filters: [] });

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
      const result = await evalWithResults.getTablePage({ filterMode: 'passes', filters: [] });

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
      const result = await evalWithResults.getTablePage({ testIndices, filters: [] });

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
      const result = await evalWithResults.getTablePage({ searchQuery: searchTerm, filters: [] });

      // Results should contain the search term in at least one field
      expect(result.body.length).toBeGreaterThan(0);
      expect(result.filteredCount).toBeLessThan(result.totalCount);
    });

    it('should filter by specific metrics', async () => {
      // This test requires setting up results with named scores in the eval factory
      const result = await evalWithResults.getTablePage({
        filters: [
          JSON.stringify({
            logicOperator: 'and',
            type: 'metric',
            operator: 'equals',
            value: 'accuracy',
          }),
        ],
      });

      // All results should have the specified metric
      for (const row of result.body) {
        const hasMetric = row.outputs.some(
          (output) => output.namedScores && output.namedScores['accuracy'] !== undefined,
        );
        expect(hasMetric).toBe(true);
      }
    });

    it('should combine multiple filter types', async () => {
      const result = await evalWithResults.getTablePage({
        filterMode: 'passes',
        searchQuery: 'searchable_content',
        filters: [
          JSON.stringify({
            logicOperator: 'and',
            type: 'metric',
            operator: 'equals',
            value: 'relevance',
          }),
        ],
        limit: 10,
      });

      // Results should satisfy all conditions and respect limit
      expect(result.body.length).toBeLessThanOrEqual(10);
      expect(result.filteredCount).toBeLessThan(result.totalCount);
    });

    it('should be filterable by multiple metrics', async () => {
      const result = await evalWithResults.getTablePage({
        filters: [
          JSON.stringify({
            logicOperator: 'or',
            type: 'metric',
            operator: 'equals',
            value: 'accuracy',
          }),
          JSON.stringify({
            logicOperator: 'or',
            type: 'metric',
            operator: 'equals',
            value: 'relevance',
          }),
        ],
      });

      // Row should have at least one of the metrics
      for (const row of result.body) {
        const hasMetric1 = row.outputs.some(
          (output) => output.namedScores && output.namedScores['accuracy'] !== undefined,
        );
        const hasMetric2 = row.outputs.some(
          (output) => output.namedScores && output.namedScores['relevance'] !== undefined,
        );
        expect(hasMetric1 || hasMetric2).toBe(true);
      }
    });

    it('should return correct counts for filtered results', async () => {
      const allResults = await evalWithResults.getTablePage({ filters: [] });
      const filteredResults = await evalWithResults.getTablePage({
        filterMode: 'passes',
        filters: [],
      });

      // Total count should be the same for both queries
      expect(filteredResults.totalCount).toBe(allResults.totalCount);

      // Filtered count should be less than or equal to total count
      expect(filteredResults.filteredCount).toBeLessThanOrEqual(filteredResults.totalCount);
    });

    it('should sanitize SQL inputs properly', async () => {
      // Test with input containing SQL injection attempt
      const result = await evalWithResults.getTablePage({
        searchQuery: "'; DROP TABLE eval_results; --",
        filters: [],
      });

      // Should still return results without error
      expect(result).toBeDefined();
      expect(result).toHaveProperty('body');
    });

    it('should handle empty result sets', async () => {
      // Create an eval with no results
      const emptyEval = await EvalFactory.create({ numResults: 0 });

      const result = await emptyEval.getTablePage({ filters: [] });

      expect(result.body).toEqual([]);
      expect(result.totalCount).toBe(0);
      expect(result.filteredCount).toBe(0);
    });
  });

  describe('EvalQueries.getMetadataKeysFromEval', () => {
    it('should return unique metadata keys from all eval results', async () => {
      const eval_ = await EvalFactory.create();

      // Add eval results with different metadata
      const db = getDb();
      await db.run(
        `INSERT INTO eval_results (
          id, eval_id, prompt_idx, test_idx, test_case, prompt, provider,
          success, score, metadata
        ) VALUES
        ('result1', '${eval_.id}', 0, 0, '{}', '{}', '{}', 1, 1.0, '{"key1": "value1", "key2": "value2"}'),
        ('result2', '${eval_.id}', 0, 1, '{}', '{}', '{}', 1, 1.0, '{"key2": "value3", "key3": "value4"}'),
        ('result3', '${eval_.id}', 0, 2, '{}', '{}', '{}', 1, 1.0, '{"key1": "value5", "key4": "value6"}')`,
      );

      const keys = await EvalQueries.getMetadataKeysFromEval(eval_.id);

      expect(keys).toEqual(['key1', 'key2', 'key3', 'key4']);
    });

    it('should return empty array for eval with no metadata', async () => {
      const eval_ = await EvalFactory.create();

      const keys = await EvalQueries.getMetadataKeysFromEval(eval_.id);

      expect(keys).toEqual([]);
    });

    it('should handle empty metadata objects gracefully', async () => {
      const eval_ = await EvalFactory.create();

      // Add eval result with empty metadata
      const db = getDb();
      await db.run(
        `INSERT INTO eval_results (
          id, eval_id, prompt_idx, test_idx, test_case, prompt, provider,
          success, score, metadata
        ) VALUES
        ('result1', '${eval_.id}', 0, 0, '{}', '{}', '{}', 1, 1.0, '{}')`,
      );

      const keys = await EvalQueries.getMetadataKeysFromEval(eval_.id);

      expect(keys).toEqual([]);
    });
  });

  describe('queryTestIndices', () => {
    it('returns indices with default params and correct ordering', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success', 'error', 'failure'],
      });
      const { testIndices, filteredCount } = await (eval_ as any).queryTestIndices({});

      expect(filteredCount).toBe(10);
      expect(testIndices.length).toBeLessThanOrEqual(10);
      // Ensure ascending order
      const sorted = [...testIndices].sort((a, b) => a - b);
      expect(testIndices).toEqual(sorted);
    });

    it('respects offset and limit', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 12,
        resultTypes: ['success', 'failure', 'error'],
      });
      const page1 = await (eval_ as any).queryTestIndices({ offset: 0, limit: 5 });
      const page2 = await (eval_ as any).queryTestIndices({ offset: 5, limit: 5 });

      expect(page1.testIndices.length).toBeLessThanOrEqual(5);
      expect(page2.testIndices.length).toBeLessThanOrEqual(5);

      // Verify disjoint sets for the first 10 indices
      const overlap = page1.testIndices.filter((i: number) => page2.testIndices.includes(i));
      expect(overlap).toHaveLength(0);
    });

    it('Mode Filtering: filters by errors, failures, and passes', async () => {
      const numResults = 15;
      const eval_ = await EvalFactory.create({
        numResults,
        resultTypes: ['success', 'error', 'failure'],
      });

      const errors = await (eval_ as any).queryTestIndices({ filterMode: 'errors' });
      const failures = await (eval_ as any).queryTestIndices({ filterMode: 'failures' });
      const passes = await (eval_ as any).queryTestIndices({ filterMode: 'passes' });

      // With the cycling order, counts should roughly split by thirds
      expect(errors.filteredCount).toBeGreaterThan(0);
      expect(failures.filteredCount).toBeGreaterThan(0);
      expect(passes.filteredCount).toBeGreaterThan(0);

      // No index should appear in more than one mode simultaneously
      const sErrors = new Set(errors.testIndices);
      const sFailures = new Set(failures.testIndices);
      const sPasses = new Set(passes.testIndices);
      for (const idx of sErrors) {
        expect(sFailures.has(idx)).toBe(false);
        expect(sPasses.has(idx)).toBe(false);
      }
    });

    it('filters by metric equals', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 8,
        resultTypes: ['success', 'failure'],
        withNamedScores: true,
      });
      const { testIndices, filteredCount } = await (eval_ as any).queryTestIndices({
        filters: [
          JSON.stringify({
            logicOperator: 'and',
            type: 'metric',
            operator: 'equals',
            value: 'accuracy',
          }),
        ],
      });

      expect(testIndices.length).toBeGreaterThan(0);
      expect(filteredCount).toBeGreaterThan(0);
      // With named scores on every row, all indices should match
      expect(filteredCount).toBe(8);
    });

    it('filters by metadata equals and contains', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 6,
        resultTypes: ['success', 'failure'],
      });

      const db = getDb();
      await db.run(
        `UPDATE eval_results SET metadata = json('{"source":"unit","note":"hello world"}') WHERE eval_id = '${eval_.id}' AND test_idx = 1`,
      );
      await db.run(
        `UPDATE eval_results SET metadata = json('{"source":"integration"}') WHERE eval_id = '${eval_.id}' AND test_idx = 2`,
      );

      // equals on source=unit should return only test 1
      const eqRes = await (eval_ as any).queryTestIndices({
        filters: [
          JSON.stringify({
            logicOperator: 'and',
            type: 'metadata',
            operator: 'equals',
            field: 'source',
            value: 'unit',
          }),
        ],
      });
      expect(eqRes.filteredCount).toBe(1);
      expect(eqRes.testIndices).toEqual([1]);

      // contains on note
      const containsRes = await (eval_ as any).queryTestIndices({
        filters: [
          JSON.stringify({
            logicOperator: 'and',
            type: 'metadata',
            operator: 'contains',
            field: 'note',
            value: 'hello',
          }),
        ],
      });
      expect(containsRes.filteredCount).toBe(1);
      expect(containsRes.testIndices).toEqual([1]);
    });

    it('filters by plugin and strategy', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 6,
        resultTypes: ['success', 'failure'],
      });
      const db = getDb();
      // Set pluginId on one row and strategyId on another
      await db.run(
        `UPDATE eval_results SET metadata = json('{"pluginId":"harmful:harassment"}') WHERE eval_id = '${eval_.id}' AND test_idx = 3`,
      );
      await db.run(
        `UPDATE eval_results SET metadata = json('{"strategyId":"s1"}') WHERE eval_id = '${eval_.id}' AND test_idx = 5`,
      );

      // Category filter should match pluginId that starts with harmful:
      const pluginCategory = await (eval_ as any).queryTestIndices({
        filters: [
          JSON.stringify({
            logicOperator: 'and',
            type: 'plugin',
            operator: 'equals',
            value: 'harmful',
          }),
        ],
      });
      expect(pluginCategory.testIndices).toEqual([3]);

      // Strategy equals specific id
      const strategyEq = await (eval_ as any).queryTestIndices({
        filters: [
          JSON.stringify({
            logicOperator: 'and',
            type: 'strategy',
            operator: 'equals',
            value: 's1',
          }),
        ],
      });
      expect(strategyEq.testIndices).toEqual([5]);
    });

    it('filters by explicit severity override', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 4,
        resultTypes: ['success', 'failure'],
      });
      const db = getDb();
      await db.run(
        `UPDATE eval_results SET metadata = json('{"severity":"high"}') WHERE eval_id = '${eval_.id}' AND test_idx = 0`,
      );

      const { testIndices, filteredCount } = await (eval_ as any).queryTestIndices({
        filters: [
          JSON.stringify({
            logicOperator: 'and',
            type: 'severity',
            operator: 'equals',
            value: 'high',
          }),
        ],
      });
      expect(filteredCount).toBe(1);
      expect(testIndices).toEqual([0]);
    });

    it('searches across response, grading, named scores, metadata, and vars', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 9,
        resultTypes: ['success', 'failure', 'error'],
        withNamedScores: true,
        searchableContent: 'needle',
      });
      const { testIndices, filteredCount } = await (eval_ as any).queryTestIndices({
        searchQuery: 'needle',
      });

      expect(testIndices.length).toBeGreaterThan(0);
      expect(filteredCount).toBeGreaterThan(0);
      // Sanity: limit should still apply
      const limited = await (eval_ as any).queryTestIndices({ searchQuery: 'needle', limit: 2 });
      expect(limited.testIndices.length).toBeLessThanOrEqual(2);
      expect(limited.filteredCount).toBeGreaterThanOrEqual(limited.testIndices.length);
    });
  });
});
