import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../src/database/index';
import { runDbMigrations } from '../../src/migrate';
import { queryTestIndicesOptimized } from '../../src/models/evalPerformance';
import { ResultFailureReason } from '../../src/types/index';
import EvalFactory from '../factories/evalFactory';

import type { EvaluateResult } from '../../src/types/index';

describe('Highlights Filter Feature', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(async () => {
    // Clear all tables before each test
    const db = getDb();
    await db.run('DELETE FROM eval_results');
    await db.run('DELETE FROM evals_to_datasets');
    await db.run('DELETE FROM evals_to_prompts');
    await db.run('DELETE FROM evals_to_tags');
    await db.run('DELETE FROM evals');
  });

  describe('Eval.queryTestIndices highlights filter', () => {
    it('should return only highlighted results when filterMode is highlights', async () => {
      const eval_ = await EvalFactory.create({ numResults: 0 });

      // Add results with various highlighting scenarios
      const results = [
        { testIdx: 0, comment: '!highlight This is important' },
        { testIdx: 1, comment: 'Regular comment' },
        { testIdx: 2, comment: '!highlight Another highlight' },
        { testIdx: 3, comment: '' },
        { testIdx: 4, comment: '!highlight' },
        { testIdx: 5, comment: 'Not a highlight' },
      ];

      for (const result of results) {
        await eval_.addResult({
          description: `test-${result.testIdx}`,
          promptIdx: 0,
          testIdx: result.testIdx,
          testCase: { vars: { test: `value${result.testIdx}` } },
          promptId: 'test-prompt',
          provider: { id: 'test-provider', label: 'test-label' },
          prompt: { raw: 'Test prompt', label: 'Test prompt' },
          vars: { test: `value${result.testIdx}` },
          response: { output: `Response ${result.testIdx}` },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'Test passed',
            comment: result.comment,
            namedScores: {},
            tokensUsed: { total: 10, prompt: 5, completion: 5 },
            componentResults: [],
          },
          namedScores: {},
          cost: 0.007,
          metadata: {},
        } as EvaluateResult);
      }

      // Test highlights filter
      const { testIndices, filteredCount } = await (eval_ as any).queryTestIndices({
        filterMode: 'highlights',
      });

      // Should return only test indices 0, 2, and 4 (those with !highlight)
      expect(filteredCount).toBe(3);
      expect(testIndices).toEqual([0, 2, 4]);
    });

    it('should handle empty dataset with highlights filter', async () => {
      const eval_ = await EvalFactory.create({ numResults: 0 });

      const { testIndices, filteredCount } = await (eval_ as any).queryTestIndices({
        filterMode: 'highlights',
      });

      expect(filteredCount).toBe(0);
      expect(testIndices).toEqual([]);
    });

    it('should handle dataset with no highlights', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 5,
        resultTypes: ['success', 'failure'],
      });

      const { testIndices, filteredCount } = await (eval_ as any).queryTestIndices({
        filterMode: 'highlights',
      });

      expect(filteredCount).toBe(0);
      expect(testIndices).toEqual([]);
    });

    it('should work with pagination when filtering highlights', async () => {
      const eval_ = await EvalFactory.create({ numResults: 0 });

      // Add 10 highlighted results
      for (let i = 0; i < 10; i++) {
        await eval_.addResult({
          description: `test-${i}`,
          promptIdx: 0,
          testIdx: i,
          testCase: { vars: { test: `value${i}` } },
          promptId: 'test-prompt',
          provider: { id: 'test-provider', label: 'test-label' },
          prompt: { raw: 'Test prompt', label: 'Test prompt' },
          vars: { test: `value${i}` },
          response: { output: `Response ${i}` },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'Test passed',
            comment: `!highlight Important item ${i}`,
            namedScores: {},
            tokensUsed: { total: 10, prompt: 5, completion: 5 },
            componentResults: [],
          },
          namedScores: {},
          cost: 0.007,
          metadata: {},
        } as EvaluateResult);
      }

      // Test pagination
      const page1 = await (eval_ as any).queryTestIndices({
        filterMode: 'highlights',
        offset: 0,
        limit: 5,
      });

      const page2 = await (eval_ as any).queryTestIndices({
        filterMode: 'highlights',
        offset: 5,
        limit: 5,
      });

      expect(page1.filteredCount).toBe(10);
      expect(page1.testIndices).toEqual([0, 1, 2, 3, 4]);

      expect(page2.filteredCount).toBe(10);
      expect(page2.testIndices).toEqual([5, 6, 7, 8, 9]);
    });

    it('should combine highlights filter with search query', async () => {
      const eval_ = await EvalFactory.create({ numResults: 0 });

      const testData = [
        { testIdx: 0, comment: '!highlight Contains needle', output: 'Response with needle' },
        { testIdx: 1, comment: '!highlight No match', output: 'Different response' },
        { testIdx: 2, comment: 'Regular comment', output: 'Contains needle' },
        { testIdx: 3, comment: '!highlight Has needle too', output: 'Another needle' },
      ];

      for (const data of testData) {
        await eval_.addResult({
          description: `test-${data.testIdx}`,
          promptIdx: 0,
          testIdx: data.testIdx,
          testCase: { vars: { test: `value${data.testIdx}` } },
          promptId: 'test-prompt',
          provider: { id: 'test-provider', label: 'test-label' },
          prompt: { raw: 'Test prompt', label: 'Test prompt' },
          vars: { test: `value${data.testIdx}` },
          response: { output: data.output },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'Test passed',
            comment: data.comment,
            namedScores: {},
            tokensUsed: { total: 10, prompt: 5, completion: 5 },
            componentResults: [],
          },
          namedScores: {},
          cost: 0.007,
          metadata: {},
        } as EvaluateResult);
      }

      // Search for "needle" with highlights filter
      const { testIndices, filteredCount } = await (eval_ as any).queryTestIndices({
        filterMode: 'highlights',
        searchQuery: 'needle',
      });

      // Should return only highlighted results that also contain "needle"
      expect(filteredCount).toBe(2);
      expect(testIndices).toEqual([0, 3]);
    });

    it('should handle malformed grading results gracefully', async () => {
      const eval_ = await EvalFactory.create({ numResults: 0 });
      const db = getDb();

      // Insert a result with null grading_result
      await db.run(`
        INSERT INTO eval_results (
          id, eval_id, prompt_idx, test_idx, test_case, prompt, provider,
          success, score, grading_result
        ) VALUES (
          'test1', '${eval_.id}', 0, 0, '{}', '{}', '{}', 1, 1.0, NULL
        )
      `);

      // Insert a result with invalid JSON in grading_result
      await db.run(`
        INSERT INTO eval_results (
          id, eval_id, prompt_idx, test_idx, test_case, prompt, provider,
          success, score, grading_result
        ) VALUES (
          'test2', '${eval_.id}', 0, 1, '{}', '{}', '{}', 1, 1.0, '{}'
        )
      `);

      // Insert a valid highlighted result
      await db.run(`
        INSERT INTO eval_results (
          id, eval_id, prompt_idx, test_idx, test_case, prompt, provider,
          success, score, grading_result
        ) VALUES (
          'test3', '${eval_.id}', 0, 2, '{}', '{}', '{}', 1, 1.0,
          '{"comment": "!highlight Valid highlight", "pass": true, "score": 1}'
        )
      `);

      const { testIndices, filteredCount } = await (eval_ as any).queryTestIndices({
        filterMode: 'highlights',
      });

      // Should only return the valid highlighted result
      expect(filteredCount).toBe(1);
      expect(testIndices).toEqual([2]);
    });

    it('should combine highlights filter with other filter modes correctly', async () => {
      const eval_ = await EvalFactory.create({ numResults: 0 });

      // Create mixed results
      const testData = [
        { testIdx: 0, success: true, comment: '!highlight Success highlight' },
        { testIdx: 1, success: false, comment: '!highlight Failure highlight' },
        { testIdx: 2, success: true, comment: 'Regular success' },
        { testIdx: 3, success: false, comment: 'Regular failure' },
      ];

      for (const data of testData) {
        await eval_.addResult({
          description: `test-${data.testIdx}`,
          promptIdx: 0,
          testIdx: data.testIdx,
          testCase: { vars: { test: `value${data.testIdx}` } },
          promptId: 'test-prompt',
          provider: { id: 'test-provider', label: 'test-label' },
          prompt: { raw: 'Test prompt', label: 'Test prompt' },
          vars: { test: `value${data.testIdx}` },
          response: { output: `Response ${data.testIdx}` },
          error: null,
          failureReason: data.success ? ResultFailureReason.NONE : ResultFailureReason.ASSERT,
          success: data.success,
          score: data.success ? 1 : 0,
          latencyMs: 100,
          gradingResult: {
            pass: data.success,
            score: data.success ? 1 : 0,
            reason: data.success ? 'Test passed' : 'Test failed',
            comment: data.comment,
            namedScores: {},
            tokensUsed: { total: 10, prompt: 5, completion: 5 },
            componentResults: [],
          },
          namedScores: {},
          cost: 0.007,
          metadata: {},
        } as EvaluateResult);
      }

      // Test highlights filter alone
      const highlights = await (eval_ as any).queryTestIndices({
        filterMode: 'highlights',
      });
      expect(highlights.testIndices).toEqual([0, 1]);

      // Verify other filters still work
      const passes = await (eval_ as any).queryTestIndices({
        filterMode: 'passes',
      });
      expect(passes.testIndices).toEqual([0, 2]);

      const failures = await (eval_ as any).queryTestIndices({
        filterMode: 'failures',
      });
      expect(failures.testIndices).toEqual([1, 3]);
    });
  });

  describe('evalPerformance.queryTestIndicesOptimized highlights filter', () => {
    it('should return only highlighted results with optimized query', async () => {
      const eval_ = await EvalFactory.create({ numResults: 0 });

      // Add test data
      const results = [
        { testIdx: 0, comment: '!highlight Performance test' },
        { testIdx: 1, comment: 'Not highlighted' },
        { testIdx: 2, comment: '!highlight Another highlight' },
      ];

      for (const result of results) {
        await eval_.addResult({
          description: `test-${result.testIdx}`,
          promptIdx: 0,
          testIdx: result.testIdx,
          testCase: { vars: { test: `value${result.testIdx}` } },
          promptId: 'test-prompt',
          provider: { id: 'test-provider', label: 'test-label' },
          prompt: { raw: 'Test prompt', label: 'Test prompt' },
          vars: { test: `value${result.testIdx}` },
          response: { output: `Response ${result.testIdx}` },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'Test passed',
            comment: result.comment,
            namedScores: {},
            tokensUsed: { total: 10, prompt: 5, completion: 5 },
            componentResults: [],
          },
          namedScores: {},
          cost: 0.007,
          metadata: {},
        } as EvaluateResult);
      }

      const { testIndices, filteredCount } = await queryTestIndicesOptimized(eval_.id, {
        filterMode: 'highlights',
      });

      expect(filteredCount).toBe(2);
      expect(testIndices).toEqual([0, 2]);
    });

    it('should handle large datasets efficiently', async () => {
      const eval_ = await EvalFactory.create({ numResults: 0 });

      // Add 100 results, every 5th one is highlighted
      for (let i = 0; i < 100; i++) {
        const isHighlighted = i % 5 === 0;
        await eval_.addResult({
          description: `test-${i}`,
          promptIdx: 0,
          testIdx: i,
          testCase: { vars: { test: `value${i}` } },
          promptId: 'test-prompt',
          provider: { id: 'test-provider', label: 'test-label' },
          prompt: { raw: 'Test prompt', label: 'Test prompt' },
          vars: { test: `value${i}` },
          response: { output: `Response ${i}` },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'Test passed',
            comment: isHighlighted ? `!highlight Item ${i}` : `Regular item ${i}`,
            namedScores: {},
            tokensUsed: { total: 10, prompt: 5, completion: 5 },
            componentResults: [],
          },
          namedScores: {},
          cost: 0.007,
          metadata: {},
        } as EvaluateResult);
      }

      const startTime = Date.now();
      const { testIndices, filteredCount } = await queryTestIndicesOptimized(eval_.id, {
        filterMode: 'highlights',
        limit: 10,
      });
      const duration = Date.now() - startTime;

      // Should have 20 highlighted items (0, 5, 10, 15, ...)
      expect(filteredCount).toBe(20);
      expect(testIndices).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45]);

      // Query should be fast (typically under 100ms for 100 items)
      expect(duration).toBeLessThan(500);
    });

    it('should work with search query in optimized mode', async () => {
      const eval_ = await EvalFactory.create({ numResults: 0 });

      const testData = [
        { testIdx: 0, comment: '!highlight Contains target', output: 'Response with target' },
        { testIdx: 1, comment: '!highlight No match', output: 'Different response' },
        { testIdx: 2, comment: 'Regular comment', output: 'Contains target' },
        { testIdx: 3, comment: '!highlight Also has target', output: 'Another target' },
      ];

      for (const data of testData) {
        await eval_.addResult({
          description: `test-${data.testIdx}`,
          promptIdx: 0,
          testIdx: data.testIdx,
          testCase: { vars: { test: `value${data.testIdx}` } },
          promptId: 'test-prompt',
          provider: { id: 'test-provider', label: 'test-label' },
          prompt: { raw: 'Test prompt', label: 'Test prompt' },
          vars: { test: `value${data.testIdx}` },
          response: { output: data.output },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'Test passed',
            comment: data.comment,
            namedScores: {},
            tokensUsed: { total: 10, prompt: 5, completion: 5 },
            componentResults: [],
          },
          namedScores: {},
          cost: 0.007,
          metadata: {},
        } as EvaluateResult);
      }

      // Test 1: With highlights filter and no filters array, search should apply
      const withSearch = await queryTestIndicesOptimized(eval_.id, {
        filterMode: 'highlights',
        searchQuery: 'target',
      });

      // Search in response field for 'target' AND highlights filter
      // Indices 0 and 3 have both !highlight and 'target' in output
      expect(withSearch.filteredCount).toBe(2);
      expect(withSearch.testIndices).toEqual([0, 3]);

      // Test 2: With highlights filter but empty filters array, search should still apply
      const withEmptyFilters = await queryTestIndicesOptimized(eval_.id, {
        filterMode: 'highlights',
        searchQuery: 'target',
        filters: [],
      });

      expect(withEmptyFilters.filteredCount).toBe(2);
      expect(withEmptyFilters.testIndices).toEqual([0, 3]);
    });

    it('should handle pagination correctly in optimized mode', async () => {
      const eval_ = await EvalFactory.create({ numResults: 0 });

      // Add 15 highlighted results
      for (let i = 0; i < 15; i++) {
        await eval_.addResult({
          description: `test-${i}`,
          promptIdx: 0,
          testIdx: i,
          testCase: { vars: { test: `value${i}` } },
          promptId: 'test-prompt',
          provider: { id: 'test-provider', label: 'test-label' },
          prompt: { raw: 'Test prompt', label: 'Test prompt' },
          vars: { test: `value${i}` },
          response: { output: `Response ${i}` },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'Test passed',
            comment: `!highlight Important ${i}`,
            namedScores: {},
            tokensUsed: { total: 10, prompt: 5, completion: 5 },
            componentResults: [],
          },
          namedScores: {},
          cost: 0.007,
          metadata: {},
        } as EvaluateResult);
      }

      // Get three pages
      const page1 = await queryTestIndicesOptimized(eval_.id, {
        filterMode: 'highlights',
        offset: 0,
        limit: 5,
      });

      const page2 = await queryTestIndicesOptimized(eval_.id, {
        filterMode: 'highlights',
        offset: 5,
        limit: 5,
      });

      const page3 = await queryTestIndicesOptimized(eval_.id, {
        filterMode: 'highlights',
        offset: 10,
        limit: 5,
      });

      expect(page1.filteredCount).toBe(15);
      expect(page1.testIndices).toEqual([0, 1, 2, 3, 4]);

      expect(page2.filteredCount).toBe(15);
      expect(page2.testIndices).toEqual([5, 6, 7, 8, 9]);

      expect(page3.filteredCount).toBe(15);
      expect(page3.testIndices).toEqual([10, 11, 12, 13, 14]);
    });

    it('should handle empty results gracefully in optimized mode', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 3,
        resultTypes: ['success', 'failure'],
      });

      // No highlights in the default factory data
      const { testIndices, filteredCount } = await queryTestIndicesOptimized(eval_.id, {
        filterMode: 'highlights',
      });

      expect(filteredCount).toBe(0);
      expect(testIndices).toEqual([]);
    });

    it('should verify SQL injection safety in optimized mode', async () => {
      const eval_ = await EvalFactory.create({ numResults: 0 });

      // Add a highlighted result
      await eval_.addResult({
        description: 'test-safe',
        promptIdx: 0,
        testIdx: 0,
        testCase: { vars: { test: 'value' } },
        promptId: 'test-prompt',
        provider: { id: 'test-provider', label: 'test-label' },
        prompt: { raw: 'Test prompt', label: 'Test prompt' },
        vars: { test: 'value' },
        response: { output: 'Safe response without injection text' },
        error: null,
        failureReason: ResultFailureReason.NONE,
        success: true,
        score: 1,
        latencyMs: 100,
        gradingResult: {
          pass: true,
          score: 1,
          reason: 'Test passed',
          comment: '!highlight Safe result',
          namedScores: {},
          tokensUsed: { total: 10, prompt: 5, completion: 5 },
          componentResults: [],
        },
        namedScores: {},
        cost: 0.007,
        metadata: {},
      } as EvaluateResult);

      // Try SQL injection in search query
      const maliciousSearch = "'; DROP TABLE eval_results; --";
      const { filteredCount } = await queryTestIndicesOptimized(eval_.id, {
        filterMode: 'highlights',
        searchQuery: maliciousSearch,
      });

      // Should still work without errors - the search won't find matches but highlights filter still applies
      // The SQL injection attempt is safely sanitized and won't match the response text
      // But the highlight filter will still return the highlighted result
      expect(filteredCount).toBe(0); // No results match the malicious search string

      // Test that highlights filter alone still works after attempted injection
      const justHighlights = await queryTestIndicesOptimized(eval_.id, {
        filterMode: 'highlights',
      });
      expect(justHighlights.filteredCount).toBe(1);
      expect(justHighlights.testIndices).toEqual([0]);
    });
  });

  describe('Integration with getTablePage', () => {
    it('should filter highlights correctly through getTablePage', async () => {
      const eval_ = await EvalFactory.create({ numResults: 0 });

      // Add mixed results
      for (let i = 0; i < 6; i++) {
        const isHighlighted = i % 2 === 0;
        await eval_.addResult({
          description: `test-${i}`,
          promptIdx: 0,
          testIdx: i,
          testCase: { vars: { test: `value${i}` } },
          promptId: 'test-prompt',
          provider: { id: 'test-provider', label: 'test-label' },
          prompt: { raw: 'Test prompt', label: 'Test prompt' },
          vars: { test: `value${i}` },
          response: { output: `Response ${i}` },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'Test passed',
            comment: isHighlighted ? `!highlight Important ${i}` : `Regular ${i}`,
            namedScores: {},
            tokensUsed: { total: 10, prompt: 5, completion: 5 },
            componentResults: [],
          },
          namedScores: {},
          cost: 0.007,
          metadata: {},
        } as EvaluateResult);
      }

      const result = await eval_.getTablePage({
        filterMode: 'highlights',
        filters: [],
      });

      // Should have 3 highlighted results (0, 2, 4)
      expect(result.filteredCount).toBe(3);
      expect(result.body.length).toBe(3);

      // Verify the test indices in the body
      const testIndices = result.body.map((row) => row.testIdx);
      expect(testIndices).toEqual([0, 2, 4]);

      // Verify each result has the highlight comment
      for (const row of result.body) {
        const hasHighlight = row.outputs.some((output) =>
          output.gradingResult?.comment?.startsWith('!highlight'),
        );
        expect(hasHighlight).toBe(true);
      }
    });

    it('should maintain correct counts with highlights filter', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 10,
        resultTypes: ['success', 'failure'],
        withHighlights: true, // This adds highlights to every 3rd result
      });

      const allResults = await eval_.getTablePage({ filters: [] });
      const highlightedResults = await eval_.getTablePage({
        filterMode: 'highlights',
        filters: [],
      });

      // Total count should remain the same
      expect(highlightedResults.totalCount).toBe(allResults.totalCount);

      // Filtered count should be less than total
      expect(highlightedResults.filteredCount).toBeLessThan(highlightedResults.totalCount);

      // With factory settings, every 3rd result is highlighted (0, 3, 6, 9)
      expect(highlightedResults.filteredCount).toBe(4);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle results with undefined comment field', async () => {
      const eval_ = await EvalFactory.create({ numResults: 0 });
      const db = getDb();

      // Insert result with grading_result but no comment field
      await db.run(`
        INSERT INTO eval_results (
          id, eval_id, prompt_idx, test_idx, test_case, prompt, provider,
          success, score, grading_result
        ) VALUES (
          'test1', '${eval_.id}', 0, 0, '{}', '{}', '{}', 1, 1.0,
          '{"pass": true, "score": 1, "reason": "Test"}'
        )
      `);

      const { testIndices, filteredCount } = await (eval_ as any).queryTestIndices({
        filterMode: 'highlights',
      });

      expect(filteredCount).toBe(0);
      expect(testIndices).toEqual([]);
    });

    it('should handle special characters in highlight comments', async () => {
      const eval_ = await EvalFactory.create({ numResults: 0 });

      const specialComments = [
        { testIdx: 0, comment: `!highlight With 'quotes'` },
        { testIdx: 1, comment: `!highlight With "double quotes"` },
        { testIdx: 2, comment: `!highlight With % percent` },
        { testIdx: 3, comment: `!highlight With _ underscore` },
        { testIdx: 4, comment: `!highlight With \\ backslash` },
      ];

      for (const data of specialComments) {
        await eval_.addResult({
          description: `test-${data.testIdx}`,
          promptIdx: 0,
          testIdx: data.testIdx,
          testCase: { vars: { test: `value${data.testIdx}` } },
          promptId: 'test-prompt',
          provider: { id: 'test-provider', label: 'test-label' },
          prompt: { raw: 'Test prompt', label: 'Test prompt' },
          vars: { test: `value${data.testIdx}` },
          response: { output: `Response ${data.testIdx}` },
          error: null,
          failureReason: ResultFailureReason.NONE,
          success: true,
          score: 1,
          latencyMs: 100,
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'Test passed',
            comment: data.comment,
            namedScores: {},
            tokensUsed: { total: 10, prompt: 5, completion: 5 },
            componentResults: [],
          },
          namedScores: {},
          cost: 0.007,
          metadata: {},
        } as EvaluateResult);
      }

      const { testIndices, filteredCount } = await (eval_ as any).queryTestIndices({
        filterMode: 'highlights',
      });

      // All should be matched despite special characters
      expect(filteredCount).toBe(5);
      expect(testIndices).toEqual([0, 1, 2, 3, 4]);
    });

    it('should handle concurrent access to highlights filter', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 20,
        resultTypes: ['success', 'failure'],
        withHighlights: true,
      });

      // Run multiple queries concurrently
      const promises = Array.from({ length: 5 }, () =>
        (eval_ as any).queryTestIndices({ filterMode: 'highlights' }),
      );

      const results = await Promise.all(promises);

      // All concurrent queries should return the same results
      const firstResult = results[0];
      for (const result of results) {
        expect(result.filteredCount).toBe(firstResult.filteredCount);
        expect(result.testIndices).toEqual(firstResult.testIndices);
      }
    });
  });
});
