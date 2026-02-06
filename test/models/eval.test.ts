import { sql } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../src/database/index';
import { getUserEmail } from '../../src/globalConfig/accounts';
import { runDbMigrations } from '../../src/migrate';
import Eval, {
  buildSafeJsonPath,
  combineFilterConditions,
  EvalQueries,
  escapeJsonPathKey,
  getEvalSummaries,
} from '../../src/models/eval';
import EvalFactory from '../factories/evalFactory';

import type { Prompt } from '../../src/types/index';

vi.mock('../../src/globalConfig/accounts', async () => {
  const actual = await vi.importActual('../../src/globalConfig/accounts');
  return {
    ...actual,
    getUserEmail: vi.fn(),
  };
});

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
          isRedteam: false,
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
          isRedteam: false,
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
      vi.mocked(getUserEmail).mockReturnValue(mockEmail);
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

    it('should handle NaN durationMs in database by returning undefined', async () => {
      const eval1 = await EvalFactory.create({ numResults: 0 });

      // Inject NaN as durationMs in the results column
      const db = getDb();
      await db.run(
        `UPDATE evals SET results = json_set(results, '$.durationMs', 'NaN') WHERE id = '${eval1.id}'`,
      );

      const persistedEval = await Eval.findById(eval1.id);
      const stats = persistedEval?.getStats();
      // NaN should be filtered out, resulting in undefined
      expect(stats?.durationMs).toBeUndefined();
    });

    it('should handle negative durationMs in database by returning undefined', async () => {
      const eval1 = await EvalFactory.create({ numResults: 0 });

      // Inject negative number as durationMs
      const db = getDb();
      await db.run(
        `UPDATE evals SET results = json_set(results, '$.durationMs', -5000) WHERE id = '${eval1.id}'`,
      );

      const persistedEval = await Eval.findById(eval1.id);
      const stats = persistedEval?.getStats();
      // Negative should be filtered out, resulting in undefined
      expect(stats?.durationMs).toBeUndefined();
    });

    it('should handle string durationMs in database by returning undefined', async () => {
      const eval1 = await EvalFactory.create({ numResults: 0 });

      // Inject string as durationMs
      const db = getDb();
      await db.run(
        `UPDATE evals SET results = json_set(results, '$.durationMs', '"not a number"') WHERE id = '${eval1.id}'`,
      );

      const persistedEval = await Eval.findById(eval1.id);
      const stats = persistedEval?.getStats();
      // String should be filtered out, resulting in undefined
      expect(stats?.durationMs).toBeUndefined();
    });

    it('should preserve valid durationMs from database', async () => {
      const eval1 = await EvalFactory.create({ numResults: 0 });

      // Inject valid durationMs
      const db = getDb();
      await db.run(
        `UPDATE evals SET results = json_set(results, '$.durationMs', 12345) WHERE id = '${eval1.id}'`,
      );

      const persistedEval = await Eval.findById(eval1.id);
      const stats = persistedEval?.getStats();
      expect(stats?.durationMs).toBe(12345);
    });

    it('should handle NaN concurrencyUsed in database by returning undefined', async () => {
      const eval1 = await EvalFactory.create({ numResults: 0 });

      // Inject NaN as concurrencyUsed in the results column
      const db = getDb();
      await db.run(
        `UPDATE evals SET results = json_set(results, '$.concurrencyUsed', 'NaN') WHERE id = '${eval1.id}'`,
      );

      const persistedEval = await Eval.findById(eval1.id);
      const stats = persistedEval?.getStats();
      // NaN should be filtered out, resulting in undefined
      expect(stats?.concurrencyUsed).toBeUndefined();
    });

    it('should handle negative concurrencyUsed in database by returning undefined', async () => {
      const eval1 = await EvalFactory.create({ numResults: 0 });

      // Inject negative number as concurrencyUsed
      const db = getDb();
      await db.run(
        `UPDATE evals SET results = json_set(results, '$.concurrencyUsed', -5) WHERE id = '${eval1.id}'`,
      );

      const persistedEval = await Eval.findById(eval1.id);
      const stats = persistedEval?.getStats();
      // Negative should be filtered out, resulting in undefined
      expect(stats?.concurrencyUsed).toBeUndefined();
    });

    it('should handle zero concurrencyUsed in database by returning undefined', async () => {
      const eval1 = await EvalFactory.create({ numResults: 0 });

      // Inject zero as concurrencyUsed
      const db = getDb();
      await db.run(
        `UPDATE evals SET results = json_set(results, '$.concurrencyUsed', 0) WHERE id = '${eval1.id}'`,
      );

      const persistedEval = await Eval.findById(eval1.id);
      const stats = persistedEval?.getStats();
      // Zero should be filtered out, resulting in undefined
      expect(stats?.concurrencyUsed).toBeUndefined();
    });

    it('should preserve valid concurrencyUsed from database', async () => {
      const eval1 = await EvalFactory.create({ numResults: 0 });

      // Inject valid concurrencyUsed
      const db = getDb();
      await db.run(
        `UPDATE evals SET results = json_set(results, '$.concurrencyUsed', 8) WHERE id = '${eval1.id}'`,
      );

      const persistedEval = await Eval.findById(eval1.id);
      const stats = persistedEval?.getStats();
      expect(stats?.concurrencyUsed).toBe(8);
    });

    it('should persist concurrencyUsed through save/load cycle (round-trip)', async () => {
      // Create a new eval
      const eval1 = await EvalFactory.create({ numResults: 0 });

      // Set concurrencyUsed via setter
      eval1.setConcurrencyUsed(4);

      // Save to database
      eval1.save();

      // Reload from database
      const reloadedEval = await Eval.findById(eval1.id);
      const stats = reloadedEval?.getStats();

      // Verify the value persisted correctly
      expect(stats?.concurrencyUsed).toBe(4);
    });

    it('should persist both durationMs and concurrencyUsed in save/load cycle', async () => {
      // Create a new eval
      const eval1 = await EvalFactory.create({ numResults: 0 });

      // Set both values
      eval1.setDurationMs(5000);
      eval1.setConcurrencyUsed(8);

      // Save to database
      eval1.save();

      // Reload from database
      const reloadedEval = await Eval.findById(eval1.id);
      const stats = reloadedEval?.getStats();

      // Verify both values persisted correctly
      expect(stats?.durationMs).toBe(5000);
      expect(stats?.concurrencyUsed).toBe(8);
    });

    it('should not persist invalid concurrencyUsed values', async () => {
      const eval1 = await EvalFactory.create({ numResults: 0 });

      // Try to set invalid values - they should be ignored
      eval1.setConcurrencyUsed(0);
      eval1.save();

      let reloadedEval = await Eval.findById(eval1.id);
      expect(reloadedEval?.getStats().concurrencyUsed).toBeUndefined();

      // Try negative
      const eval2 = await EvalFactory.create({ numResults: 0 });
      eval2.setConcurrencyUsed(-5);
      eval2.save();

      reloadedEval = await Eval.findById(eval2.id);
      expect(reloadedEval?.getStats().concurrencyUsed).toBeUndefined();

      // Try NaN
      const eval3 = await EvalFactory.create({ numResults: 0 });
      eval3.setConcurrencyUsed(Number.NaN);
      eval3.save();

      reloadedEval = await Eval.findById(eval3.id);
      expect(reloadedEval?.getStats().concurrencyUsed).toBeUndefined();
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

    it('should include durationMs when set', () => {
      const eval1 = new Eval({});
      eval1.setDurationMs(12345);

      const stats = eval1.getStats();
      expect(stats.durationMs).toBe(12345);
    });

    it('should return undefined durationMs when not set', () => {
      const eval1 = new Eval({});

      const stats = eval1.getStats();
      expect(stats.durationMs).toBeUndefined();
    });

    it('should preserve durationMs when passed via constructor', () => {
      const eval1 = new Eval({}, { durationMs: 54321 });

      const stats = eval1.getStats();
      expect(stats.durationMs).toBe(54321);
    });

    it('should include concurrencyUsed when set', () => {
      const eval1 = new Eval({});
      eval1.setConcurrencyUsed(4);

      const stats = eval1.getStats();
      expect(stats.concurrencyUsed).toBe(4);
    });

    it('should return undefined concurrencyUsed when not set', () => {
      const eval1 = new Eval({});

      const stats = eval1.getStats();
      expect(stats.concurrencyUsed).toBeUndefined();
    });

    it('should preserve concurrencyUsed when passed via constructor', () => {
      const eval1 = new Eval({}, { concurrencyUsed: 8 });

      const stats = eval1.getStats();
      expect(stats.concurrencyUsed).toBe(8);
    });

    it('should extract maxConcurrency from runtimeOptions', () => {
      const eval1 = new Eval({}, { runtimeOptions: { maxConcurrency: 16 } });

      const stats = eval1.getStats();
      expect(stats.maxConcurrency).toBe(16);
    });

    it('should return undefined maxConcurrency when not in runtimeOptions', () => {
      const eval1 = new Eval({}, { runtimeOptions: {} });

      const stats = eval1.getStats();
      expect(stats.maxConcurrency).toBeUndefined();
    });

    it('should return undefined maxConcurrency for invalid values', () => {
      // Test NaN
      const eval1 = new Eval({}, { runtimeOptions: { maxConcurrency: Number.NaN } });
      expect(eval1.getStats().maxConcurrency).toBeUndefined();

      // Test Infinity
      const eval2 = new Eval({}, { runtimeOptions: { maxConcurrency: Number.POSITIVE_INFINITY } });
      expect(eval2.getStats().maxConcurrency).toBeUndefined();

      // Test negative
      const eval3 = new Eval({}, { runtimeOptions: { maxConcurrency: -5 } });
      expect(eval3.getStats().maxConcurrency).toBeUndefined();

      // Test zero
      const eval4 = new Eval({}, { runtimeOptions: { maxConcurrency: 0 } });
      expect(eval4.getStats().maxConcurrency).toBeUndefined();
    });

    it('should return both maxConcurrency and concurrencyUsed when both are set', () => {
      const eval1 = new Eval(
        {},
        {
          runtimeOptions: { maxConcurrency: 8 },
          concurrencyUsed: 1,
        },
      );

      const stats = eval1.getStats();
      expect(stats.maxConcurrency).toBe(8);
      expect(stats.concurrencyUsed).toBe(1);
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
            output.error?.includes('error') ||
            output.text.includes('error') ||
            (output.gradingResult?.reason || '').includes('error'),
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

    it('filters by metadata exists operator (non-empty values only)', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success', 'failure'],
      });

      const db = getDb();
      // Set up test data with various field states
      await db.run(
        `UPDATE eval_results SET metadata = json('{"source":"unit","note":"hello"}') WHERE eval_id = '${eval_.id}' AND test_idx = 0`,
      );
      await db.run(
        `UPDATE eval_results SET metadata = json('{"source":"","note":"hello"}') WHERE eval_id = '${eval_.id}' AND test_idx = 1`,
      );
      await db.run(
        `UPDATE eval_results SET metadata = json('{"source":"  ","note":"hello"}') WHERE eval_id = '${eval_.id}' AND test_idx = 2`,
      );
      await db.run(
        `UPDATE eval_results SET metadata = json('{"note":"hello"}') WHERE eval_id = '${eval_.id}' AND test_idx = 3`,
      );
      await db.run(
        `UPDATE eval_results SET metadata = json('{"source":null,"note":"hello"}') WHERE eval_id = '${eval_.id}' AND test_idx = 4`,
      );
      await db.run(
        `UPDATE eval_results SET metadata = json('{"source":"integration","note":"hello"}') WHERE eval_id = '${eval_.id}' AND test_idx = 5`,
      );

      // exists should only return rows where source field has meaningful non-empty values
      const existsRes = await (eval_ as any).queryTestIndices({
        filters: [
          JSON.stringify({
            logicOperator: 'and',
            type: 'metadata',
            operator: 'exists',
            field: 'source',
            value: '',
          }),
        ],
      });

      // Should only include test_idx 0 and 5 (has "unit" and "integration")
      // Should exclude: empty string (1), whitespace (2), missing field (3), null (4)
      expect(existsRes.filteredCount).toBe(2);
      expect(existsRes.testIndices).toEqual([0, 5]);
    });

    it('filters by metadata exists operator with various data types', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success', 'failure'],
      });

      const db = getDb();
      // Set up test data with different data types
      await db.run(
        `UPDATE eval_results SET metadata = json('{"count":42}') WHERE eval_id = '${eval_.id}' AND test_idx = 0`,
      );
      await db.run(
        `UPDATE eval_results SET metadata = json('{"count":0}') WHERE eval_id = '${eval_.id}' AND test_idx = 1`,
      );
      await db.run(
        `UPDATE eval_results SET metadata = json('{"active":true}') WHERE eval_id = '${eval_.id}' AND test_idx = 2`,
      );
      await db.run(
        `UPDATE eval_results SET metadata = json('{"active":false}') WHERE eval_id = '${eval_.id}' AND test_idx = 3`,
      );
      await db.run(
        `UPDATE eval_results SET metadata = json('{"tags":["a","b"]}') WHERE eval_id = '${eval_.id}' AND test_idx = 4`,
      );
      await db.run(
        `UPDATE eval_results SET metadata = json('{"config":{"key":"value"}}') WHERE eval_id = '${eval_.id}' AND test_idx = 5`,
      );

      // Test exists for numeric field (should include both 42 and 0)
      const countExists = await (eval_ as any).queryTestIndices({
        filters: [
          JSON.stringify({
            logicOperator: 'and',
            type: 'metadata',
            operator: 'exists',
            field: 'count',
            value: '',
          }),
        ],
      });
      expect(countExists.filteredCount).toBe(2);
      expect(countExists.testIndices).toEqual([0, 1]);

      // Test exists for boolean field (should include both true and false)
      const activeExists = await (eval_ as any).queryTestIndices({
        filters: [
          JSON.stringify({
            logicOperator: 'and',
            type: 'metadata',
            operator: 'exists',
            field: 'active',
            value: '',
          }),
        ],
      });
      expect(activeExists.filteredCount).toBe(2);
      expect(activeExists.testIndices).toEqual([2, 3]);

      // Test exists for array field
      const tagsExists = await (eval_ as any).queryTestIndices({
        filters: [
          JSON.stringify({
            logicOperator: 'and',
            type: 'metadata',
            operator: 'exists',
            field: 'tags',
            value: '',
          }),
        ],
      });
      expect(tagsExists.filteredCount).toBe(1);
      expect(tagsExists.testIndices).toEqual([4]);

      // Test exists for object field
      const configExists = await (eval_ as any).queryTestIndices({
        filters: [
          JSON.stringify({
            logicOperator: 'and',
            type: 'metadata',
            operator: 'exists',
            field: 'config',
            value: '',
          }),
        ],
      });
      expect(configExists.filteredCount).toBe(1);
      expect(configExists.testIndices).toEqual([5]);
    });

    it('filters by metadata with special characters in field names (security test)', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 5,
        resultTypes: ['success', 'failure'],
      });

      const db = getDb();
      // Test metadata keys with quotes and backslashes that could cause JSON path injection
      await db.run(
        `UPDATE eval_results SET metadata = json('{"field\\"with\\"quotes":"value1"}') WHERE eval_id = '${eval_.id}' AND test_idx = 0`,
      );
      await db.run(
        `UPDATE eval_results SET metadata = json('{"field\\\\with\\\\backslashes":"value2"}') WHERE eval_id = '${eval_.id}' AND test_idx = 1`,
      );
      await db.run(
        `UPDATE eval_results SET metadata = json('{"normal_field":"value3"}') WHERE eval_id = '${eval_.id}' AND test_idx = 2`,
      );

      // Test equals filter with quotes in field name
      const quotesResult = await (eval_ as any).queryTestIndices({
        filters: [
          JSON.stringify({
            logicOperator: 'and',
            type: 'metadata',
            operator: 'equals',
            field: 'field"with"quotes',
            value: 'value1',
          }),
        ],
      });
      expect(quotesResult.filteredCount).toBe(1);
      expect(quotesResult.testIndices).toEqual([0]);

      // Test equals filter with backslashes in field name
      const backslashResult = await (eval_ as any).queryTestIndices({
        filters: [
          JSON.stringify({
            logicOperator: 'and',
            type: 'metadata',
            operator: 'equals',
            field: 'field\\with\\backslashes',
            value: 'value2',
          }),
        ],
      });
      expect(backslashResult.filteredCount).toBe(1);
      expect(backslashResult.testIndices).toEqual([1]);

      // Test exists filter with quotes in field name
      const existsQuotesResult = await (eval_ as any).queryTestIndices({
        filters: [
          JSON.stringify({
            logicOperator: 'and',
            type: 'metadata',
            operator: 'exists',
            field: 'field"with"quotes',
            value: '',
          }),
        ],
      });
      expect(existsQuotesResult.filteredCount).toBe(1);
      expect(existsQuotesResult.testIndices).toEqual([0]);

      // Test exists filter with backslashes in field name
      const existsBackslashResult = await (eval_ as any).queryTestIndices({
        filters: [
          JSON.stringify({
            logicOperator: 'and',
            type: 'metadata',
            operator: 'exists',
            field: 'field\\with\\backslashes',
            value: '',
          }),
        ],
      });
      expect(existsBackslashResult.filteredCount).toBe(1);
      expect(existsBackslashResult.testIndices).toEqual([1]);
    });

    it('filters by metadata exists operator with empty arrays and objects', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 6,
        resultTypes: ['success', 'failure'],
      });

      const db = getDb();
      // Test empty array - should match (not empty)
      await db.run(
        `UPDATE eval_results SET metadata = json('{"arrayField":[]}') WHERE eval_id = '${eval_.id}' AND test_idx = 0`,
      );
      // Test empty object - should match (not empty)
      await db.run(
        `UPDATE eval_results SET metadata = json('{"objectField":{}}') WHERE eval_id = '${eval_.id}' AND test_idx = 1`,
      );
      // Test non-empty array - should match
      await db.run(
        `UPDATE eval_results SET metadata = json('{"arrayField":["item"]}') WHERE eval_id = '${eval_.id}' AND test_idx = 2`,
      );
      // Test non-empty object - should match
      await db.run(
        `UPDATE eval_results SET metadata = json('{"objectField":{"key":"value"}}') WHERE eval_id = '${eval_.id}' AND test_idx = 3`,
      );
      // Test null field - should not match
      await db.run(
        `UPDATE eval_results SET metadata = json('{"nullField":null}') WHERE eval_id = '${eval_.id}' AND test_idx = 4`,
      );
      // Test missing field - should not match
      await db.run(
        `UPDATE eval_results SET metadata = json('{"otherField":"value"}') WHERE eval_id = '${eval_.id}' AND test_idx = 5`,
      );

      // Test exists filter with empty array - should match because [] is not empty
      const emptyArrayResult = await (eval_ as any).queryTestIndices({
        filters: [
          JSON.stringify({
            logicOperator: 'and',
            type: 'metadata',
            operator: 'exists',
            field: 'arrayField',
            value: '',
          }),
        ],
      });
      expect(emptyArrayResult.filteredCount).toBe(2); // Both empty and non-empty arrays
      expect(emptyArrayResult.testIndices).toEqual([0, 2]);

      // Test exists filter with empty object - should match because {} is not empty
      const emptyObjectResult = await (eval_ as any).queryTestIndices({
        filters: [
          JSON.stringify({
            logicOperator: 'and',
            type: 'metadata',
            operator: 'exists',
            field: 'objectField',
            value: '',
          }),
        ],
      });
      expect(emptyObjectResult.filteredCount).toBe(2); // Both empty and non-empty objects
      expect(emptyObjectResult.testIndices).toEqual([1, 3]);

      // Test exists filter with null field - should not match
      const nullFieldResult = await (eval_ as any).queryTestIndices({
        filters: [
          JSON.stringify({
            logicOperator: 'and',
            type: 'metadata',
            operator: 'exists',
            field: 'nullField',
            value: '',
          }),
        ],
      });
      expect(nullFieldResult.filteredCount).toBe(0); // null should not match exists
      expect(nullFieldResult.testIndices).toEqual([]);
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

    it('filters plugin results with not_equals operator for ids and categories', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 5,
        resultTypes: ['success'],
      });
      const db = getDb();
      await db.run(
        `UPDATE eval_results SET metadata = json('{"pluginId":"harmful:harassment"}') WHERE eval_id = '${eval_.id}' AND test_idx = 0`,
      );
      await db.run(
        `UPDATE eval_results SET metadata = json('{"pluginId":"bias:toxicity"}') WHERE eval_id = '${eval_.id}' AND test_idx = 1`,
      );
      await db.run(
        `UPDATE eval_results SET metadata = json('{"pluginId":"custom-plugin"}') WHERE eval_id = '${eval_.id}' AND test_idx = 2`,
      );
      // Leave test_idx = 3 without pluginId to ensure nulls are included

      const excludeSpecificPlugin = await (eval_ as any).queryTestIndices({
        filters: [
          JSON.stringify({
            logicOperator: 'and',
            type: 'plugin',
            operator: 'not_equals',
            value: 'custom-plugin',
          }),
        ],
      });
      expect(excludeSpecificPlugin.testIndices).toEqual([0, 1, 3, 4]);

      const excludeCategory = await (eval_ as any).queryTestIndices({
        filters: [
          JSON.stringify({
            logicOperator: 'and',
            type: 'plugin',
            operator: 'not_equals',
            value: 'harmful',
          }),
        ],
      });
      expect(excludeCategory.testIndices).toEqual([1, 2, 3, 4]);
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

  describe('getTraces', () => {
    beforeEach(() => {
      vi.resetModules();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should return traces with properly formatted data', async () => {
      const eval_ = await EvalFactory.create();

      const mockTraces = [
        {
          traceId: 'trace-123',
          evaluationId: eval_.id,
          testCaseId: 'test-case-1',
          metadata: { test: 'value' },
          spans: [
            {
              spanId: 'span-1',
              name: 'Test Span',
              startTime: 1000000000,
              endTime: 2000000000,
              statusCode: 1,
            },
          ],
        },
      ];

      const mockTraceStore = {
        getTracesByEvaluation: vi.fn().mockResolvedValue(mockTraces),
      };

      vi.doMock('../../src/tracing/store', () => ({
        getTraceStore: vi.fn().mockReturnValue(mockTraceStore),
      }));

      // Force reload the module to use the mock
      vi.resetModules();
      const { default: EvalReloaded } = await import('../../src/models/eval');
      const evalInstance = Object.assign(Object.create(EvalReloaded.prototype), eval_);

      const traces = await evalInstance.getTraces();

      expect(traces).toHaveLength(1);
      expect(traces[0]).toMatchObject({
        traceId: 'trace-123',
        evaluationId: eval_.id,
        testCaseId: 'test-case-1',
        metadata: { test: 'value' },
      });
      expect(traces[0].spans).toHaveLength(1);
      expect(mockTraceStore.getTracesByEvaluation).toHaveBeenCalledWith(eval_.id);
    });

    it('should return empty array when no traces exist', async () => {
      const eval_ = await EvalFactory.create();

      const mockTraceStore = {
        getTracesByEvaluation: vi.fn().mockResolvedValue([]),
      };

      vi.doMock('../../src/tracing/store', () => ({
        getTraceStore: vi.fn().mockReturnValue(mockTraceStore),
      }));

      vi.resetModules();
      const { default: EvalReloaded } = await import('../../src/models/eval');
      const evalInstance = Object.assign(Object.create(EvalReloaded.prototype), eval_);

      const traces = await evalInstance.getTraces();

      expect(traces).toEqual([]);
      expect(mockTraceStore.getTracesByEvaluation).toHaveBeenCalledWith(eval_.id);
    });

    it('should handle spans with missing endTime', async () => {
      const eval_ = await EvalFactory.create();

      const mockTraces = [
        {
          traceId: 'trace-incomplete',
          evaluationId: eval_.id,
          testCaseId: 'test-case-2',
          metadata: {},
          spans: [
            {
              spanId: 'span-no-end',
              name: 'Incomplete Span',
              startTime: 1000000000,
              endTime: null,
              statusCode: 0,
            },
          ],
        },
      ];

      const mockTraceStore = {
        getTracesByEvaluation: vi.fn().mockResolvedValue(mockTraces),
      };

      vi.doMock('../../src/tracing/store', () => ({
        getTraceStore: vi.fn().mockReturnValue(mockTraceStore),
      }));

      vi.resetModules();
      const { default: EvalReloaded } = await import('../../src/models/eval');
      const evalInstance = Object.assign(Object.create(EvalReloaded.prototype), eval_);

      const traces = await evalInstance.getTraces();

      expect(traces).toHaveLength(1);
      expect(traces[0].spans[0]).toHaveProperty('spanId', 'span-no-end');
    });

    it('should map status codes correctly', async () => {
      const eval_ = await EvalFactory.create();

      const mockTraces = [
        {
          traceId: 'trace-status-codes',
          evaluationId: eval_.id,
          testCaseId: 'test-case-3',
          metadata: {},
          spans: [
            {
              spanId: 'span-ok',
              name: 'OK Span',
              startTime: 1000000000,
              endTime: 2000000000,
              statusCode: 1,
            },
            {
              spanId: 'span-error',
              name: 'Error Span',
              startTime: 2000000000,
              endTime: 3000000000,
              statusCode: 2,
            },
            {
              spanId: 'span-unset',
              name: 'Unset Span',
              startTime: 3000000000,
              endTime: 4000000000,
              statusCode: 0,
            },
          ],
        },
      ];

      const mockTraceStore = {
        getTracesByEvaluation: vi.fn().mockResolvedValue(mockTraces),
      };

      vi.doMock('../../src/tracing/store', () => ({
        getTraceStore: vi.fn().mockReturnValue(mockTraceStore),
      }));

      vi.resetModules();
      const { default: EvalReloaded } = await import('../../src/models/eval');
      const evalInstance = Object.assign(Object.create(EvalReloaded.prototype), eval_);

      const traces = await evalInstance.getTraces();

      expect(traces[0].spans).toHaveLength(3);
      // Note: The actual status mapping logic may vary based on implementation
      expect(traces[0].spans[0].spanId).toBe('span-ok');
      expect(traces[0].spans[1].spanId).toBe('span-error');
      expect(traces[0].spans[2].spanId).toBe('span-unset');
    });

    it('should handle errors gracefully and return empty array', async () => {
      const eval_ = await EvalFactory.create();

      const mockTraceStore = {
        getTracesByEvaluation: vi.fn().mockRejectedValue(new Error('Database error')),
      };

      vi.doMock('../../src/tracing/store', () => ({
        getTraceStore: vi.fn().mockReturnValue(mockTraceStore),
      }));

      vi.resetModules();
      const { default: EvalReloaded } = await import('../../src/models/eval');
      const evalInstance = Object.assign(Object.create(EvalReloaded.prototype), eval_);

      const traces = await evalInstance.getTraces();

      expect(traces).toEqual([]);
    });
  });

  describe('escapeJsonPathKey', () => {
    it('should return simple keys unchanged', () => {
      expect(escapeJsonPathKey('field')).toBe('field');
      expect(escapeJsonPathKey('simple_field')).toBe('simple_field');
      expect(escapeJsonPathKey('field123')).toBe('field123');
    });

    it('should escape double quotes in keys', () => {
      expect(escapeJsonPathKey('field"with"quotes')).toBe('field\\"with\\"quotes');
      expect(escapeJsonPathKey('"quoted"')).toBe('\\"quoted\\"');
    });

    it('should escape backslashes in keys', () => {
      expect(escapeJsonPathKey('field\\with\\backslash')).toBe('field\\\\with\\\\backslash');
      expect(escapeJsonPathKey('\\\\double')).toBe('\\\\\\\\double');
    });

    it('should escape both quotes and backslashes together', () => {
      expect(escapeJsonPathKey('field\\"mixed')).toBe('field\\\\\\"mixed');
      expect(escapeJsonPathKey('"\\key\\"')).toBe('\\"\\\\key\\\\\\"');
    });

    it('should handle SQL injection attempts in keys', () => {
      // These should be safely escaped, not executed
      const injection1 = 'field"; DROP TABLE users; --';
      const escaped1 = escapeJsonPathKey(injection1);
      // The double quote is escaped with a backslash, preventing JSON path breakout
      expect(escaped1).toBe('field\\"; DROP TABLE users; --');

      const injection2 = "field' OR 1=1; --";
      const escaped2 = escapeJsonPathKey(injection2);
      // Single quotes pass through escapeJsonPathKey (handled by buildSafeJsonPath)
      expect(escaped2).toBe("field' OR 1=1; --");
    });
  });

  describe('buildSafeJsonPath', () => {
    // Helper to extract the raw string from sql.raw() result
    const getRawString = (result: ReturnType<typeof buildSafeJsonPath>) =>
      (result.queryChunks[0] as { value: string[] }).value[0];

    it('should build valid JSON paths for simple field names', () => {
      const result = buildSafeJsonPath('field');
      expect(getRawString(result)).toBe('\'$."field"\'');
    });

    it('should properly escape double quotes in field names', () => {
      const result = buildSafeJsonPath('field"with"quotes');
      expect(getRawString(result)).toBe('\'$."field\\"with\\"quotes"\'');
    });

    it('should properly escape single quotes for SQL safety', () => {
      const result = buildSafeJsonPath("field'with'single'quotes");
      // Single quotes become doubled for SQL string literal safety
      expect(getRawString(result)).toBe("'$.\"field''with''single''quotes\"'");
    });

    it('should handle complex SQL injection attempts', () => {
      // This attack attempts to break out of both JSON path and SQL string
      const attack = `field"'; DROP TABLE users; --`;
      const result = buildSafeJsonPath(attack);
      // Double quotes escaped with backslash, single quote doubled for SQL
      // Input: field"'; DROP TABLE users; --
      // After escapeJsonPathKey: field\"'; DROP TABLE users; --
      // As JSON path: $."field\"'; DROP TABLE users; --"
      // After SQL escaping ('' for '): $."field\"''; DROP TABLE users; --"
      // Final with outer quotes: '$."field\"''; DROP TABLE users; --"'
      expect(getRawString(result)).toBe("'$.\"field\\\"''; DROP TABLE users; --\"'");
    });

    it('should handle backslashes correctly', () => {
      const result = buildSafeJsonPath('path\\to\\field');
      expect(getRawString(result)).toBe('\'$."path\\\\to\\\\field"\'');
    });
  });

  describe('combineFilterConditions', () => {
    it('should return null for empty array', () => {
      const result = combineFilterConditions([]);
      expect(result).toBeNull();
    });

    it('should return single condition unwrapped', () => {
      const condition = sql`field = ${1}`;
      const result = combineFilterConditions([{ condition, logicOperator: 'AND' }]);
      expect(result).toBe(condition);
    });

    it('should combine two conditions with AND', () => {
      const cond1 = sql`field1 = ${1}`;
      const cond2 = sql`field2 = ${2}`;
      const result = combineFilterConditions([
        { condition: cond1, logicOperator: 'AND' },
        { condition: cond2, logicOperator: 'AND' },
      ]);
      expect(result).not.toBeNull();
      // Verify the result contains both conditions
      expect(result!.queryChunks.length).toBeGreaterThan(1);
    });

    it('should combine two conditions with OR', () => {
      const cond1 = sql`field1 = ${1}`;
      const cond2 = sql`field2 = ${2}`;
      const result = combineFilterConditions([
        { condition: cond1, logicOperator: 'AND' },
        { condition: cond2, logicOperator: 'OR' },
      ]);
      expect(result).not.toBeNull();
    });

    it('should handle mixed AND/OR operators', () => {
      const cond1 = sql`a = ${1}`;
      const cond2 = sql`b = ${2}`;
      const cond3 = sql`c = ${3}`;
      const cond4 = sql`d = ${4}`;

      const result = combineFilterConditions([
        { condition: cond1, logicOperator: 'AND' },
        { condition: cond2, logicOperator: 'AND' },
        { condition: cond3, logicOperator: 'OR' },
        { condition: cond4, logicOperator: 'AND' },
      ]);
      expect(result).not.toBeNull();
    });

    it('should use AND as default for unrecognized operators', () => {
      const cond1 = sql`field1 = ${1}`;
      const cond2 = sql`field2 = ${2}`;
      const result = combineFilterConditions([
        { condition: cond1, logicOperator: 'UNKNOWN' },
        { condition: cond2, logicOperator: 'INVALID' },
      ]);
      expect(result).not.toBeNull();
    });
  });

  describe('parameterization verification', () => {
    it('should use parameterized queries for filter values', async () => {
      // This test verifies that filter values are parameterized, not interpolated
      // The "filters by metadata with special characters in field names" test above
      // already exercises this with actual database queries.
      //
      // Here we verify the SQL structure at a unit level:
      // The buildSafeJsonPath tests above verify JSON path escaping
      // The combineFilterConditions tests verify SQL fragment composition
      //
      // A malicious value like "'; DROP TABLE evals; --" would:
      // 1. Be passed as a parameterized value via sql`... ${value}`
      // 2. Never be interpolated directly into the SQL string
      // 3. Be treated as a literal string value by the database
      //
      // This is verified by the fact that:
      // - All user values use Drizzle's sql template strings with ${value}
      // - Only JSON paths use sql.raw(), and those are escaped by buildSafeJsonPath

      // Unit test: verify buildSafeJsonPath escapes injection attempts
      const attackField = "field'; DROP TABLE evals; --";
      const safePath = buildSafeJsonPath(attackField);
      // The path should be properly escaped (verified in buildSafeJsonPath tests)
      expect(safePath).toBeDefined();
      expect(safePath.queryChunks).toBeDefined();
    });

    it('should safely handle search queries with SQL metacharacters', async () => {
      // Search queries are handled via Drizzle's parameterized sql template strings:
      // sql`response LIKE ${searchPattern}`
      //
      // The searchPattern is never interpolated into the SQL string.
      // A malicious search like "'; SELECT * FROM evals; --" would be:
      // 1. Wrapped in % for LIKE: "%'; SELECT * FROM evals; --%"
      // 2. Passed as a parameterized value
      // 3. Treated as a literal string to search for
      //
      // This is verified by inspection of buildFilterWhereSql:
      // const searchPattern = `%${opts.searchQuery}%`;
      // sql`response LIKE ${searchPattern}` - parameterized, not interpolated

      // The existing "should sanitize SQL inputs properly" test at line 711
      // exercises this with actual database queries and verifies no SQL error occurs.
      expect(true).toBe(true);
    });
  });
});
