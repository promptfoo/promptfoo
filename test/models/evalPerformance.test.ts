import { spawnSync } from 'node:child_process';

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../src/database/index';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import {
  clearCountCache,
  getCachedResultsCount,
  getCachedResultsSummary,
  getTotalResultRowCount,
} from '../../src/models/evalPerformance';
import EvalResult from '../../src/models/evalResult';
import { ResultFailureReason } from '../../src/types/index';
import { createEvaluateResult } from '../factories/eval';
import type { Client } from '@libsql/client/node';

describe('evalPerformance', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(async () => {
    const db = await getDb();
    await db.run('DELETE FROM eval_results');
    await db.run('DELETE FROM evals_to_datasets');
    await db.run('DELETE FROM evals_to_prompts');
    await db.run('DELETE FROM evals_to_tags');
    await db.run('DELETE FROM evals');
    clearCountCache();
  });

  /**
   * Helper to create an eval and add results for provider x test combinations.
   * Returns the eval and the expected counts.
   */
  async function createEvalWithResults(numProviders: number, numTests: number) {
    const providers = Array.from({ length: numProviders }, (_, i) => ({ id: `provider-${i + 1}` }));
    const tests = Array.from({ length: numTests }, (_, i) => ({ vars: { input: `test${i + 1}` } }));

    const eval_ = await Eval.create(
      {
        providers,
        prompts: ['Test prompt'],
        tests,
      },
      [{ raw: 'Test prompt', label: 'Test prompt' }],
    );

    // Add results for each provider × test combination
    for (let providerIdx = 0; providerIdx < numProviders; providerIdx++) {
      for (let testIdx = 0; testIdx < numTests; testIdx++) {
        await eval_.addResult({
          description: `test-${providerIdx}-${testIdx}`,
          promptIdx: 0,
          testIdx,
          testCase: { vars: { input: `test${testIdx + 1}` } },
          promptId: 'test-prompt',
          provider: { id: `provider-${providerIdx + 1}`, label: `Provider ${providerIdx + 1}` },
          prompt: { raw: 'Test prompt', label: 'Test prompt' },
          vars: { input: `test${testIdx + 1}` },
          response: {
            output: `response-${providerIdx}-${testIdx}`,
            tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
          },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'Pass',
            namedScores: {},
            tokensUsed: { total: 10, prompt: 5, completion: 5, cached: 0 },
            componentResults: [],
          },
          namedScores: {},
          cost: 0.001,
          metadata: {},
        });
      }
    }

    return {
      eval_,
      expectedDistinctCount: numTests,
      expectedTotalRowCount: numProviders * numTests,
    };
  }

  describe('getCachedResultsCount', () => {
    it('should count distinct test indices (unique test cases)', async () => {
      // Create an eval with 2 providers and 3 test cases
      // This should produce 6 total results (2 providers × 3 tests)
      // But only 3 distinct test indices
      const { eval_, expectedDistinctCount } = await createEvalWithResults(2, 3);

      // Should return 3 (distinct test indices), not 6 (total rows)
      const count = await getCachedResultsCount(eval_.id);
      expect(count).toBe(expectedDistinctCount);
    });

    it('should return 0 for an eval with no results', async () => {
      const eval_ = await Eval.create(
        {
          providers: [{ id: 'provider-1' }],
          prompts: ['Test prompt'],
          tests: [{ vars: { input: 'test1' } }],
        },
        [{ raw: 'Test prompt', label: 'Test prompt' }],
      );

      const count = await getCachedResultsCount(eval_.id);
      expect(count).toBe(0);
    });

    it('should cache the count result', async () => {
      const { eval_ } = await createEvalWithResults(1, 1);

      // First call should hit the database
      const count1 = await getCachedResultsCount(eval_.id);
      expect(count1).toBe(1);

      // Second call should return cached result
      const count2 = await getCachedResultsCount(eval_.id);
      expect(count2).toBe(1);

      // Clear cache and verify we can get fresh count
      clearCountCache(eval_.id);
      const count3 = await getCachedResultsCount(eval_.id);
      expect(count3).toBe(1);
    });
  });

  describe('getTotalResultRowCount', () => {
    it('should count all result rows (including multiple per test)', async () => {
      // Create an eval with 2 providers and 3 test cases
      // This should produce 6 total result rows (2 providers × 3 tests)
      const { eval_, expectedTotalRowCount } = await createEvalWithResults(2, 3);

      // Should return 6 (total rows), not 3 (distinct test indices)
      const count = await getTotalResultRowCount(eval_.id);
      expect(count).toBe(expectedTotalRowCount);
    });

    it('should return 0 for an eval with no results', async () => {
      const eval_ = await Eval.create(
        {
          providers: [{ id: 'provider-1' }],
          prompts: ['Test prompt'],
          tests: [{ vars: { input: 'test1' } }],
        },
        [{ raw: 'Test prompt', label: 'Test prompt' }],
      );

      const count = await getTotalResultRowCount(eval_.id);
      expect(count).toBe(0);
    });

    it('should cache the count result', async () => {
      const { eval_ } = await createEvalWithResults(1, 1);

      // First call should hit the database
      const count1 = await getTotalResultRowCount(eval_.id);
      expect(count1).toBe(1);

      // Second call should return cached result
      const count2 = await getTotalResultRowCount(eval_.id);
      expect(count2).toBe(1);

      // Clear cache and verify we can get fresh count
      clearCountCache(eval_.id);
      const count3 = await getTotalResultRowCount(eval_.id);
      expect(count3).toBe(1);
    });
  });

  describe('full-eval recorded import provenance', () => {
    it('uses index-only counts and a partial-index lookup without parsing metadata on reads', async () => {
      const { eval_ } = await createEvalWithResults(1, 1);
      await eval_.addResult(
        createEvaluateResult({
          testIdx: 1,
          metadata: { history: 'ordinary history '.repeat(4096) },
        }),
      );
      const db = await getDb();
      const client = (db as typeof db & { $client: Client }).$client;
      const execute = vi.spyOn(client, 'execute');
      let statements: Array<{ sql: string; args?: Parameters<Client['execute']>[1] }>;
      try {
        await getCachedResultsCount(eval_.id);
        expect(execute).toHaveBeenCalledTimes(1);
        await getCachedResultsSummary(eval_.id);
        expect(execute).toHaveBeenCalledTimes(2);
        statements = execute.mock.calls.map(([statement, args]) =>
          typeof statement === 'string' ? { sql: statement, args } : statement,
        );
      } finally {
        execute.mockRestore();
      }

      // Run EXPLAIN in a subprocess: libSQL retains some prepared inspection statements
      // past close(), which would otherwise lock the shared test schema during teardown.
      const schema = await client.execute(
        "SELECT sql FROM sqlite_master WHERE tbl_name = 'eval_results' AND sql IS NOT NULL ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END",
      );
      const probe = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `
        import { readFileSync } from 'node:fs';
        import { createClient } from '@libsql/client/node';
        const { schema, statements } = JSON.parse(readFileSync(0, 'utf8'));
        const db = createClient({ url: 'file::memory:?cache=shared' });
        try {
          for (const sql of schema) await db.execute(sql);
          const plans = [];
          for (const statement of statements) {
            plans.push({
              plan: (await db.execute({ ...statement, sql: 'EXPLAIN QUERY PLAN ' + statement.sql })).rows,
              instructions: (await db.execute({ ...statement, sql: 'EXPLAIN ' + statement.sql })).rows,
            });
          }
          const table = await db.execute("SELECT rootpage FROM sqlite_master WHERE type = 'table' AND name = 'eval_results'");
          console.log(JSON.stringify({ plans, tableRootPage: table.rows[0].rootpage }));
        } finally { db.close(); }
      `,
        ],
        {
          input: JSON.stringify({ schema: schema.rows.map((row) => row.sql), statements }),
          encoding: 'utf8',
          timeout: 10_000,
        },
      );
      expect(probe.status, probe.stderr).toBe(0);
      const { plans, tableRootPage } = JSON.parse(probe.stdout) as {
        plans: Array<{
          plan: Array<{ detail: string }>;
          instructions: Array<{ opcode: string; p1: number; p2: number }>;
        }>;
        tableRootPage: number;
      };
      expect(statements[0].sql).not.toContain('metadata');
      expect(
        plans[0].plan.some((row) => row.detail.includes('COVERING INDEX eval_result_eval_test')),
      ).toBe(true);
      expect(plans[1].plan.some((row) => row.detail.includes('eval_result_saved_report_idx'))).toBe(
        true,
      );
      const instructions = plans[1].instructions;
      expect(instructions.some((row) => /Function|PureFunc/.test(row.opcode))).toBe(false);
      const tableCursors = instructions
        .filter((row) => row.opcode === 'OpenRead' && row.p2 === tableRootPage)
        .map((row) => row.p1);
      expect(
        instructions.some((row) => row.opcode === 'Column' && tableCursors.includes(row.p1)),
      ).toBe(false);
    });

    it('shares the count cache and refreshes provenance after inserts and result updates', async () => {
      const { eval_ } = await createEvalWithResults(1, 1);
      const db = await getDb();
      const select = vi.spyOn(db, 'select');
      const selectDistinct = vi.spyOn(db, 'selectDistinct');
      try {
        expect(await getCachedResultsCount(eval_.id)).toBe(1);
        expect(selectDistinct).not.toHaveBeenCalled();
        expect(await getCachedResultsSummary(eval_.id)).toEqual({
          count: 1,
          savedReportPromptIndices: [],
        });
        expect(select).toHaveBeenCalledTimes(1);
        expect(selectDistinct).toHaveBeenCalledTimes(1);
        await getCachedResultsSummary(eval_.id);
        expect(selectDistinct).toHaveBeenCalledTimes(1);

        const result = await EvalResult.createFromEvaluateResult(
          eval_.id,
          createEvaluateResult({
            testIdx: 1,
            promptIdx: 1,
            metadata: { codexSecurity: { version: 1, source: { kind: 'saved-report' } } },
          }),
        );
        expect(await getCachedResultsSummary(eval_.id)).toEqual({
          count: 2,
          savedReportPromptIndices: [1],
        });
        expect(select).toHaveBeenCalledTimes(2);
        expect(selectDistinct).toHaveBeenCalledTimes(2);

        result.metadata = { codexSecurity: { version: 1, source: { kind: 'sdk' } } };
        await result.save();
        expect(await getCachedResultsSummary(eval_.id)).toEqual({
          count: 2,
          savedReportPromptIndices: [],
        });
        expect(select).toHaveBeenCalledTimes(3);
        expect(selectDistinct).toHaveBeenCalledTimes(3);
      } finally {
        select.mockRestore();
        selectDistinct.mockRestore();
      }
    });

    it('ignores unknown and malformed provenance without changing result counts', async () => {
      const { eval_ } = await createEvalWithResults(1, 1);
      for (const [index, metadata] of [
        { codexSecurity: { version: 2, source: { kind: 'saved-report' } } },
        { codexSecurity: { version: '1', source: { kind: 'saved-report' } } },
        { codexSecurity: { version: true, source: { kind: 'saved-report' } } },
        { codexSecurity: { version: 1, source: { kind: 'sdk' } } },
        { codexSecurity: null },
        { codexSecurity: 'not an object' },
      ].entries()) {
        await eval_.addResult(createEvaluateResult({ testIdx: index + 1, metadata }));
      }
      expect(await getCachedResultsSummary(eval_.id)).toEqual({
        count: 7,
        savedReportPromptIndices: [],
      });
    });

    it('indexes bulk-imported provenance by eval and deduplicates prompt columns', async () => {
      const { eval_ } = await createEvalWithResults(1, 1);
      const { eval_: other } = await createEvalWithResults(1, 1);
      const metadata = { codexSecurity: { version: 1, source: { kind: 'saved-report' } } };
      await EvalResult.createManyFromEvaluateResult(
        [
          createEvaluateResult({ testIdx: 1, promptIdx: 3, metadata }),
          createEvaluateResult({ testIdx: 2, promptIdx: 3, metadata }),
        ],
        eval_.id,
      );
      await other.addResult(createEvaluateResult({ testIdx: 1, promptIdx: 7, metadata }));

      expect((await getCachedResultsSummary(eval_.id)).savedReportPromptIndices).toEqual([3]);
      expect((await getCachedResultsSummary(other.id)).savedReportPromptIndices).toEqual([7]);
    });
  });

  describe('count functions comparison', () => {
    it('should return same count when 1 provider per test', async () => {
      const { eval_ } = await createEvalWithResults(1, 5);

      const distinctCount = await getCachedResultsCount(eval_.id);
      const totalCount = await getTotalResultRowCount(eval_.id);

      // With 1 provider, distinct count equals total count
      expect(distinctCount).toBe(5);
      expect(totalCount).toBe(5);
    });

    it('should return different counts when multiple providers per test', async () => {
      const { eval_ } = await createEvalWithResults(3, 4);

      const distinctCount = await getCachedResultsCount(eval_.id);
      const totalCount = await getTotalResultRowCount(eval_.id);

      // With 3 providers and 4 tests:
      // - distinct count = 4 (unique test indices)
      // - total count = 12 (3 providers × 4 tests)
      expect(distinctCount).toBe(4);
      expect(totalCount).toBe(12);
    });
  });

  describe('cache invalidation on result write (issue #9348)', () => {
    const makeResult = (_evalId: string, testIdx: number) =>
      ({
        description: `test-${testIdx}`,
        promptIdx: 0,
        testIdx,
        testCase: { vars: { input: `test${testIdx}` } },
        promptId: 'test-prompt',
        provider: { id: 'provider-1', label: 'Provider 1' },
        prompt: { raw: 'Test prompt', label: 'Test prompt' },
        vars: { input: `test${testIdx}` },
        response: {
          output: `response-${testIdx}`,
          tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0 },
        },
        error: null,
        failureReason: ResultFailureReason.NONE,
        success: true,
        score: 1,
        latencyMs: 10,
        gradingResult: {
          pass: true,
          score: 1,
          reason: 'Pass',
          namedScores: {},
          tokensUsed: { total: 0, prompt: 0, completion: 0, cached: 0 },
          componentResults: [],
        },
        namedScores: {},
        cost: 0,
        metadata: {},
      }) as Parameters<
        typeof import('../../src/models/evalResult')['default']['createFromEvaluateResult']
      >[1];

    it('getCachedResultsCount refreshes after createFromEvaluateResult (issue #9348)', async () => {
      const eval_ = await Eval.create(
        { providers: [{ id: 'provider-1' }], prompts: ['Test prompt'], tests: [] },
        [{ raw: 'Test prompt', label: 'Test prompt' }],
      );

      // Seed zero into cache before any inserts
      const before = await getCachedResultsCount(eval_.id);
      expect(before).toBe(0);

      // Insert a result — this should bust the cache automatically
      await eval_.addResult(makeResult(eval_.id, 0));

      // Must see fresh count without any manual clearCountCache() call
      const after = await getCachedResultsCount(eval_.id);
      expect(after).toBe(1);
    });

    it('getTotalResultRowCount refreshes after createFromEvaluateResult (issue #9348)', async () => {
      const eval_ = await Eval.create(
        { providers: [{ id: 'provider-1' }], prompts: ['Test prompt'], tests: [] },
        [{ raw: 'Test prompt', label: 'Test prompt' }],
      );

      const before = await getTotalResultRowCount(eval_.id);
      expect(before).toBe(0);

      await eval_.addResult(makeResult(eval_.id, 0));

      const after = await getTotalResultRowCount(eval_.id);
      expect(after).toBe(1);
    });

    it('getCachedResultsCount refreshes after createManyFromEvaluateResult (issue #9348)', async () => {
      const eval_ = await Eval.create(
        { providers: [{ id: 'provider-1' }], prompts: ['Test prompt'], tests: [] },
        [{ raw: 'Test prompt', label: 'Test prompt' }],
      );

      const before = await getCachedResultsCount(eval_.id);
      expect(before).toBe(0);

      const EvalResult = (await import('../../src/models/evalResult')).default;
      await EvalResult.createManyFromEvaluateResult(
        [makeResult(eval_.id, 0), makeResult(eval_.id, 1)] as any,
        eval_.id,
      );

      const after = await getCachedResultsCount(eval_.id);
      expect(after).toBe(2);
    });
  });
});
