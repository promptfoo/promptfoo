import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { writeOutput } from '../../src/util';

// Mock dependencies
jest.mock('../../src/database', () => ({
  getDb: jest.fn().mockReturnValue({
    select: jest.fn(),
    insert: jest.fn(),
    transaction: jest.fn(),
  }),
}));

jest.mock('../../src/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

describe('JSON export with improved error handling', () => {
  let tempDir: string;
  let tempFilePath: string;
  let mockEval: any;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-json-test-'));
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
      toEvaluateSummary: jest.fn(),
      getResultsCount: jest.fn(),
    };
  });

  afterEach(() => {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
    jest.clearAllMocks();
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
