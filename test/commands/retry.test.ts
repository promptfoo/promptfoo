import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteErrorResults,
  getErrorResultIds,
  recalculatePromptMetrics,
} from '../../src/commands/retry';
import { getDb } from '../../src/database/index';
import { evalResultsTable } from '../../src/database/tables';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import { ResultFailureReason } from '../../src/types/index';
import { shouldShareResults } from '../../src/util/sharing';

describe('retry command', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getErrorResultIds', () => {
    let evalId: string;

    beforeEach(async () => {
      // Create a new eval for each test
      const evalRecord = await Eval.create({}, []);
      evalId = evalRecord.id;

      const db = getDb();

      const mockProvider = { id: 'test-provider' };

      // Insert some results with different failure reasons
      await db.insert(evalResultsTable).values([
        {
          id: `${evalId}-result-1`,
          evalId,
          promptIdx: 0,
          testIdx: 0,
          prompt: { raw: 'test', display: 'test', label: 'test' },
          testCase: { vars: {} },
          provider: mockProvider,
          success: true,
          score: 1,
          failureReason: ResultFailureReason.NONE,
          namedScores: {},
        },
        {
          id: `${evalId}-result-2`,
          evalId,
          promptIdx: 0,
          testIdx: 1,
          prompt: { raw: 'test', display: 'test', label: 'test' },
          testCase: { vars: {} },
          provider: mockProvider,
          success: false,
          score: 0,
          failureReason: ResultFailureReason.ERROR,
          namedScores: {},
        },
        {
          id: `${evalId}-result-3`,
          evalId,
          promptIdx: 0,
          testIdx: 2,
          prompt: { raw: 'test', display: 'test', label: 'test' },
          testCase: { vars: {} },
          provider: mockProvider,
          success: false,
          score: 0,
          failureReason: ResultFailureReason.ASSERT,
          namedScores: {},
        },
        {
          id: `${evalId}-result-4`,
          evalId,
          promptIdx: 0,
          testIdx: 3,
          prompt: { raw: 'test', display: 'test', label: 'test' },
          testCase: { vars: {} },
          provider: mockProvider,
          success: false,
          score: 0,
          failureReason: ResultFailureReason.ERROR,
          namedScores: {},
        },
      ]);
    });

    it('should return only ERROR result IDs', async () => {
      const errorIds = await getErrorResultIds(evalId);

      expect(errorIds).toHaveLength(2);
      expect(errorIds).toContain(`${evalId}-result-2`);
      expect(errorIds).toContain(`${evalId}-result-4`);
      expect(errorIds).not.toContain(`${evalId}-result-1`);
      expect(errorIds).not.toContain(`${evalId}-result-3`);
    });

    it('should return empty array if no ERROR results', async () => {
      const emptyEval = await Eval.create({}, []);
      const db = getDb();

      await db.insert(evalResultsTable).values([
        {
          id: `${emptyEval.id}-result-1`,
          evalId: emptyEval.id,
          promptIdx: 0,
          testIdx: 0,
          prompt: { raw: 'test', display: 'test', label: 'test' },
          testCase: { vars: {} },
          provider: { id: 'test-provider' },
          success: true,
          score: 1,
          failureReason: ResultFailureReason.NONE,
          namedScores: {},
        },
      ]);

      const errorIds = await getErrorResultIds(emptyEval.id);
      expect(errorIds).toHaveLength(0);
    });
  });

  describe('deleteErrorResults', () => {
    it('should delete specified results', async () => {
      const evalRecord = await Eval.create({}, []);
      const db = getDb();
      const mockProvider = { id: 'test-provider' };

      // Insert results
      await db.insert(evalResultsTable).values([
        {
          id: `${evalRecord.id}-del-1`,
          evalId: evalRecord.id,
          promptIdx: 0,
          testIdx: 0,
          prompt: { raw: 'test', display: 'test', label: 'test' },
          testCase: { vars: {} },
          provider: mockProvider,
          success: false,
          score: 0,
          failureReason: ResultFailureReason.ERROR,
          namedScores: {},
        },
        {
          id: `${evalRecord.id}-del-2`,
          evalId: evalRecord.id,
          promptIdx: 0,
          testIdx: 1,
          prompt: { raw: 'test', display: 'test', label: 'test' },
          testCase: { vars: {} },
          provider: mockProvider,
          success: true,
          score: 1,
          failureReason: ResultFailureReason.NONE,
          namedScores: {},
        },
      ]);

      // Delete only the first result
      await deleteErrorResults([`${evalRecord.id}-del-1`]);

      // Verify first result is deleted
      const remaining = await db
        .select()
        .from(evalResultsTable)
        .where(eq(evalResultsTable.evalId, evalRecord.id));

      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(`${evalRecord.id}-del-2`);
    });

    it('should handle empty array gracefully', async () => {
      // Should not throw
      await expect(deleteErrorResults([])).resolves.not.toThrow();
    });

    it('should delete multiple results in a single batch operation', async () => {
      const evalRecord = await Eval.create({}, []);
      const db = getDb();
      const mockProvider = { id: 'test-provider' };

      // Insert multiple results
      const resultIds: string[] = [];
      for (let i = 0; i < 5; i++) {
        const id = `${evalRecord.id}-batch-${i}`;
        resultIds.push(id);
        await db.insert(evalResultsTable).values({
          id,
          evalId: evalRecord.id,
          promptIdx: 0,
          testIdx: i,
          prompt: { raw: 'test', display: 'test', label: 'test' },
          testCase: { vars: {} },
          provider: mockProvider,
          success: false,
          score: 0,
          failureReason: ResultFailureReason.ERROR,
          namedScores: {},
        });
      }

      // Delete all at once
      await deleteErrorResults(resultIds);

      // Verify all deleted
      const remaining = await db
        .select()
        .from(evalResultsTable)
        .where(eq(evalResultsTable.evalId, evalRecord.id));

      expect(remaining).toHaveLength(0);
    });
  });

  describe('shouldShareResults', () => {
    beforeEach(() => {
      // Reset environment
      vi.unstubAllEnvs();
    });

    it('should return false when CLI --no-share is set', () => {
      const result = shouldShareResults({
        cliShare: false,
        configShare: true,
        configSharing: true,
      });
      expect(result).toBe(false);
    });

    it('should return false when PROMPTFOO_DISABLE_SHARING env is set', () => {
      vi.stubEnv('PROMPTFOO_DISABLE_SHARING', 'true');
      const result = shouldShareResults({
        cliShare: undefined,
        configShare: true,
        configSharing: true,
      });
      expect(result).toBe(false);
    });

    it('should return true when CLI --share is set', () => {
      const result = shouldShareResults({
        cliShare: true,
        configShare: false,
        configSharing: false,
      });
      expect(result).toBe(true);
    });

    it('should use configShare when CLI flag not set', () => {
      const result = shouldShareResults({
        cliShare: undefined,
        configShare: true,
        configSharing: false,
      });
      expect(result).toBe(true);
    });

    it('should use configSharing when CLI flag and configShare not set', () => {
      const result = shouldShareResults({
        cliShare: undefined,
        configShare: undefined,
        configSharing: true,
      });
      expect(result).toBe(true);
    });

    it('should default to cloudConfig.isEnabled() when no options set', () => {
      // When no explicit sharing options are set, the result depends on cloudConfig.isEnabled()
      // We just verify the function completes without error and returns a boolean
      const result = shouldShareResults({
        cliShare: undefined,
        configShare: undefined,
        configSharing: undefined,
      });
      expect(typeof result).toBe('boolean');
    });
  });

  describe('recalculatePromptMetrics', () => {
    it('should recalculate metrics after results change', async () => {
      // Create an eval with prompts
      const evalRecord = await Eval.create({}, []);
      const db = getDb();
      const mockProvider = { id: 'test-provider' };
      const mockPrompt = { raw: 'test', display: 'test', label: 'test', provider: 'test-provider' };

      // Add a prompt to the eval
      await evalRecord.addPrompts([mockPrompt]);

      // Insert results with different scores and outcomes
      await db.insert(evalResultsTable).values([
        {
          id: `${evalRecord.id}-metric-1`,
          evalId: evalRecord.id,
          promptIdx: 0,
          testIdx: 0,
          prompt: mockPrompt,
          testCase: { vars: {} },
          provider: mockProvider,
          success: true,
          score: 1,
          latencyMs: 100,
          cost: 0.01,
          failureReason: ResultFailureReason.NONE,
          namedScores: { accuracy: 1 },
        },
        {
          id: `${evalRecord.id}-metric-2`,
          evalId: evalRecord.id,
          promptIdx: 0,
          testIdx: 1,
          prompt: mockPrompt,
          testCase: { vars: {} },
          provider: mockProvider,
          success: false,
          score: 0,
          latencyMs: 200,
          cost: 0.02,
          failureReason: ResultFailureReason.ASSERT,
          namedScores: { accuracy: 0 },
        },
      ]);

      // Recalculate metrics
      await recalculatePromptMetrics(evalRecord);

      // Verify metrics were recalculated
      expect(evalRecord.prompts[0].metrics).toBeDefined();
      expect(evalRecord.prompts[0].metrics?.testPassCount).toBe(1);
      expect(evalRecord.prompts[0].metrics?.testFailCount).toBe(1);
      expect(evalRecord.prompts[0].metrics?.testErrorCount).toBe(0);
      expect(evalRecord.prompts[0].metrics?.score).toBe(1);
      expect(evalRecord.prompts[0].metrics?.totalLatencyMs).toBe(300);
      expect(evalRecord.prompts[0].metrics?.cost).toBe(0.03);
    });

    it('should count ERROR results correctly', async () => {
      const evalRecord = await Eval.create({}, []);
      const db = getDb();
      const mockProvider = { id: 'test-provider' };
      const mockPrompt = { raw: 'test', display: 'test', label: 'test', provider: 'test-provider' };

      await evalRecord.addPrompts([mockPrompt]);

      await db.insert(evalResultsTable).values([
        {
          id: `${evalRecord.id}-err-1`,
          evalId: evalRecord.id,
          promptIdx: 0,
          testIdx: 0,
          prompt: mockPrompt,
          testCase: { vars: {} },
          provider: mockProvider,
          success: true,
          score: 1,
          failureReason: ResultFailureReason.NONE,
          namedScores: {},
        },
        {
          id: `${evalRecord.id}-err-2`,
          evalId: evalRecord.id,
          promptIdx: 0,
          testIdx: 1,
          prompt: mockPrompt,
          testCase: { vars: {} },
          provider: mockProvider,
          success: false,
          score: 0,
          failureReason: ResultFailureReason.ERROR,
          namedScores: {},
        },
      ]);

      await recalculatePromptMetrics(evalRecord);

      expect(evalRecord.prompts[0].metrics?.testPassCount).toBe(1);
      expect(evalRecord.prompts[0].metrics?.testFailCount).toBe(0);
      expect(evalRecord.prompts[0].metrics?.testErrorCount).toBe(1);
    });

    it('should handle multiple prompts', async () => {
      const evalRecord = await Eval.create({}, []);
      const db = getDb();
      const mockProvider = { id: 'test-provider' };
      const mockPrompt1 = {
        raw: 'test1',
        display: 'test1',
        label: 'test1',
        provider: 'test-provider',
      };
      const mockPrompt2 = {
        raw: 'test2',
        display: 'test2',
        label: 'test2',
        provider: 'test-provider',
      };

      await evalRecord.addPrompts([mockPrompt1, mockPrompt2]);

      await db.insert(evalResultsTable).values([
        {
          id: `${evalRecord.id}-multi-1`,
          evalId: evalRecord.id,
          promptIdx: 0,
          testIdx: 0,
          prompt: mockPrompt1,
          testCase: { vars: {} },
          provider: mockProvider,
          success: true,
          score: 1,
          failureReason: ResultFailureReason.NONE,
          namedScores: {},
        },
        {
          id: `${evalRecord.id}-multi-2`,
          evalId: evalRecord.id,
          promptIdx: 1,
          testIdx: 0,
          prompt: mockPrompt2,
          testCase: { vars: {} },
          provider: mockProvider,
          success: false,
          score: 0,
          failureReason: ResultFailureReason.ASSERT,
          namedScores: {},
        },
      ]);

      await recalculatePromptMetrics(evalRecord);

      expect(evalRecord.prompts[0].metrics?.testPassCount).toBe(1);
      expect(evalRecord.prompts[0].metrics?.testFailCount).toBe(0);
      expect(evalRecord.prompts[1].metrics?.testPassCount).toBe(0);
      expect(evalRecord.prompts[1].metrics?.testFailCount).toBe(1);
    });

    it('should handle empty results', async () => {
      const evalRecord = await Eval.create({}, []);
      const mockPrompt = { raw: 'test', display: 'test', label: 'test', provider: 'test-provider' };

      await evalRecord.addPrompts([mockPrompt]);

      // No results inserted
      await recalculatePromptMetrics(evalRecord);

      // Should have initialized metrics with zeros
      expect(evalRecord.prompts[0].metrics?.testPassCount).toBe(0);
      expect(evalRecord.prompts[0].metrics?.testFailCount).toBe(0);
      expect(evalRecord.prompts[0].metrics?.testErrorCount).toBe(0);
      expect(evalRecord.prompts[0].metrics?.score).toBe(0);
    });

    it('should accumulate named scores correctly', async () => {
      const evalRecord = await Eval.create({}, []);
      const db = getDb();
      const mockProvider = { id: 'test-provider' };
      const mockPrompt = { raw: 'test', display: 'test', label: 'test', provider: 'test-provider' };

      await evalRecord.addPrompts([mockPrompt]);

      await db.insert(evalResultsTable).values([
        {
          id: `${evalRecord.id}-named-1`,
          evalId: evalRecord.id,
          promptIdx: 0,
          testIdx: 0,
          prompt: mockPrompt,
          testCase: { vars: {} },
          provider: mockProvider,
          success: true,
          score: 1,
          failureReason: ResultFailureReason.NONE,
          namedScores: { accuracy: 0.9, relevance: 0.8 },
        },
        {
          id: `${evalRecord.id}-named-2`,
          evalId: evalRecord.id,
          promptIdx: 0,
          testIdx: 1,
          prompt: mockPrompt,
          testCase: { vars: {} },
          provider: mockProvider,
          success: true,
          score: 1,
          failureReason: ResultFailureReason.NONE,
          namedScores: { accuracy: 0.7, relevance: 0.9 },
        },
      ]);

      await recalculatePromptMetrics(evalRecord);

      expect(evalRecord.prompts[0].metrics?.namedScores).toBeDefined();
      expect(evalRecord.prompts[0].metrics?.namedScores?.accuracy).toBeCloseTo(1.6, 1);
      expect(evalRecord.prompts[0].metrics?.namedScores?.relevance).toBeCloseTo(1.7, 1);
    });

    it('should accumulate metrics correctly across multiple batches', async () => {
      // Test that metrics accumulate correctly when results span multiple batch boundaries
      // Batch size is 1000 (by testIdx), so results at testIdx 0-999, 1000-1999, 2000-2999 are in different batches
      const evalRecord = await Eval.create({}, []);
      const db = getDb();
      const mockProvider = { id: 'test-provider' };
      const mockPrompt = { raw: 'test', display: 'test', label: 'test', provider: 'test-provider' };

      await evalRecord.addPrompts([mockPrompt]);

      // Insert results spanning 3 batches (testIdx 0, 1000, 2000)
      await db.insert(evalResultsTable).values([
        // Batch 1 (testIdx 0-999)
        {
          id: `${evalRecord.id}-batch1-1`,
          evalId: evalRecord.id,
          promptIdx: 0,
          testIdx: 0,
          prompt: mockPrompt,
          testCase: { vars: {} },
          provider: mockProvider,
          success: true,
          score: 1,
          latencyMs: 100,
          cost: 0.01,
          failureReason: ResultFailureReason.NONE,
          namedScores: { accuracy: 0.9 },
        },
        {
          id: `${evalRecord.id}-batch1-2`,
          evalId: evalRecord.id,
          promptIdx: 0,
          testIdx: 500,
          prompt: mockPrompt,
          testCase: { vars: {} },
          provider: mockProvider,
          success: true,
          score: 1,
          latencyMs: 100,
          cost: 0.01,
          failureReason: ResultFailureReason.NONE,
          namedScores: { accuracy: 0.8 },
        },
        // Batch 2 (testIdx 1000-1999)
        {
          id: `${evalRecord.id}-batch2-1`,
          evalId: evalRecord.id,
          promptIdx: 0,
          testIdx: 1000,
          prompt: mockPrompt,
          testCase: { vars: {} },
          provider: mockProvider,
          success: false,
          score: 0,
          latencyMs: 200,
          cost: 0.02,
          failureReason: ResultFailureReason.ASSERT,
          namedScores: { accuracy: 0.5 },
        },
        {
          id: `${evalRecord.id}-batch2-2`,
          evalId: evalRecord.id,
          promptIdx: 0,
          testIdx: 1500,
          prompt: mockPrompt,
          testCase: { vars: {} },
          provider: mockProvider,
          success: false,
          score: 0,
          latencyMs: 200,
          cost: 0.02,
          failureReason: ResultFailureReason.ERROR,
          namedScores: { accuracy: 0.3 },
        },
        // Batch 3 (testIdx 2000-2999)
        {
          id: `${evalRecord.id}-batch3-1`,
          evalId: evalRecord.id,
          promptIdx: 0,
          testIdx: 2000,
          prompt: mockPrompt,
          testCase: { vars: {} },
          provider: mockProvider,
          success: true,
          score: 1,
          latencyMs: 150,
          cost: 0.015,
          failureReason: ResultFailureReason.NONE,
          namedScores: { accuracy: 1.0 },
        },
      ]);

      await recalculatePromptMetrics(evalRecord);

      // Verify accumulated metrics across all batches
      expect(evalRecord.prompts[0].metrics?.testPassCount).toBe(3);
      expect(evalRecord.prompts[0].metrics?.testFailCount).toBe(1);
      expect(evalRecord.prompts[0].metrics?.testErrorCount).toBe(1);
      expect(evalRecord.prompts[0].metrics?.score).toBe(3); // 1+1+0+0+1
      expect(evalRecord.prompts[0].metrics?.totalLatencyMs).toBe(750); // 100+100+200+200+150
      expect(evalRecord.prompts[0].metrics?.cost).toBeCloseTo(0.075, 3); // 0.01+0.01+0.02+0.02+0.015
      expect(evalRecord.prompts[0].metrics?.namedScores?.accuracy).toBeCloseTo(3.5, 1); // 0.9+0.8+0.5+0.3+1.0
    });

    it('should handle results at exact batch boundary (testIdx 999 and 1000)', async () => {
      const evalRecord = await Eval.create({}, []);
      const db = getDb();
      const mockProvider = { id: 'test-provider' };
      const mockPrompt = { raw: 'test', display: 'test', label: 'test', provider: 'test-provider' };

      await evalRecord.addPrompts([mockPrompt]);

      // Insert results at exact batch boundary
      await db.insert(evalResultsTable).values([
        {
          id: `${evalRecord.id}-boundary-1`,
          evalId: evalRecord.id,
          promptIdx: 0,
          testIdx: 999, // Last index of batch 1
          prompt: mockPrompt,
          testCase: { vars: {} },
          provider: mockProvider,
          success: true,
          score: 1,
          failureReason: ResultFailureReason.NONE,
          namedScores: { boundary_test: 0.5 },
        },
        {
          id: `${evalRecord.id}-boundary-2`,
          evalId: evalRecord.id,
          promptIdx: 0,
          testIdx: 1000, // First index of batch 2
          prompt: mockPrompt,
          testCase: { vars: {} },
          provider: mockProvider,
          success: true,
          score: 1,
          failureReason: ResultFailureReason.NONE,
          namedScores: { boundary_test: 0.5 },
        },
      ]);

      await recalculatePromptMetrics(evalRecord);

      // Both results should be counted
      expect(evalRecord.prompts[0].metrics?.testPassCount).toBe(2);
      expect(evalRecord.prompts[0].metrics?.score).toBe(2);
      expect(evalRecord.prompts[0].metrics?.namedScores?.boundary_test).toBeCloseTo(1.0, 1);
    });

    it('should handle single result edge case', async () => {
      const evalRecord = await Eval.create({}, []);
      const db = getDb();
      const mockProvider = { id: 'test-provider' };
      const mockPrompt = { raw: 'test', display: 'test', label: 'test', provider: 'test-provider' };

      await evalRecord.addPrompts([mockPrompt]);

      await db.insert(evalResultsTable).values([
        {
          id: `${evalRecord.id}-single`,
          evalId: evalRecord.id,
          promptIdx: 0,
          testIdx: 0,
          prompt: mockPrompt,
          testCase: { vars: {} },
          provider: mockProvider,
          success: true,
          score: 0.75,
          latencyMs: 42,
          cost: 0.005,
          failureReason: ResultFailureReason.NONE,
          namedScores: { quality: 0.9 },
        },
      ]);

      await recalculatePromptMetrics(evalRecord);

      expect(evalRecord.prompts[0].metrics?.testPassCount).toBe(1);
      expect(evalRecord.prompts[0].metrics?.testFailCount).toBe(0);
      expect(evalRecord.prompts[0].metrics?.score).toBe(0.75);
      expect(evalRecord.prompts[0].metrics?.totalLatencyMs).toBe(42);
      expect(evalRecord.prompts[0].metrics?.cost).toBe(0.005);
      expect(evalRecord.prompts[0].metrics?.namedScores?.quality).toBe(0.9);
    });

    it('should use fetchResultsBatched for streaming iteration', async () => {
      const evalRecord = await Eval.create({}, []);
      const db = getDb();
      const mockProvider = { id: 'test-provider' };
      const mockPrompt = { raw: 'test', display: 'test', label: 'test', provider: 'test-provider' };

      await evalRecord.addPrompts([mockPrompt]);

      // Insert a result
      await db.insert(evalResultsTable).values([
        {
          id: `${evalRecord.id}-stream-1`,
          evalId: evalRecord.id,
          promptIdx: 0,
          testIdx: 0,
          prompt: mockPrompt,
          testCase: { vars: {} },
          provider: mockProvider,
          success: true,
          score: 1,
          failureReason: ResultFailureReason.NONE,
          namedScores: {},
        },
      ]);

      // Spy on fetchResultsBatched to verify it's called
      const fetchSpy = vi.spyOn(evalRecord, 'fetchResultsBatched');

      await recalculatePromptMetrics(evalRecord);

      // Verify fetchResultsBatched was called with batch size 1000
      expect(fetchSpy).toHaveBeenCalledWith(1000);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      fetchSpy.mockRestore();
    });

    it('should accumulate assertion counts from componentResults', async () => {
      const evalRecord = await Eval.create({}, []);
      const db = getDb();
      const mockProvider = { id: 'test-provider' };
      const mockPrompt = { raw: 'test', display: 'test', label: 'test', provider: 'test-provider' };

      await evalRecord.addPrompts([mockPrompt]);

      // Insert results with gradingResult containing componentResults
      await db.insert(evalResultsTable).values([
        {
          id: `${evalRecord.id}-assert-1`,
          evalId: evalRecord.id,
          promptIdx: 0,
          testIdx: 0,
          prompt: mockPrompt,
          testCase: { vars: {} },
          provider: mockProvider,
          success: true,
          score: 1,
          failureReason: ResultFailureReason.NONE,
          namedScores: {},
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'passed',
            componentResults: [
              { pass: true, score: 1, reason: 'passed' },
              { pass: true, score: 1, reason: 'passed' },
              { pass: false, score: 0, reason: 'failed' },
            ],
          },
        },
        {
          id: `${evalRecord.id}-assert-2`,
          evalId: evalRecord.id,
          promptIdx: 0,
          testIdx: 1,
          prompt: mockPrompt,
          testCase: { vars: {} },
          provider: mockProvider,
          success: false,
          score: 0,
          failureReason: ResultFailureReason.ASSERT,
          namedScores: {},
          gradingResult: {
            pass: false,
            score: 0,
            reason: 'failed',
            componentResults: [
              { pass: false, score: 0, reason: 'failed' },
              { pass: false, score: 0, reason: 'failed' },
            ],
          },
        },
      ]);

      await recalculatePromptMetrics(evalRecord);

      // Verify assertion counts: 2 pass + 1 fail from first result, 2 fail from second result
      expect(evalRecord.prompts[0].metrics?.assertPassCount).toBe(2);
      expect(evalRecord.prompts[0].metrics?.assertFailCount).toBe(3);
    });

    it('should accumulate token usage from response', async () => {
      const evalRecord = await Eval.create({}, []);
      const db = getDb();
      const mockProvider = { id: 'test-provider' };
      const mockPrompt = { raw: 'test', display: 'test', label: 'test', provider: 'test-provider' };

      await evalRecord.addPrompts([mockPrompt]);

      // Insert results with token usage in response
      await db.insert(evalResultsTable).values([
        {
          id: `${evalRecord.id}-token-1`,
          evalId: evalRecord.id,
          promptIdx: 0,
          testIdx: 0,
          prompt: mockPrompt,
          testCase: { vars: {} },
          provider: mockProvider,
          success: true,
          score: 1,
          failureReason: ResultFailureReason.NONE,
          namedScores: {},
          response: {
            output: 'test output 1',
            tokenUsage: {
              prompt: 100,
              completion: 50,
              total: 150,
            },
          },
        },
        {
          id: `${evalRecord.id}-token-2`,
          evalId: evalRecord.id,
          promptIdx: 0,
          testIdx: 1,
          prompt: mockPrompt,
          testCase: { vars: {} },
          provider: mockProvider,
          success: true,
          score: 1,
          failureReason: ResultFailureReason.NONE,
          namedScores: {},
          response: {
            output: 'test output 2',
            tokenUsage: {
              prompt: 200,
              completion: 100,
              total: 300,
            },
          },
        },
      ]);

      await recalculatePromptMetrics(evalRecord);

      // Verify token usage accumulation
      expect(evalRecord.prompts[0].metrics?.tokenUsage).toBeDefined();
      expect(evalRecord.prompts[0].metrics?.tokenUsage?.prompt).toBe(300); // 100 + 200
      expect(evalRecord.prompts[0].metrics?.tokenUsage?.completion).toBe(150); // 50 + 100
      expect(evalRecord.prompts[0].metrics?.tokenUsage?.total).toBe(450); // 150 + 300
    });

    it('should accumulate assertion token usage from gradingResult', async () => {
      const evalRecord = await Eval.create({}, []);
      const db = getDb();
      const mockProvider = { id: 'test-provider' };
      const mockPrompt = { raw: 'test', display: 'test', label: 'test', provider: 'test-provider' };

      await evalRecord.addPrompts([mockPrompt]);

      // Insert results with assertion token usage in gradingResult
      await db.insert(evalResultsTable).values([
        {
          id: `${evalRecord.id}-atoken-1`,
          evalId: evalRecord.id,
          promptIdx: 0,
          testIdx: 0,
          prompt: mockPrompt,
          testCase: { vars: {} },
          provider: mockProvider,
          success: true,
          score: 1,
          failureReason: ResultFailureReason.NONE,
          namedScores: {},
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'passed',
            tokensUsed: {
              total: 50,
              prompt: 30,
              completion: 20,
            },
          },
        },
        {
          id: `${evalRecord.id}-atoken-2`,
          evalId: evalRecord.id,
          promptIdx: 0,
          testIdx: 1,
          prompt: mockPrompt,
          testCase: { vars: {} },
          provider: mockProvider,
          success: true,
          score: 1,
          failureReason: ResultFailureReason.NONE,
          namedScores: {},
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'passed',
            tokensUsed: {
              total: 75,
              prompt: 45,
              completion: 30,
            },
          },
        },
      ]);

      await recalculatePromptMetrics(evalRecord);

      // Verify assertion token usage accumulation
      expect(evalRecord.prompts[0].metrics?.tokenUsage?.assertions).toBeDefined();
      expect(evalRecord.prompts[0].metrics?.tokenUsage?.assertions?.total).toBe(125); // 50 + 75
      expect(evalRecord.prompts[0].metrics?.tokenUsage?.assertions?.prompt).toBe(75); // 30 + 45
      expect(evalRecord.prompts[0].metrics?.tokenUsage?.assertions?.completion).toBe(50); // 20 + 30
    });

    it('should skip results with invalid promptIdx', async () => {
      const evalRecord = await Eval.create({}, []);
      const db = getDb();
      const mockProvider = { id: 'test-provider' };
      const mockPrompt = { raw: 'test', display: 'test', label: 'test', provider: 'test-provider' };

      await evalRecord.addPrompts([mockPrompt]);

      // Insert results - one valid, one with invalid promptIdx
      await db.insert(evalResultsTable).values([
        {
          id: `${evalRecord.id}-valid`,
          evalId: evalRecord.id,
          promptIdx: 0,
          testIdx: 0,
          prompt: mockPrompt,
          testCase: { vars: {} },
          provider: mockProvider,
          success: true,
          score: 1,
          failureReason: ResultFailureReason.NONE,
          namedScores: {},
        },
        {
          id: `${evalRecord.id}-invalid`,
          evalId: evalRecord.id,
          promptIdx: 999, // Invalid promptIdx - no prompt at this index
          testIdx: 1,
          prompt: mockPrompt,
          testCase: { vars: {} },
          provider: mockProvider,
          success: true,
          score: 1,
          failureReason: ResultFailureReason.NONE,
          namedScores: {},
        },
      ]);

      // Should not throw and should only count the valid result
      await recalculatePromptMetrics(evalRecord);

      // Only the valid result should be counted
      expect(evalRecord.prompts[0].metrics?.testPassCount).toBe(1);
      expect(evalRecord.prompts[0].metrics?.score).toBe(1);
    });

    it('should not call addPrompts when eval is not persisted', async () => {
      // Create a non-persisted eval using the constructor directly
      const mockPrompt = { raw: 'test', display: 'test', label: 'test', provider: 'test-provider' };
      const evalRecord = new Eval(
        {},
        {
          prompts: [mockPrompt],
          persisted: false, // Non-persisted eval
        },
      );

      // Spy on addPrompts
      const addPromptsSpy = vi.spyOn(evalRecord, 'addPrompts');

      await recalculatePromptMetrics(evalRecord);

      // addPrompts should NOT be called since eval is not persisted
      expect(addPromptsSpy).not.toHaveBeenCalled();

      addPromptsSpy.mockRestore();
    });

    it('should rethrow error when batch iteration fails', async () => {
      const evalRecord = await Eval.create({}, []);
      const mockPrompt = { raw: 'test', display: 'test', label: 'test', provider: 'test-provider' };

      await evalRecord.addPrompts([mockPrompt]);

      // Mock fetchResultsBatched to throw an error
      const mockError = new Error('Database connection failed');
      vi.spyOn(evalRecord, 'fetchResultsBatched').mockImplementation(async function* () {
        throw mockError;
      });

      // Should rethrow the error
      await expect(recalculatePromptMetrics(evalRecord)).rejects.toThrow(
        'Database connection failed',
      );
    });

    it('should handle results with null/undefined optional fields', async () => {
      const evalRecord = await Eval.create({}, []);
      const db = getDb();
      const mockProvider = { id: 'test-provider' };
      const mockPrompt = { raw: 'test', display: 'test', label: 'test', provider: 'test-provider' };

      await evalRecord.addPrompts([mockPrompt]);

      // Insert result with minimal fields (no latencyMs, cost, response, gradingResult)
      await db.insert(evalResultsTable).values([
        {
          id: `${evalRecord.id}-minimal`,
          evalId: evalRecord.id,
          promptIdx: 0,
          testIdx: 0,
          prompt: mockPrompt,
          testCase: { vars: {} },
          provider: mockProvider,
          success: true,
          score: 1,
          failureReason: ResultFailureReason.NONE,
          namedScores: {},
          // No latencyMs, cost, response, or gradingResult
        },
      ]);

      // Should handle gracefully without errors
      await recalculatePromptMetrics(evalRecord);

      expect(evalRecord.prompts[0].metrics?.testPassCount).toBe(1);
      expect(evalRecord.prompts[0].metrics?.totalLatencyMs).toBe(0);
      expect(evalRecord.prompts[0].metrics?.cost).toBe(0);
      expect(evalRecord.prompts[0].metrics?.assertPassCount).toBe(0);
      expect(evalRecord.prompts[0].metrics?.assertFailCount).toBe(0);
    });

    it('should handle results with null score', async () => {
      const evalRecord = await Eval.create({}, []);
      const db = getDb();
      const mockProvider = { id: 'test-provider' };
      const mockPrompt = { raw: 'test', display: 'test', label: 'test', provider: 'test-provider' };

      await evalRecord.addPrompts([mockPrompt]);

      await db.insert(evalResultsTable).values([
        {
          id: `${evalRecord.id}-null-score`,
          evalId: evalRecord.id,
          promptIdx: 0,
          testIdx: 0,
          prompt: mockPrompt,
          testCase: { vars: {} },
          provider: mockProvider,
          success: true,
          score: null as unknown as number, // Explicitly null score
          failureReason: ResultFailureReason.NONE,
          namedScores: {},
        },
        {
          id: `${evalRecord.id}-valid-score`,
          evalId: evalRecord.id,
          promptIdx: 0,
          testIdx: 1,
          prompt: mockPrompt,
          testCase: { vars: {} },
          provider: mockProvider,
          success: true,
          score: 0.5,
          failureReason: ResultFailureReason.NONE,
          namedScores: {},
        },
      ]);

      await recalculatePromptMetrics(evalRecord);

      // Null score should be treated as 0
      expect(evalRecord.prompts[0].metrics?.score).toBe(0.5);
    });
  });
});
