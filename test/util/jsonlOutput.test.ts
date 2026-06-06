import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeOutput } from '../../src/util/index';
import { createTempDir, removeTempDir } from './utils';

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

describe('JSONL output with proper line endings', () => {
  let tempDir: string;
  let tempFilePath: string;
  let mockEval: any;

  beforeEach(() => {
    tempDir = createTempDir('promptfoo-jsonl-test-');
    tempFilePath = path.join(tempDir, 'test-export.jsonl');

    mockEval = {
      id: 'test-eval-id',
      createdAt: '2025-01-01T00:00:00.000Z',
      author: 'test-author',
      config: { testConfig: true },
      prompts: [
        { raw: 'Test prompt 1', label: 'prompt1' },
        { raw: 'Test prompt 2', label: 'prompt2' },
      ],
      fetchResultsBatched: vi.fn(),
    };
  });

  afterEach(() => {
    removeTempDir(tempDir);
    vi.clearAllMocks();
  });

  it('should produce valid JSONL with proper line endings between batches', async () => {
    // Mock fetchResultsBatched to return multiple batches
    const batch1 = [
      { testIdx: 0, success: true, score: 1.0, output: 'result 1' },
      { testIdx: 1, success: true, score: 0.9, output: 'result 2' },
    ];
    const batch2 = [
      { testIdx: 2, success: true, score: 0.8, output: 'result 3' },
      { testIdx: 3, success: false, score: 0.0, output: 'result 4' },
    ];

    // Create async iterator for batches
    const batchIterator = [batch1, batch2];

    mockEval.fetchResultsBatched = vi.fn().mockImplementation(async function* () {
      for (const batch of batchIterator) {
        yield batch;
      }
    });

    await writeOutput(tempFilePath, mockEval, null);

    expect(fs.existsSync(tempFilePath)).toBe(true);
    const content = fs.readFileSync(tempFilePath, 'utf8');

    // Split by lines and filter out empty lines
    const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');

    // Should have exactly 4 JSON objects (2 per batch)
    expect(lines).toHaveLength(4);

    // Each line should be valid JSON
    lines.forEach((line, index) => {
      expect(() => JSON.parse(line)).not.toThrow();
      const parsed = JSON.parse(line);
      expect(parsed).toHaveProperty('testIdx', index);
      expect(parsed).toHaveProperty('output', `result ${index + 1}`);
    });

    // File should end with a newline
    expect(content.endsWith('\n')).toBe(true);
  });

  it('should handle single batch correctly', async () => {
    const singleBatch = [{ testIdx: 0, success: true, score: 1.0, output: 'single result' }];

    mockEval.fetchResultsBatched = vi.fn().mockImplementation(async function* () {
      yield singleBatch;
    });

    await writeOutput(tempFilePath, mockEval, null);

    const content = fs.readFileSync(tempFilePath, 'utf8');
    const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');

    expect(lines).toHaveLength(1);
    expect(() => JSON.parse(lines[0])).not.toThrow();
    expect(content.endsWith('\n')).toBe(true);
  });

  it('should handle empty batches gracefully', async () => {
    mockEval.fetchResultsBatched = vi.fn().mockImplementation(async function* () {
      yield [];
      yield [{ testIdx: 0, success: true, score: 1.0, output: 'after empty' }];
      yield [];
    });

    await writeOutput(tempFilePath, mockEval, null);

    const content = fs.readFileSync(tempFilePath, 'utf8');
    const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');

    expect(lines).toHaveLength(1);
    expect(() => JSON.parse(lines[0])).not.toThrow();
    const parsed = JSON.parse(lines[0]);
    expect(parsed.output).toBe('after empty');
  });

  it('should use OS-specific line endings', async () => {
    const batch = [{ testIdx: 0, success: true, score: 1.0, output: 'test result' }];

    mockEval.fetchResultsBatched = vi.fn().mockImplementation(async function* () {
      yield batch;
    });

    await writeOutput(tempFilePath, mockEval, null);

    const content = fs.readFileSync(tempFilePath, 'utf8');

    // Content should end with the OS-specific line ending
    expect(content.endsWith(os.EOL)).toBe(true);

    // For multiple results, should use OS line endings between them
    const multiResultBatch = [
      { testIdx: 0, success: true, score: 1.0, output: 'result 1' },
      { testIdx: 1, success: true, score: 0.9, output: 'result 2' },
    ];

    mockEval.fetchResultsBatched = vi.fn().mockImplementation(async function* () {
      yield multiResultBatch;
    });

    // Clear the file
    fs.unlinkSync(tempFilePath);

    await writeOutput(tempFilePath, mockEval, null);

    const multiContent = fs.readFileSync(tempFilePath, 'utf8');
    const expectedContent =
      multiResultBatch.map((result) => JSON.stringify(result)).join(os.EOL) + os.EOL;

    expect(multiContent).toBe(expectedContent);
  });

  it('should preserve the existing artifact when a rewrite fails', async () => {
    fs.writeFileSync(tempFilePath, '{"status":"existing"}\n');
    mockEval.fetchResultsBatched = vi.fn().mockImplementation(async function* () {
      yield [{ testIdx: 0, success: true, score: 1.0, output: 'replacement' }];
      throw new Error('simulated rewrite failure');
    });

    await expect(writeOutput(tempFilePath, mockEval, null)).rejects.toThrow(
      'simulated rewrite failure',
    );

    expect(fs.readFileSync(tempFilePath, 'utf8')).toBe('{"status":"existing"}\n');
    expect(fs.readdirSync(tempDir)).toEqual(['test-export.jsonl']);
  });

  it('should preserve existing artifact permissions during a rewrite', async () => {
    if (process.platform === 'win32') {
      return;
    }

    fs.writeFileSync(tempFilePath, '{"status":"existing"}\n', { mode: 0o644 });
    fs.chmodSync(tempFilePath, 0o644);
    mockEval.fetchResultsBatched = vi.fn().mockImplementation(async function* () {
      yield [{ testIdx: 0, success: true, score: 1.0, output: 'replacement' }];
    });

    const originalUmask = process.umask(0o077);
    try {
      await writeOutput(tempFilePath, mockEval, null);
    } finally {
      process.umask(originalUmask);
    }

    expect(fs.statSync(tempFilePath).mode & 0o777).toBe(0o644);
  });

  it('should preserve an existing artifact symlink during a rewrite', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const targetPath = path.join(tempDir, 'target.jsonl');
    fs.writeFileSync(targetPath, '{"status":"existing"}\n');
    fs.symlinkSync(targetPath, tempFilePath);
    mockEval.fetchResultsBatched = vi.fn().mockImplementation(async function* () {
      yield [{ testIdx: 0, success: true, score: 1.0, output: 'replacement' }];
    });

    await writeOutput(tempFilePath, mockEval, null);

    expect(fs.lstatSync(tempFilePath).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(targetPath, 'utf8')).toContain('"output":"replacement"');
  });

  it('should preserve a dangling artifact symlink and create its target during a rewrite', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const targetPath = path.join(tempDir, 'missing-target.jsonl');
    fs.symlinkSync(path.basename(targetPath), tempFilePath);
    mockEval.fetchResultsBatched = vi.fn().mockImplementation(async function* () {
      yield [{ testIdx: 0, success: true, score: 1.0, output: 'replacement' }];
    });

    await writeOutput(tempFilePath, mockEval, null);

    expect(fs.lstatSync(tempFilePath).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(targetPath, 'utf8')).toContain('"output":"replacement"');
  });

  it('should rewrite an artifact with a long valid basename', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const longFilePath = path.join(tempDir, `${'a'.repeat(240)}.jsonl`);
    mockEval.fetchResultsBatched = vi.fn().mockImplementation(async function* () {
      yield [{ testIdx: 0, success: true, score: 1.0, output: 'replacement' }];
    });

    await writeOutput(longFilePath, mockEval, null);

    expect(fs.readFileSync(longFilePath, 'utf8')).toContain('"output":"replacement"');
  });
});
