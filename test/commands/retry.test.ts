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
  });
});
