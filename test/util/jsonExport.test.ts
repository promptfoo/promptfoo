import * as fs from 'fs';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as blobs from '../../src/blobs';
import { getTraceStore } from '../../src/tracing/store';
import { writeOutput } from '../../src/util/index';
import { createTempDir, mockProcessEnv, removeTempDir } from './utils';

// Mock dependencies
vi.mock('../../src/database', () => ({
  getDb: vi.fn().mockReturnValue({
    select: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(),
  }),
}));

vi.mock('../../src/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('JSON export with improved error handling', () => {
  let tempDir: string;
  let tempFilePath: string;
  let mockEval: any;

  beforeEach(() => {
    tempDir = createTempDir('promptfoo-json-test-');
    tempFilePath = path.join(tempDir, 'test-export.json');

    mockEval = {
      id: 'test-eval-id',
      createdAt: '2025-01-01T00:00:00.000Z',
      author: 'test-author',
      config: { testConfig: true },
      prompts: [
        { raw: 'Test prompt 1', label: 'prompt1' },
        { raw: 'Test prompt 2', label: 'prompt2' },
      ],
      toEvaluateSummary: vi.fn(),
      getResultsCount: vi.fn(),
    };
  });

  afterEach(() => {
    removeTempDir(tempDir);
    vi.clearAllMocks();
  });

  describe('normal JSON export', () => {
    beforeEach(() => {
      mockEval.toEvaluateSummary.mockResolvedValue({
        version: 3,
        timestamp: '2025-01-01T00:00:00.000Z',
        prompts: mockEval.prompts,
        results: [
          { testIdx: 0, promptIdx: 0, success: true, score: 1.0 },
          { testIdx: 1, promptIdx: 0, success: true, score: 0.9 },
        ],
        stats: {
          successes: 2,
          failures: 0,
          tokenUsage: { total: 100, prompt: 50, completion: 50 },
        },
      });
    });

    it('should export JSON successfully', async () => {
      await writeOutput(tempFilePath, mockEval, 'https://share.url');

      expect(fs.existsSync(tempFilePath)).toBe(true);
      const content = fs.readFileSync(tempFilePath, 'utf8');
      const parsed = JSON.parse(content);

      // Verify structure matches expected OutputFile format
      expect(parsed).toHaveProperty('evalId', 'test-eval-id');
      expect(parsed).toHaveProperty('results');
      expect(parsed.results).toHaveProperty('version', 3);
      expect(parsed.results.results).toHaveLength(2);
      expect(parsed).toHaveProperty('config', { testConfig: true });
      expect(parsed).toHaveProperty('shareableUrl', 'https://share.url');
      expect(parsed).toHaveProperty('metadata');
    });

    it('should export persisted vars and runtime options for round-trip imports', async () => {
      mockEval.vars = ['topic', 'tone'];
      mockEval.runtimeOptions = { cache: false, maxConcurrency: 2 };

      await writeOutput(tempFilePath, mockEval, null);

      const content = fs.readFileSync(tempFilePath, 'utf8');
      const parsed = JSON.parse(content);

      expect(parsed).toHaveProperty('vars', ['topic', 'tone']);
      expect(parsed).toHaveProperty('runtimeOptions', { cache: false, maxConcurrency: 2 });
    });

    it('should embed referenced blob bytes only when media export is enabled', async () => {
      const hash = 'a'.repeat(64);
      const data = Buffer.from('portable image');
      mockEval.toEvaluateSummary.mockResolvedValue({
        version: 3,
        timestamp: '2025-01-01T00:00:00.000Z',
        prompts: mockEval.prompts,
        results: [{ response: { output: `promptfoo://blob/${hash}` } }],
        stats: { successes: 1, failures: 0 },
      });
      vi.spyOn(blobs, 'getBlobByHash').mockResolvedValue({
        data,
        metadata: {
          mimeType: 'image/png',
          sizeBytes: data.length,
          createdAt: '2025-01-01T00:00:00.000Z',
          provider: 'filesystem',
          key: hash,
        },
      });

      await writeOutput(tempFilePath, mockEval, null);
      expect(JSON.parse(fs.readFileSync(tempFilePath, 'utf8'))).not.toHaveProperty('blobAssets');

      await writeOutput(tempFilePath, mockEval, null, { includeMedia: true });
      const parsed = JSON.parse(fs.readFileSync(tempFilePath, 'utf8'));
      expect(parsed.blobAssets).toEqual([
        {
          hash,
          mimeType: 'image/png',
          sizeBytes: data.length,
          data: data.toString('base64'),
        },
      ]);
    });

    it('should embed blob bytes referenced only by exported traces', async () => {
      const hash = 'b'.repeat(64);
      const data = Buffer.from('portable trace image');
      const traceSpy = vi.spyOn(getTraceStore(), 'getTracesByEvaluation').mockResolvedValue([
        {
          traceId: 'trace-media-export',
          evaluationId: mockEval.id,
          testCaseId: 'trace-media-case',
          metadata: { attachment: `promptfoo://blob/${hash}` },
          spans: [],
        },
      ]);
      vi.spyOn(blobs, 'getBlobByHash').mockResolvedValue({
        data,
        metadata: {
          mimeType: 'image/png',
          sizeBytes: data.length,
          createdAt: '2025-01-01T00:00:00.000Z',
          provider: 'filesystem',
          key: hash,
        },
      });

      try {
        await writeOutput(tempFilePath, mockEval, null, { includeMedia: true });

        const parsed = JSON.parse(fs.readFileSync(tempFilePath, 'utf8'));
        expect(parsed.traces[0].metadata.attachment).toBe(`promptfoo://blob/${hash}`);
        expect(parsed.blobAssets).toEqual([
          {
            hash,
            mimeType: 'image/png',
            sizeBytes: data.length,
            data: data.toString('base64'),
          },
        ]);
      } finally {
        traceSpy.mockRestore();
      }
    });

    it('should not embed response blob bytes when response output stripping is enabled', async () => {
      const restoreEnv = mockProcessEnv({ PROMPTFOO_STRIP_RESPONSE_OUTPUT: 'true' });
      const hash = 'c'.repeat(64);
      const getBlobSpy = vi.spyOn(blobs, 'getBlobByHash');
      mockEval.toEvaluateSummary.mockResolvedValue({
        version: 3,
        timestamp: '2025-01-01T00:00:00.000Z',
        prompts: mockEval.prompts,
        results: [
          {
            response: {
              output: '[output stripped]',
              metadata: { blobUris: [`promptfoo://blob/${hash}`] },
            },
          },
        ],
        stats: { successes: 1, failures: 0 },
      });

      try {
        await writeOutput(tempFilePath, mockEval, null, { includeMedia: true });

        const parsed = JSON.parse(fs.readFileSync(tempFilePath, 'utf8'));
        expect(parsed.results.results[0].response.metadata.blobUris).toBeUndefined();
        expect(parsed).not.toHaveProperty('blobAssets');
        expect(getBlobSpy).not.toHaveBeenCalled();
      } finally {
        getBlobSpy.mockRestore();
        restoreEnv();
      }
    });

    it('should handle null shareableUrl', async () => {
      await writeOutput(tempFilePath, mockEval, null);

      const content = fs.readFileSync(tempFilePath, 'utf8');
      const parsed = JSON.parse(content);

      expect(parsed.shareableUrl).toBeNull();
    });

    it('should maintain proper JSON formatting', async () => {
      await writeOutput(tempFilePath, mockEval, 'https://test.url');

      const content = fs.readFileSync(tempFilePath, 'utf8');

      // Verify proper 2-space indentation
      expect(content).toContain('{\n  "evalId":');
      expect(content).toContain('  "results": {');
      expect(content).toContain('    "version":');

      // Should be valid JSON
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('should include all required metadata fields', async () => {
      await writeOutput(tempFilePath, mockEval, 'https://test.url');

      const content = fs.readFileSync(tempFilePath, 'utf8');
      const parsed = JSON.parse(content);

      expect(parsed.metadata).toHaveProperty('promptfooVersion');
      expect(parsed.metadata).toHaveProperty('nodeVersion');
      expect(parsed.metadata).toHaveProperty('platform');
      expect(parsed.metadata).toHaveProperty('exportedAt');
      expect(parsed.metadata).toHaveProperty('author', 'test-author');
    });
  });

  describe('memory limit error handling', () => {
    beforeEach(() => {
      mockEval.getResultsCount.mockResolvedValue(50000);
      mockEval.toEvaluateSummary.mockImplementation(() => {
        throw new RangeError('Invalid string length');
      });
    });

    it('should handle RangeError gracefully with helpful message', async () => {
      await expect(writeOutput(tempFilePath, mockEval, null)).rejects.toThrow(
        'Dataset too large for JSON export',
      );

      await expect(writeOutput(tempFilePath, mockEval, null)).rejects.toThrow(
        'Consider using JSONL format instead',
      );
    });

    it('should include result count in error message', async () => {
      await expect(writeOutput(tempFilePath, mockEval, null)).rejects.toThrow('50000 results');
    });

    it('should not create output file when memory error occurs', async () => {
      try {
        await writeOutput(tempFilePath, mockEval, null);
      } catch (_error) {
        // Expected to throw
      }

      expect(fs.existsSync(tempFilePath)).toBe(false);
    });
  });

  describe('other error handling', () => {
    it('should propagate non-RangeError exceptions', async () => {
      const testError = new Error('Database connection failed');
      mockEval.toEvaluateSummary.mockRejectedValue(testError);

      await expect(writeOutput(tempFilePath, mockEval, null)).rejects.toThrow(
        'Database connection failed',
      );
    });

    it('should handle file system errors', async () => {
      // Use a path that will definitely fail - writing to a file that already exists as a directory
      const dirAsFile = path.join(tempDir, 'directory-as-file');
      fs.mkdirSync(dirAsFile);
      const invalidPath = dirAsFile; // Try to write to a directory path as if it were a file

      mockEval.toEvaluateSummary.mockResolvedValue({
        version: 3,
        results: [],
        stats: { successes: 0, failures: 0 },
      });

      await expect(writeOutput(invalidPath, mockEval, null)).rejects.toThrow();
    });
  });

  describe('backward compatibility', () => {
    it('should maintain exact same JSON structure as original implementation', async () => {
      const expectedSummary = {
        version: 3,
        timestamp: '2025-01-01T00:00:00.000Z',
        prompts: [
          { raw: 'Test prompt 1', label: 'prompt1' },
          { raw: 'Test prompt 2', label: 'prompt2' },
        ],
        results: [
          {
            testIdx: 0,
            promptIdx: 0,
            success: true,
            score: 1.0,
            vars: { input: 'test' },
            output: 'response',
          },
        ],
        stats: {
          successes: 1,
          failures: 0,
          errors: 0,
          tokenUsage: { total: 100, prompt: 50, completion: 50 },
        },
      };

      mockEval.toEvaluateSummary.mockResolvedValue(expectedSummary);

      await writeOutput(tempFilePath, mockEval, 'https://share.url');

      const content = fs.readFileSync(tempFilePath, 'utf8');
      const parsed = JSON.parse(content);

      // Verify exact structure
      expect(Object.keys(parsed).sort()).toEqual(
        ['evalId', 'results', 'config', 'shareableUrl', 'metadata'].sort(),
      );

      expect(parsed.results).toEqual(expectedSummary);
    });

    it('should handle both EvaluateSummaryV2 and V3 formats', async () => {
      const v2Summary = {
        version: 2,
        timestamp: '2025-01-01T00:00:00.000Z',
        results: [{ testIdx: 0, success: true }],
        table: { head: { prompts: [], vars: [] }, body: [] },
        stats: { successes: 1, failures: 0 },
      };

      mockEval.toEvaluateSummary.mockResolvedValue(v2Summary);

      await writeOutput(tempFilePath, mockEval, null);

      const content = fs.readFileSync(tempFilePath, 'utf8');
      const parsed = JSON.parse(content);

      expect(parsed.results.version).toBe(2);
      expect(parsed.results).toHaveProperty('table');
      expect(parsed.results.results).toEqual([{ testIdx: 0, success: true }]);
    });
  });

  describe('performance considerations', () => {
    it('should complete export in reasonable time for moderate datasets', async () => {
      // Create a moderate-sized dataset
      const moderateResults = Array.from({ length: 1000 }, (_, i) => ({
        testIdx: i,
        promptIdx: 0,
        success: true,
        score: Math.random(),
        vars: { input: `test input ${i}` },
        output: `test output ${i}`,
      }));

      mockEval.toEvaluateSummary.mockResolvedValue({
        version: 3,
        timestamp: '2025-01-01T00:00:00.000Z',
        prompts: mockEval.prompts,
        results: moderateResults,
        stats: { successes: 1000, failures: 0 },
      });

      const startTime = Date.now();
      await writeOutput(tempFilePath, mockEval, null);
      const duration = Date.now() - startTime;

      // Should complete within reasonable time (5 seconds for 1000 results)
      expect(duration).toBeLessThan(5000);

      // Verify file was created and has content
      expect(fs.existsSync(tempFilePath)).toBe(true);
      const stats = fs.statSync(tempFilePath);
      expect(stats.size).toBeGreaterThan(1000); // Should have substantial content
    }, 10000); // 10 second timeout
  });
});
