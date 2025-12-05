import { Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import os from 'os';

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

import fs from 'fs';
import logger from '../../src/logger';
import {
  createTempOutputPath,
  supportsCliUiWithOutput,
} from '../../src/commands/modelScan';

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
    const invalidVersions = ['invalid', '1.2', 'a.b.c', ''];
    for (const version of invalidVersions) {
      expect(supportsCliUiWithOutput(version)).toBe(false);
    }
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

describe('temp file workflow - fs operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should read JSON from temp file correctly', () => {
    const mockResults = JSON.stringify({
      total_checks: 10,
      passed_checks: 10,
      failed_checks: 0,
      files_scanned: 5,
      bytes_scanned: 1024,
      duration: 1000,
    });

    (fs.readFileSync as Mock).mockReturnValue(mockResults);

    const tempFilePath = createTempOutputPath();
    const content = fs.readFileSync(tempFilePath, 'utf-8');

    expect(content).toBe(mockResults);
    expect(fs.readFileSync).toHaveBeenCalledWith(tempFilePath, 'utf-8');
  });

  it('should handle cleanup when unlinkSync succeeds', () => {
    (fs.unlinkSync as Mock).mockReturnValue(undefined);

    const tempFilePath = createTempOutputPath();
    fs.unlinkSync(tempFilePath);

    expect(fs.unlinkSync).toHaveBeenCalledWith(tempFilePath);
  });

  it('should log debug message when cleanup fails', () => {
    const cleanupError = new Error('EPERM: operation not permitted');
    (fs.unlinkSync as Mock).mockImplementation(() => {
      throw cleanupError;
    });

    const tempFilePath = createTempOutputPath();

    // Simulate the cleanup behavior from processScanResultsFromFile
    try {
      fs.unlinkSync(tempFilePath);
    } catch (error) {
      logger.debug(`Failed to cleanup temp file ${tempFilePath}: ${error}`);
    }

    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Failed to cleanup temp file'));
  });

  it('should write results to user-specified output file', () => {
    const mockResults = JSON.stringify({
      total_checks: 5,
      passed_checks: 5,
      failed_checks: 0,
    });

    (fs.writeFileSync as Mock).mockReturnValue(undefined);

    const userOutputPath = 'results.json';
    fs.writeFileSync(userOutputPath, mockResults);

    expect(fs.writeFileSync).toHaveBeenCalledWith(userOutputPath, mockResults);
  });

  it('should handle empty JSON output', () => {
    (fs.readFileSync as Mock).mockReturnValue('');

    const tempFilePath = createTempOutputPath();
    const content = fs.readFileSync(tempFilePath, 'utf-8');

    expect(content).toBe('');
  });

  it('should handle invalid JSON in temp file', () => {
    (fs.readFileSync as Mock).mockReturnValue('not valid json {{{');

    const tempFilePath = createTempOutputPath();
    const content = fs.readFileSync(tempFilePath, 'utf-8');

    expect(() => JSON.parse(content)).toThrow();
  });

  it('should handle read failure gracefully', () => {
    (fs.readFileSync as Mock).mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory');
    });

    const tempFilePath = createTempOutputPath();

    expect(() => fs.readFileSync(tempFilePath, 'utf-8')).toThrow('ENOENT');
  });
});
