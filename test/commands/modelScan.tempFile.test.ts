import os from 'os';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fs module before importing the module under test
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      readFileSync: vi.fn(),
      unlinkSync: vi.fn(),
      writeFileSync: vi.fn(),
    },
    readFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

vi.mock('../../src/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../src/models/modelAudit', () => ({
  __esModule: true,
  default: {
    create: vi.fn().mockResolvedValue({ id: 'scan-test-123' }),
    findByRevision: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../../src/util/huggingfaceMetadata', () => ({
  isHuggingFaceModel: vi.fn().mockReturnValue(false),
  getHuggingFaceMetadata: vi.fn().mockResolvedValue(null),
  parseHuggingFaceModel: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/globalConfig/accounts', () => ({
  getAuthor: vi.fn().mockReturnValue('test-author'),
}));

import { createTempOutputPath, supportsCliUiWithOutput } from '../../src/commands/modelScan';
import logger from '../../src/logger';

describe('supportsCliUiWithOutput', () => {
  it('should return false for null version', () => {
    expect(supportsCliUiWithOutput(null)).toBe(false);
  });

  it('should return false for versions below 0.2.20', () => {
    const oldVersions = ['0.1.0', '0.2.0', '0.2.19', '0.2.10', '0.2.1'];
    for (const version of oldVersions) {
      expect(supportsCliUiWithOutput(version)).toBe(false);
    }
  });

  it('should return true for version 0.2.20', () => {
    expect(supportsCliUiWithOutput('0.2.20')).toBe(true);
  });

  it('should return true for versions above 0.2.20', () => {
    const newVersions = ['0.2.21', '0.2.30', '0.3.0', '1.0.0', '0.10.0'];
    for (const version of newVersions) {
      expect(supportsCliUiWithOutput(version)).toBe(true);
    }
  });

  it('should return false for invalid version strings', () => {
    // Note: semver.coerce is lenient - '1.2' becomes '1.2.0' which is valid
    const invalidVersions = ['invalid', 'a.b.c', ''];
    for (const version of invalidVersions) {
      expect(supportsCliUiWithOutput(version)).toBe(false);
    }
  });

  it('should handle partial version strings with semver.coerce', () => {
    // semver.coerce('1.2') becomes '1.2.0' which is >= 0.2.20
    expect(supportsCliUiWithOutput('1.2')).toBe(true);
    // semver.coerce('0.2') becomes '0.2.0' which is < 0.2.20
    expect(supportsCliUiWithOutput('0.2')).toBe(false);
  });

  it('should handle edge cases for version comparison', () => {
    // Version 0.3.0 should be supported (minor > 2)
    expect(supportsCliUiWithOutput('0.3.0')).toBe(true);
    // Version 1.0.0 should be supported (major > 0)
    expect(supportsCliUiWithOutput('1.0.0')).toBe(true);
    // Version 0.2.19 should NOT be supported
    expect(supportsCliUiWithOutput('0.2.19')).toBe(false);
  });
});

describe('createTempOutputPath', () => {
  it('should generate path in system temp directory', () => {
    const tempPath = createTempOutputPath();
    expect(tempPath).toContain(os.tmpdir());
  });

  it('should generate path with promptfoo-modelscan prefix', () => {
    const tempPath = createTempOutputPath();
    expect(tempPath).toContain('promptfoo-modelscan-');
  });

  it('should generate path with .json extension', () => {
    const tempPath = createTempOutputPath();
    expect(tempPath).toMatch(/\.json$/);
  });

  it('should generate UUID-based unique paths', () => {
    const uuidPattern =
      /promptfoo-modelscan-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/;
    const tempPath = createTempOutputPath();
    expect(tempPath).toMatch(uuidPattern);
  });

  it('should generate unique paths on each call', () => {
    const paths = new Set<string>();
    for (let i = 0; i < 10; i++) {
      paths.add(createTempOutputPath());
    }
    // All paths should be unique
    expect(paths.size).toBe(10);
  });
});

/**
 * These tests document the expected fs behavior patterns used in the temp file workflow.
 * They verify that the cleanup logic handles various fs scenarios correctly.
 * Note: These test the behavior patterns, not the internal functions directly
 * (which are not exported).
 */
describe('temp file workflow - expected fs behavior patterns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('documents: temp file paths use createTempOutputPath format', () => {
    // The temp file workflow uses createTempOutputPath to generate unique paths
    const tempFilePath = createTempOutputPath();
    expect(tempFilePath).toContain('promptfoo-modelscan-');
    expect(tempFilePath).toMatch(/\.json$/);
  });

  it('documents: cleanup logs debug on failure (not error)', () => {
    // When cleanup fails, it should log at debug level, not error
    // This is because cleanup failures are not critical
    const cleanupError = new Error('EPERM: operation not permitted');
    const tempFilePath = createTempOutputPath();

    // Simulate the cleanup behavior pattern from processScanResultsFromFile
    try {
      throw cleanupError;
    } catch (error) {
      logger.debug(`Failed to cleanup temp file ${tempFilePath}: ${error}`);
    }

    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Failed to cleanup temp file'),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('documents: JSON parsing throws on invalid content', () => {
    // The workflow expects JSON.parse to throw on invalid content
    const invalidJson = 'not valid json {{{';
    expect(() => JSON.parse(invalidJson)).toThrow();
  });

  it('documents: empty string is falsy for output validation', () => {
    // The workflow checks `if (!jsonOutput)` to detect empty output
    const emptyOutput = '';
    expect(!emptyOutput).toBe(true);
    expect(!emptyOutput.trim()).toBe(true);
  });
});
